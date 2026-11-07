import "server-only";
import nodemailer from "nodemailer";
import { gmailTransportOptions, senderIdentity } from "./mail-config";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransporter() { transporter ??= nodemailer.createTransport(gmailTransportOptions()); return transporter; }
export async function verifyMailConnection() { await getTransporter().verify(); }
export async function sendTransactionalMail(options: { to: string; subject: string; text: string; html: string }) {
  await getTransporter().sendMail({ from: senderIdentity(), ...options });
}
