import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/authorization";
import SignInClient from "./sign-in-client";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  if (await getCurrentUser()) redirect("/");
  const error = (await searchParams).error;
  const initialMessage = error === "yahoo_not_authorized"
    ? "This Yahoo account is not authorized to use the DCC Bar Schedule. Ask an administrator to approve the same email address, or request access below."
    : error
      ? "Sign-in could not be completed. Please try again or request access below."
      : "";
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Image alt="Dunany Country Club Bar Sign Up" height={88} src="/Barsheet%20sign%20up.png" width={88} priority />
        <p className="eyebrow">Dunany Country Club</p>
        <h1>Sign in to DCC Bar Schedule</h1>
        <p>Enter the email address approved by the club to continue.</p>
        <SignInClient initialMessage={initialMessage} />
        <p className="auth-footnote">
          Not approved yet? <Link href="/request-access">Request access</Link>
        </p>
      </section>
    </main>
  );
}
