import AdminPageHeading from "../admin-page-heading";
import HistoryClient from "./history-client";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ userId?: string }> }) {
  const { userId } = await searchParams;
  return <section className="admin-page-section">
    <AdminPageHeading title="History" description="A read-only record of administrative, access, sign-in, and schedule activity." />
    <HistoryClient initialUserId={userId || ""} />
  </section>;
}
