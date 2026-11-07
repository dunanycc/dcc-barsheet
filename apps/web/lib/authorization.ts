import { NextResponse } from "next/server";
import { auth } from "../auth";
import prisma from "./prisma";
import { canAdminister, canAuthenticate, sessionUserLookup } from "./auth-policy";

export class AuthorizationError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

export async function getCurrentUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: sessionUserLookup(id) });
  // Admin sessions must originate from a verified provider, including after promotion.
  if (user?.role === "ADMIN" && session.user.authProvider !== "google" && session.user.authProvider !== "yahoo") return null;
  return user && canAuthenticate(user) && user.authVersion === session.user.authVersion ? user : null;
}

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError(401, "Please sign in to use the DCC Bar Schedule.");
  return user;
}

export const requireMember = requireAuthenticatedUser;

export async function requireAdmin() {
  const user = await requireAuthenticatedUser();
  if (!canAdminister(user)) {
    throw new AuthorizationError(403, "Administrator access is required.");
  }
  return user;
}

export function authorizationResponse(error: unknown) {
  if (!(error instanceof AuthorizationError)) return null;
  return NextResponse.json({ error: error.message }, { status: error.status });
}

export async function authorizeMemberRequest() {
  try {
    return { ok: true as const, user: await requireMember() };
  } catch (error) {
    return {
      ok: false as const,
      response:
        authorizationResponse(error) ??
        NextResponse.json({ error: "Authorization failed." }, { status: 500 }),
    };
  }
}

export async function authorizeAdminRequest() {
  try {
    return { ok: true as const, user: await requireAdmin() };
  } catch (error) {
    return {
      ok: false as const,
      response:
        authorizationResponse(error) ??
        NextResponse.json({ error: "Authorization failed." }, { status: 500 }),
    };
  }
}
