export type MailEnvironment = { GMAIL_USER?: string; GMAIL_APP_PASSWORD?: string };

export function validateMailEnvironment(env: MailEnvironment = process.env as MailEnvironment) {
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) throw new Error("Gmail delivery is not configured.");
  return { user: env.GMAIL_USER, password: env.GMAIL_APP_PASSWORD };
}

export function gmailTransportOptions(env: MailEnvironment = process.env as MailEnvironment) {
  const config = validateMailEnvironment(env);
  return { host: "smtp.gmail.com", port: 465, secure: true, auth: { user: config.user, pass: config.password }, tls: { minVersion: "TLSv1.2" as const } };
}

export function senderIdentity(env: MailEnvironment = process.env as MailEnvironment) {
  const { user } = validateMailEnvironment(env);
  return { name: "DCC Bar Schedule", address: user };
}
