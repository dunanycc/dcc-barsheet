import HistoryClient from "./history-client";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ userId?: string }> }) {
  const { userId } = await searchParams;
  return <section className="admin-page-section">
    <div className="page-heading"><h1>History</h1><p>A read-only record of administrative, access, sign-in, and schedule activity.</p></div>
    <HistoryClient initialUserId={userId || ""} />
  </section>;
}
