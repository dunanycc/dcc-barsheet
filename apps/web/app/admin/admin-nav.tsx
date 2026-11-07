"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { defaultScheduleYear } from "../../lib/default-schedule-year";

const items = [
  { href: "/admin", label: "Schedule", match: (path: string) => path === "/admin" },
  { href: "/admin/users", label: "Users", match: (path: string) => path.startsWith("/admin/users") },
  { href: "/", label: "Volunteer View", match: () => false },
  { href: "/admin/email", label: "Email", match: (path: string) => path.startsWith("/admin/email") },
  { href: "/admin/history", label: "History", match: (path: string) => path.startsWith("/admin/history") },
  { href: "/admin/settings", label: "Settings", match: (path: string) => path.startsWith("/admin/settings") },
  { href: "/admin/import", label: "Import", match: (path: string) => path.startsWith("/admin/import") },
];

export function adminNavigation(pathname: string) {
  return items.map((item) => ({ href: item.href, label: item.label, active: item.match(pathname) }));
}

export default function AdminNav() {
  const pathname = usePathname();
  return <nav aria-label="Administration" className="admin-nav"><div className="admin-nav-links">{adminNavigation(pathname).map((item) => {
    const active = item.active;
    return <Link aria-current={active ? "page" : undefined} className={`admin-nav-link${active ? " active" : ""}`} href={item.href} key={item.href}>{item.label}</Link>;
  })}</div>{pathname === "/admin" && <AdminScheduleYearPicker />}</nav>;
}

export function AdminScheduleYearPicker() {
  const [years, setYears] = useState<number[]>([]);
  const [value, setValue] = useState("");
  const synchronized = useRef(false);

  useEffect(() => {
    void fetch("/api/admin/schedule", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json();
      const available = [...new Set<number>((payload.events || []).map((event: { date: string }) => Number(event.date.slice(0, 4))))].sort((a, b) => a - b);
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const currentYear = Number(today.slice(0, 4));
      setYears([...new Set([currentYear, ...available])].sort((a, b) => a - b));
      if (!synchronized.current) setValue(defaultScheduleYear(payload.events || [], today));
    });
    const sync = (event: Event) => {
      synchronized.current = true;
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
    else {
      synchronized.current = true;
      setValue(next);
      window.dispatchEvent(new CustomEvent("admin-schedule-year-select", { detail: next }));
    }
  }} value={value}>
    <option value="all">All years</option>
    {years.map((year) => <option key={year} value={year}>{year}</option>)}
    <option value="create">+ Create new year…</option>
  </select></label>;
}
