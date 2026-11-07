import EmailClient from "./email-client";
export default function EmailPage() {
  return <section className="admin-page-section"><div className="page-heading"><h1>Email</h1><p>Write to volunteers and administrators, preview your message, and view sent email history.</p></div><EmailClient /></section>;
}
