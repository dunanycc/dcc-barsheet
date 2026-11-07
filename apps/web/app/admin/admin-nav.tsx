"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const items = [
  { href: "/admin", label: "Schedule", match: (path: string) => path === "/admin" },
  { href: "/admin/users", label: "Users", match: (path: string) => path.startsWith("/admin/users") },
  { href: "/", label: "Volunteer View", match: () => false },
  { href: "/admin/history", label: "History", match: (path: string) => path.startsWith("/admin/history") },
  { href: "/admin/settings", label: "Settings", match: (path: string) => path.startsWith("/admin/settings") },
  { href: "/admin/import", label: "Import", match: (path: string) => path.startsWith("/admin/import") },
];

export function adminNavigation(pathname: string) {
  return items.map((item) => ({ href: item.href, label: item.label, active: item.match(pathname) }));
}

export default function AdminNav() {
  const pathname = usePathname();
  return <nav aria-label="Administration" className="admin-nav">{adminNavigation(pathname).map((item) => {
    const active = item.active;
    return <Link aria-current={active ? "page" : undefined} className={`admin-nav-link${active ? " active" : ""}`} href={item.href} key={item.href}>{item.label}</Link>;
  })}{pathname === "/admin" && <AdminScheduleYearPicker />}</nav>;
}

function AdminScheduleYearPicker() {
  const [years, setYears] = useState<number[]>([]);
  const [value, setValue] = useState("");

  useEffect(() => {
    void fetch("/api/admin/schedule", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json();
      const available = [...new Set<number>((payload.events || []).map((event: { date: string }) => Number(event.date.slice(0, 4))))].sort((a, b) => a - b);
      const currentYear = new Date().getFullYear();
      setYears(available);
      setValue(String(available.includes(currentYear) ? currentYear : available.at(-1) || ""));
    });
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<number | "All Years">).detail;
      setValue(detail === "All Years" ? "all" : String(detail));
    };
    const syncYears = (event: Event) => setYears((event as CustomEvent<number[]>).detail);
    window.addEventListener("schedule-year-change", sync);
    window.addEventListener("schedule-years-change", syncYears);
    return () => {
      window.removeEventListener("schedule-year-change", sync);
      window.removeEventListener("schedule-years-change", syncYears);
    };
  }, []);

  return <label className="schedule-year-picker nav-year-picker"><span className="sr-only">Schedule year</span><select aria-label="Schedule year" onChange={(event) => {
    const next = event.target.value;
    if (next === "create") window.dispatchEvent(new Event("admin-create-year"));
    else window.dispatchEvent(new CustomEvent("admin-schedule-year-select", { detail: next }));
  }} value={value}>
    <option value="all">All years</option>
    {years.map((year) => <option key={year} value={year}>{year}</option>)}
    <option value="create">+ Create new year…</option>
  </select></label>;
}
