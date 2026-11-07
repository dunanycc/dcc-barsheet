"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export default function SignInClient({ initialMessage = "" }: { initialMessage?: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);

  async function emailSignIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await signIn("approved-email", {
        email,
        redirect: false,
        redirectTo: "/",
      });
      if (result?.error) {
        const code = (result as { code?: string }).code;
        setMessage(code === "provider_required" ? "Administrator accounts must sign in with Google or Yahoo. Choose a logo below and use your approved admin email address." : "You aren't authorized to use the DCC Bar Schedule yet. You can request access below.");
        setBusy(false);
        return;
      }
      window.location.assign(result?.url || "/");
    } catch {
      setMessage("Sign-in could not be completed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-actions">
      <form onSubmit={(event) => void emailSignIn(event)}>
        <label htmlFor="approved-email">Approved email address</label>
        <input
          autoComplete="email"
          id="approved-email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
        <button className="button" disabled={busy} type="submit">
          {busy ? "Signing in…" : "Continue"}
        </button>
      </form>
      {message && <p className="auth-message" role="alert">{message}</p>}
      <p className="assurance-note">Administrators must sign in with Google or Yahoo using their approved email address.</p>
      <div className="auth-providers" role="group" aria-label="Sign in with an email provider">
        <button
          className="provider-button provider-google"
          onClick={() => void signIn("google", { redirectTo: "/" })}
          aria-label="Continue with Google"
          title="Continue with Google"
          disabled={busy}
          type="button"
        >
          <svg aria-hidden="true" data-provider-icon="google" focusable="false" viewBox="0 0 18 18">
            <path d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.715v2.259h2.909c1.703-1.568 2.684-3.879 2.684-6.614Z" fill="#4285F4" />
            <path d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.909-2.259c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.715H.956v2.332A9 9 0 0 0 9 18Z" fill="#34A853" />
            <path d="M3.963 10.704A5.41 5.41 0 0 1 3.681 9c0-.592.102-1.168.282-1.704V4.964H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.036l3.007-2.332Z" fill="#FBBC05" />
            <path d="M9 3.581c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.964l3.007 2.332C4.672 5.166 6.656 3.581 9 3.581Z" fill="#EA4335" />
          </svg>
        </button>
        <button
          className="provider-button provider-yahoo"
          onClick={() => void signIn("yahoo", { redirectTo: "/" })}
          aria-label="Continue with Yahoo"
          title="Continue with Yahoo"
          disabled={busy}
          type="button"
        >
          <svg aria-hidden="true" data-provider-icon="yahoo" focusable="false" viewBox="0 0 32 24">
            <text fill="#6001D2" fontFamily="Arial Black, Arial, sans-serif" fontSize="22" fontWeight="900" x="1" y="20">Y!</text>
          </svg>
        </button>
      </div>
    </div>
  );
}
