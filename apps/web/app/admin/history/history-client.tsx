"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import HistoryRow, { HistoryEntry } from "./history-row";

type Pagination = { page: number; pageSize: number; total: number; pages: number };
const categories = [{ value: "all", label: "All activity" }, { value: "users", label: "Users & access" }, { value: "schedule", label: "Schedule" }, { value: "signins", label: "Sign-ins" }];

export default function HistoryClient({ initialUserId }: { initialUserId: string }) {
  const [category, setCategory] = useState("all"); const [search, setSearch] = useState(""); const [appliedSearch, setAppliedSearch] = useState("");
  const [userId, setUserId] = useState(initialUserId); const [page, setPage] = useState(1); const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 25, total: 0, pages: 1 }); const [message, setMessage] = useState("Loading history…");
  const load = useCallback(async () => {
    setMessage("Loading history…"); const params = new URLSearchParams({ category, page: String(page), pageSize: "25" });
    if (appliedSearch) params.set("search", appliedSearch); if (userId) params.set("userId", userId);
    const response = await fetch(`/api/admin/history?${params}`, { cache: "no-store" }); const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setEntries([]); setMessage(payload.error || "Could not load history."); return; }
    setEntries(payload.history || []); setPagination(payload.pagination); setMessage("");
  }, [appliedSearch, category, page, userId]);
  useEffect(() => { void load(); }, [load]);
  function submit(event: FormEvent) { event.preventDefault(); setPage(1); setUserId(""); setAppliedSearch(search.trim()); }
  return <>
    <div className="history-filters"><div className="tab-bar">{categories.map((item) => <button className={`tab-btn${category === item.value ? " active" : ""}`} key={item.value} onClick={() => { setCategory(item.value); setPage(1); }} type="button">{item.label}</button>)}</div>
      <form className="history-search" onSubmit={submit}><label className="sr-only" htmlFor="history-search">Search by person, email, or event</label><input id="history-search" onChange={(event) => setSearch(event.target.value)} placeholder="Search person, email, or event" value={search} /><button className="button small">Search</button>{(appliedSearch || userId) && <button className="button ghost small" onClick={() => { setSearch(""); setAppliedSearch(""); setUserId(""); setPage(1); }} type="button">Clear search</button>}</form></div>
    {message ? <div className="state-card">{message}</div> : entries.length ? <div className="history-list">{entries.map((entry) => <HistoryRow entry={entry} key={entry.id} />)}</div> : <div className="state-card">No history matches these filters.</div>}
    <div className="history-pagination"><span>{pagination.total} record{pagination.total === 1 ? "" : "s"}</span><div><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {pagination.page} of {pagination.pages}</span><button disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
  </>;
}
