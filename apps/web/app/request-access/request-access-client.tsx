"use client";

import { FormEvent, useState } from "react";

export default function RequestAccessClient() {
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/access-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    const payload = (await response.json()) as { error?: string; state?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(payload.error || "Your request could not be submitted. Please try again.");
      return;
    }
    if (payload.state === "SIGN_IN") {
      setMessage("This email is already approved. Please return to sign in.");
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="success-box" role="status">
        Your access request has been submitted. An administrator must approve it before
        you can use the DCC Bar Schedule.
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={(event) => void submit(event)}>
      <label>First name<input autoComplete="given-name" maxLength={80} name="firstName" required /></label>
      <label>Last name<input autoComplete="family-name" maxLength={80} name="lastName" required /></label>
      <label>Email<input autoComplete="email" maxLength={254} name="email" required type="email" /></label>
      <label className="honeypot" aria-hidden="true">
        Website<input autoComplete="off" name="website" tabIndex={-1} />
      </label>
      <button className="button auth-primary" disabled={busy} type="submit">
        {busy ? "Submitting…" : "Request access"}
      </button>
      {message && <p className="auth-message" role="alert">{message}</p>}
    </form>
  );
}
