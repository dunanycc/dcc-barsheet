import Image from "next/image";
import Link from "next/link";
import RequestAccessClient from "./request-access-client";

export default function RequestAccessPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Image alt="Dunany Country Club Bar Sign Up" height={80} src="/Barsheet%20sign%20up.png" width={80} priority />
        <p className="eyebrow">Dunany Country Club</p>
        <h1>Request DCC Bar Schedule access</h1>
        <p>An administrator will review your request before you can use the schedule.</p>
        <RequestAccessClient />
        <p className="auth-footnote"><Link href="/sign-in">Return to sign in</Link></p>
      </section>
    </main>
  );
}
