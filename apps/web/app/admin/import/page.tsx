import AdminPageHeading from "../admin-page-heading";
import ImportClient from "./import-client";
import { redirect } from "next/navigation";
import { AuthorizationError, requireAdmin } from "../../../lib/authorization";

export default async function ImportPage() {
  try { await requireAdmin(); } catch (error) { if (error instanceof AuthorizationError && error.status === 401) redirect("/sign-in"); redirect("/"); }
  return (
    <section className="narrow-shell admin-page-section">
      <AdminPageHeading title="Import" description="Validate and review approved volunteers or schedule data before updating staging." />
      <ImportClient />
    </section>
  );
}
