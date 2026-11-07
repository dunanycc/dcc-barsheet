import Image from "next/image";
import type { AccessUser } from "../../lib/auth-policy";
import AccountMenu from "./account-menu";
import ScheduleYearTitle from "./schedule-year-title";

export default function AppHeader({ area, user }: { area: "admin" | "volunteer"; user: AccessUser }) {
  return <header className="app-header">
    <div className="app-brand">
      <Image alt="Dunany Country Club Bar Sign Up" className="app-logo" height={48} src="/Barsheet%20sign%20up.png" width={48} priority />
      <div><strong className="app-name"><ScheduleYearTitle /></strong><span className="app-area">{area === "admin" ? "Administration" : "Volunteer Schedule"}</span></div>
    </div>
    <AccountMenu user={user} />
  </header>;
}
