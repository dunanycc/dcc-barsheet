import { randomUUID } from "node:crypto";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { Yahoo } from "./lib/yahoo-provider";
import prisma from "./lib/prisma";
import { displayName, normalizeEmail } from "./lib/auth-policy";
import { authorizeApprovedEmail } from "./lib/approved-email-auth";
import { evaluateExternalIdentitySignIn } from "./lib/external-identity-auth";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

class ProviderRequiredError extends CredentialsSignin { code = "provider_required"; }

function externalLoginRejection(method: "GOOGLE" | "YAHOO") {
  return method === "YAHOO" ? "/sign-in?error=yahoo_not_authorized" : false;
}

async function recordRejectedLogin(email: string | null, method: string) {
  await prisma.auditEvent.create({
    data: {
      operationId: randomUUID(),
      actorEmailSnapshot: email,
      action: "LOGIN_REJECTED",
      entityType: "User",
      newData: { method },
    },
  });
}

async function activateAndAudit(userId: string, method: "GOOGLE" | "YAHOO" | "EMAIL") {
  const operationId = randomUUID();
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const activating = user.status === "APPROVED";
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        status: activating ? "ACTIVE" : user.status,
        activatedAt: activating ? user.activatedAt ?? new Date() : user.activatedAt,
        lastAuthenticatedAt: new Date(),
      },
    });
    const snapshot = {
      status: updated.status,
      role: updated.role,
      method,
    };
    if (activating) {
      await tx.auditEvent.create({
        data: {
          operationId,
          actorUserId: updated.id,
          actorNameSnapshot: displayName(updated),
          actorEmailSnapshot: updated.normalizedEmail,
          action: "USER_ACTIVATED",
          entityType: "User",
          entityId: updated.id,
          previousData: { status: "APPROVED" },
          newData: { status: "ACTIVE" },
        },
      });
    }
    await tx.auditEvent.create({
      data: {
        operationId,
        actorUserId: updated.id,
        actorNameSnapshot: displayName(updated),
        actorEmailSnapshot: updated.normalizedEmail,
        action: method === "GOOGLE" ? "LOGIN_GOOGLE" : method === "YAHOO" ? "LOGIN_YAHOO" : "LOGIN_EMAIL",
        entityType: "User",
        entityId: updated.id,
        newData: snapshot,
      },
    });
    return updated;
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  pages: { signIn: "/sign-in", error: "/sign-in" },
  providers: [
    Google({
      authorization: { params: { scope: "openid email profile" } },
    }),
    Yahoo({ clientId: process.env.AUTH_YAHOO_ID, clientSecret: process.env.AUTH_YAHOO_SECRET }),
    Credentials({
      id: "approved-email",
      name: "Approved email",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const result = await authorizeApprovedEmail(String(credentials.email ?? ""), {
          async findUser(email) {
            const user = await prisma.user.findUnique({ where: { normalizedEmail: email }, include: { identities: { where: { provider: { in: ["GOOGLE", "YAHOO"] } }, select: { provider: true } } } });
            return user ? { ...user, hasLinkedGoogleIdentity: user.identities.some((identity) => identity.provider === "GOOGLE"), hasLinkedYahooIdentity: user.identities.some((identity) => identity.provider === "YAHOO") } : null;
          },
          activate: (userId) => activateAndAudit(userId, "EMAIL"),
          async upsertEmailIdentity(activated) {
            await prisma.externalIdentity.upsert({ where: { provider_providerAccountId: { provider: "EMAIL_ASSERTION", providerAccountId: activated.normalizedEmail } },
              update: { lastUsedAt: new Date() }, create: { userId: activated.id, provider: "EMAIL_ASSERTION", providerAccountId: activated.normalizedEmail, verifiedEmail: activated.normalizedEmail, lastUsedAt: new Date() } });
          },
          recordRejected: recordRejectedLogin,
        });
        if (result.kind === "provider_required") throw new ProviderRequiredError();
        return result.kind === "authenticated" ? result.user : null;
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google" && account?.provider !== "yahoo") return true;
      const method = account.provider === "google" ? "GOOGLE" : "YAHOO";
      const email = normalizeEmail(String(profile?.email ?? user.email ?? ""));
      const verified = profile?.email_verified === true;
      const barsheetUser = email
        ? await prisma.user.findUnique({ where: { normalizedEmail: email } })
        : null;
      const existing = await prisma.externalIdentity.findUnique({
        where: {
          provider_providerAccountId: {
            provider: method,
            providerAccountId: account.providerAccountId,
          },
        },
      });
      const decision = evaluateExternalIdentitySignIn({ rawEmail: email, emailVerified: verified, user: barsheetUser, existingIdentityUserId: existing?.userId });
      if (decision.kind === "rejected") {
        await recordRejectedLogin(decision.email, method);
        return externalLoginRejection(method);
      }
      if (decision.kind === "identity_conflict") {
        await recordRejectedLogin(email, `${method}_IDENTITY_CONFLICT`);
        return externalLoginRejection(method);
      }
      try {
        if (existing) {
          await prisma.externalIdentity.update({ where: { id: existing.id }, data: { lastUsedAt: new Date(), verifiedEmail: email } });
        } else {
          await prisma.externalIdentity.create({ data: { userId: decision.user.id, provider: method, providerAccountId: account.providerAccountId, verifiedEmail: email, lastUsedAt: new Date() } });
        }
      } catch {
        await recordRejectedLogin(email, `${method}_IDENTITY_CONFLICT`);
        return externalLoginRejection(method);
      }
      const activated = await activateAndAudit(decision.user.id, method);
      user.id = activated.id;
      user.email = activated.normalizedEmail;
      user.name = displayName(activated);
      (user as typeof user & { authVersion: number }).authVersion = activated.authVersion;
      return true;
    },
    async jwt({ token, user, account }) {
      if (user?.id) {
        token.sub = user.id;
        token.authProvider = account?.provider;
        const current = await prisma.user.findUnique({ where: { id: user.id }, select: { authVersion: true } });
        token.authVersion = current?.authVersion ?? -1;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) { session.user.id = token.sub; session.user.authVersion = Number(token.authVersion ?? -1); session.user.authProvider = typeof token.authProvider === "string" ? token.authProvider : undefined; }
      return session;
    },
  },
});
