import AdminPageHeading from "../admin-page-heading";
import EmailClient from "./email-client";
export default function EmailPage() {
  return <section className="admin-page-section"><AdminPageHeading title="Email" description="Write to volunteers and administrators, preview your message, and view sent email history." /><EmailClient /></section>;
}
