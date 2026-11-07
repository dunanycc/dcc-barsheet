"use client";

import { FormEvent, useEffect, useState } from "react";
import { STANDARD_SLOTS } from "../../lib/slot-time";
import { nearestMatchingWeekday } from "../../lib/schedule-year-date";
import NotificationPanel from "./settings/notification-panel";

const CUSTOM_VALUE = "__custom__";

type Assignment = { id: string; enteredName: string };
type Shift = {
  id: string;
  displayTime: string;
  capacity: number;
  isOpen: boolean;
  assignments: Assignment[];
};
type AdminEvent = {
  id: string;
  date: string;
  name: string;
  notes: string | null;
  adminNotes: string | null;
  isLocked: boolean;
  isPrivate: boolean;
  shifts: Shift[];
};

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function monthTitle(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00Z`));
}

function displayMonth(value: string) {
  return monthTitle(value).toUpperCase();
}

function shiftMonth(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function firstWeekday(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function unfilledCount(event: AdminEvent) {
  return event.shifts.reduce(
    (sum, shift) =>
      shift.isOpen ? sum + Math.max(0, shift.capacity - shift.assignments.length) : sum,
    0,
  );
}

function headerBadge(event: AdminEvent) {
  const unfilled = unfilledCount(event);
  return unfilled === 0
    ? { label: "✓ Full", tone: "full" as const }
    : { label: `${unfilled} open`, tone: "open" as const };
}

function calendarStatus(event: AdminEvent) {
  const openShifts = event.shifts.filter((shift) => shift.isOpen);
  const unfilled = unfilledCount(event);
  if (event.isLocked) return { tone: "locked" as const, label: "🔒 Locked" };
  if (!openShifts.length) return { tone: "na" as const, label: "No shifts" };
  if (unfilled === 0) return { tone: "full" as const, label: "✓ Full" };
  return { tone: "open" as const, label: `${unfilled} open` };
}

function groupByMonth(events: AdminEvent[]) {
  const groups: Array<{ month: string; events: AdminEvent[] }> = [];
  for (const event of events) {
    const month = event.date.slice(0, 7);
    const current = groups[groups.length - 1];
    if (current && current.month === month) current.events.push(event);
    else groups.push({ month, events: [event] });
  }
  return groups;
}

type AddSlotDraft = { slot: string; custom: string; maxVols: number };

type NotificationSettings = {
  notifEnabled: boolean;
  notifShiftFilled: boolean;
  notifShiftRemoved: boolean;
  notifEventFilled: boolean;
  secondaryShiftFilled: boolean;
  secondaryShiftRemoved: boolean;
  secondaryEventFilled: boolean;
  toEmail: string | null;
  ccEmail: string | null;
};

const DEFAULT_SETTINGS: NotificationSettings = {
  notifEnabled: false,
  notifShiftFilled: true,
  notifShiftRemoved: true,
  notifEventFilled: true,
  secondaryShiftFilled: false,
  secondaryShiftRemoved: false,
  secondaryEventFilled: false,
  toEmail: null,
  ccEmail: null,
};

export default function AdminClient({ initialTab = "schedule" }: { initialTab?: "schedule" | "settings" }) {
  const [unlocked, setUnlocked] = useState(false);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [gateError, setGateError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [openEventIds, setOpenEventIds] = useState<Set<string>>(new Set());
  const [calendarMonth, setCalendarMonth] = useState<string | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  const [addSlotEventIds, setAddSlotEventIds] = useState<Set<string>>(new Set());
  const [addSlotDrafts, setAddSlotDrafts] = useState<Record<string, AddSlotDraft>>({});
  const [notesDrafts, setNotesDrafts] = useState<
    Record<string, { notes?: string; adminNotes?: string }>
  >({});
  const [volDrafts, setVolDrafts] = useState<Record<string, string>>({});

  const [addEventOpen, setAddEventOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({
    date: "",
    name: "",
    notes: "",
    adminNotes: "",
    maxVols: 2,
  });
  const [newEventSlots, setNewEventSlots] = useState<Set<string>>(
    new Set(STANDARD_SLOTS.slice(3)),
  );
  const [newEventCustomChecked, setNewEventCustomChecked] = useState(false);
  const [newEventCustom, setNewEventCustom] = useState("");

  const [editingEvent, setEditingEvent] = useState<AdminEvent | null>(null);
  const [editDraft, setEditDraft] = useState({ date: "", name: "", notes: "", adminNotes: "" });

  const [cloningEvent, setCloningEvent] = useState<AdminEvent | null>(null);
  const [cloneDraft, setCloneDraft] = useState({ date: "", name: "", notes: "" });

  const [tab] = useState<"schedule" | "settings">(initialTab);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [showAllYears, setShowAllYears] = useState(false);
  const [creatingYear, setCreatingYear] = useState(false);

  useEffect(() => {
    const selectYear = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      if (value === "all") setShowAllYears(true);
      else { setShowAllYears(false); setSelectedYear(Number(value)); }
    };
    const createYear = () => { setShowAllYears(false); setCreatingYear(true); };
    window.addEventListener("admin-schedule-year-select", selectYear);
    window.addEventListener("admin-create-year", createYear);
    return () => {
      window.removeEventListener("admin-schedule-year-select", selectYear);
      window.removeEventListener("admin-create-year", createYear);
    };
  }, []);

  useEffect(() => {
    const scheduleYears = [...new Set(events.map((event) => Number(event.date.slice(0, 4))))].sort((a, b) => a - b);
    window.dispatchEvent(new CustomEvent("schedule-years-change", { detail: scheduleYears }));
    const currentYear = Number(todayIso().slice(0, 4));
    const headerYear = selectedYear ?? (scheduleYears.includes(currentYear) ? currentYear : scheduleYears.at(-1));
    if (showAllYears) window.dispatchEvent(new CustomEvent("schedule-year-change", { detail: "All Years" }));
    else if (headerYear) window.dispatchEvent(new CustomEvent("schedule-year-change", { detail: headerYear }));
  }, [events, selectedYear, showAllYears]);

  async function adminFetch(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      ...init,
      headers: { ...(init?.headers ?? {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || "Request failed.");
    return payload;
  }

  async function unlock() {
    setLoading(true);
    setGateError("");
    try {
      const response = await fetch("/api/admin/schedule", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load the schedule.");
      setEvents(payload.events ?? []);
      setUnlocked(true);

      const settingsResponse = await fetch("/api/admin/settings", {
        cache: "no-store",
      });
      const settingsPayload = await settingsResponse.json().catch(() => ({}));
      if (settingsResponse.ok && settingsPayload.settings) setSettings(settingsPayload.settings);
    } catch (caught) {
      setGateError(caught instanceof Error ? caught.message : "Could not load the schedule.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void unlock();
  }, []);

  async function saveSettings() {
    setBusy("save-settings");
    try {
      const payload = await adminFetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSettings(payload.settings);
      setNotice("Settings saved!");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not save settings.");
    } finally {
      setBusy("");
    }
  }

  async function reload() {
    try {
      const payload = await adminFetch("/api/admin/schedule");
      setEvents(payload.events ?? []);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not refresh the schedule.");
    }
  }

  useEffect(() => {
    if (!pendingScrollId) return;
    const element = document.getElementById(`admin-event-${pendingScrollId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingScrollId(null);
    }
  }, [pendingScrollId, showPast, events, openEventIds]);

  function toggleEventOpen(eventId: string) {
    setOpenEventIds((current) => {
      const next = new Set(current);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  function jumpToEvent(event: AdminEvent) {
    setCalendarMonth(null);
    setOpenEventIds((current) => new Set(current).add(event.id));
    if (event.date < todayIso()) setShowPast(true);
    setPendingScrollId(event.id);
  }

  async function handleAddEvent(formEvent: FormEvent) {
    formEvent.preventDefault();
    const slots = [...newEventSlots];
    if (newEventCustomChecked && newEventCustom.trim()) slots.push(newEventCustom.trim());
    if (!newEvent.date || !newEvent.name.trim()) {
      setNotice("Date and event name are required.");
      return;
    }
    if (!slots.length) {
      setNotice("Select at least one time slot.");
      return;
    }
    setBusy("add-event");
    try {
      await adminFetch("/api/admin/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: newEvent.date,
          name: newEvent.name.trim(),
          notes: newEvent.notes,
          adminNotes: newEvent.adminNotes,
          maxVols: newEvent.maxVols,
          slotTimes: slots,
        }),
      });
      setNotice("Event created!");
      setAddEventOpen(false);
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not create the event.");
    } finally {
      setBusy("");
    }
  }

  function openEditModal(event: AdminEvent) {
    setEditingEvent(event);
    setEditDraft({
      date: event.date,
      name: event.name,
      notes: event.notes ?? "",
      adminNotes: event.adminNotes ?? "",
    });
  }

  async function handleEditEvent(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!editingEvent) return;
    if (!editDraft.date || !editDraft.name.trim()) {
      setNotice("Date and event name are required.");
      return;
    }
    setBusy("edit-event");
    try {
      await adminFetch(`/api/admin/events/${editingEvent.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: editDraft.date,
          name: editDraft.name.trim(),
          notes: editDraft.notes,
          adminNotes: editDraft.adminNotes,
        }),
      });
      setNotice("Event updated!");
      setEditingEvent(null);
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not update the event.");
    } finally {
      setBusy("");
    }
  }

  function openCloneModal(event: AdminEvent) {
    setCloningEvent(event);
    setCloneDraft({ date: "", name: event.name, notes: event.notes ?? "" });
  }

  async function handleClone(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!cloningEvent) return;
    if (!cloneDraft.date || !cloneDraft.name.trim()) {
      setNotice("New date and name are required.");
      return;
    }
    setBusy("clone-event");
    try {
      const payload = await adminFetch(`/api/admin/events/${cloningEvent.id}/clone`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: cloneDraft.date,
          name: cloneDraft.name.trim(),
          notes: cloneDraft.notes,
        }),
      });
      setNotice(`Cloned ${payload.count} slot(s)!`);
      setCloningEvent(null);
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not clone the event.");
    } finally {
      setBusy("");
    }
  }

  async function handleDeleteEvent(event: AdminEvent) {
    if (
      !window.confirm(
        `Delete all slots for "${event.name}" on ${displayDate(event.date)}?\n\nThis cannot be undone.`,
      )
    )
      return;
    setBusy(`delete-event-${event.id}`);
    try {
      await adminFetch(`/api/admin/events/${event.id}`, { method: "DELETE" });
      setNotice("Event deleted.");
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not delete the event.");
    } finally {
      setBusy("");
    }
  }

  async function toggleEventFlag(event: AdminEvent, field: "isPrivate" | "isLocked") {
    setBusy(`${field}-${event.id}`);
    try {
      await adminFetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [field]: !event[field] }),
      });
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not update the event.");
    } finally {
      setBusy("");
    }
  }

  function noteValue(event: AdminEvent, field: "notes" | "adminNotes") {
    const draft = notesDrafts[event.id];
    if (draft && draft[field] !== undefined) return draft[field] as string;
    return event[field] ?? "";
  }
  function setNoteDraft(eventId: string, field: "notes" | "adminNotes", value: string) {
    setNotesDrafts((current) => ({ ...current, [eventId]: { ...current[eventId], [field]: value } }));
  }
  function noteDirty(event: AdminEvent, field: "notes" | "adminNotes") {
    return noteValue(event, field) !== (event[field] ?? "");
  }
  async function saveNote(event: AdminEvent, field: "notes" | "adminNotes") {
    setBusy(`notes-${field}-${event.id}`);
    try {
      await adminFetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [field]: noteValue(event, field) }),
      });
      setNotice(field === "notes" ? "Notes saved." : "Admin notes saved.");
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not save notes.");
    } finally {
      setBusy("");
    }
  }

  async function handleDeleteSlot(shiftId: string) {
    if (!window.confirm("Delete this time slot?")) return;
    setBusy(`delete-shift-${shiftId}`);
    try {
      await adminFetch(`/api/admin/shifts/${shiftId}`, { method: "DELETE" });
      setNotice("Slot deleted.");
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not delete the slot.");
    } finally {
      setBusy("");
    }
  }

  async function handleSlotTimeChange(shiftId: string, displayTime: string) {
    setBusy(`slot-time-${shiftId}`);
    try {
      await adminFetch(`/api/admin/shifts/${shiftId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayTime }),
      });
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy("");
    }
  }

  async function handleMaxVolsChange(shiftId: string, capacity: number) {
    setBusy(`slot-max-${shiftId}`);
    try {
      await adminFetch(`/api/admin/shifts/${shiftId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capacity }),
      });
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy("");
    }
  }

  async function handleToggleOpen(shift: Shift) {
    setBusy(`slot-open-${shift.id}`);
    try {
      await adminFetch(`/api/admin/shifts/${shift.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isOpen: !shift.isOpen }),
      });
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy("");
    }
  }

  function emptySlotKeys(event: AdminEvent) {
    const keys: string[] = [];
    event.shifts.forEach((shift) => {
      const empties = Math.max(0, shift.capacity - shift.assignments.length);
      for (let index = 0; index < empties; index += 1) keys.push(`${shift.id}-${index}`);
    });
    return keys;
  }

  function eventHasDirtyVolDraft(event: AdminEvent) {
    return emptySlotKeys(event).some((key) => (volDrafts[key] ?? "").trim());
  }

  async function submitAllVolunteers(event: AdminEvent) {
    const toSave = event.shifts.flatMap((shift) => {
      const empties = Math.max(0, shift.capacity - shift.assignments.length);
      return Array.from({ length: empties }, (_, index) => `${shift.id}-${index}`)
        .map((key) => ({ key, shiftId: shift.id, name: (volDrafts[key] ?? "").trim() }))
        .filter((entry) => entry.name);
    });
    if (!toSave.length) return;

    setBusy(`vol-save-${event.id}`);
    try {
      const results = await Promise.allSettled(
        toSave.map((entry) =>
          adminFetch(`/api/admin/shifts/${entry.shiftId}/assignments`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: entry.name }),
          }),
        ),
      );
      const failed = results.filter((result) => result.status === "rejected").length;
      setNotice(
        failed
          ? `Saved with ${failed} error(s)`
          : toSave.length > 1
            ? `${toSave.length} volunteers saved!`
            : "Volunteer saved!",
      );
      setVolDrafts((current) => {
        const next = { ...current };
        toSave.forEach((entry) => delete next[entry.key]);
        return next;
      });
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not save volunteers.");
    } finally {
      setBusy("");
    }
  }

  async function handleAdminRemoveVolunteer(assignmentId: string) {
    if (!window.confirm("Remove this volunteer?")) return;
    setBusy(`vol-remove-${assignmentId}`);
    try {
      await adminFetch(`/api/admin/assignments/${assignmentId}`, { method: "DELETE" });
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not remove the volunteer.");
    } finally {
      setBusy("");
    }
  }

  function toggleAddSlotForm(eventId: string) {
    setAddSlotEventIds((current) => {
      const next = new Set(current);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
    setAddSlotDrafts((current) =>
      current[eventId]
        ? current
        : { ...current, [eventId]: { slot: STANDARD_SLOTS[0], custom: "", maxVols: 2 } },
    );
  }

  async function submitAddSlot(eventId: string) {
    const draft = addSlotDrafts[eventId] ?? { slot: STANDARD_SLOTS[0], custom: "", maxVols: 2 };
    const displayTime = draft.slot === CUSTOM_VALUE ? draft.custom.trim() : draft.slot;
    if (!displayTime) {
      setNotice("Enter a custom time.");
      return;
    }
    setBusy(`add-slot-${eventId}`);
    try {
      await adminFetch(`/api/admin/events/${eventId}/shifts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayTime, capacity: draft.maxVols }),
      });
      setNotice("Slot added!");
      setAddSlotEventIds((current) => {
        const next = new Set(current);
        next.delete(eventId);
        return next;
      });
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not add the slot.");
    } finally {
      setBusy("");
    }
  }

  if (!unlocked) {
    return (
      <div className="admin-key-gate state-card">
        <h2>{loading ? "Loading administration…" : "Admin access"}</h2>
        {gateError && (
          <p style={{ color: "#8a2c25", marginTop: "0.75rem" }}>{gateError}</p>
        )}
      </div>
    );
  }

  const today = todayIso();
  const years = [...new Set(events.map((event) => Number(event.date.slice(0, 4))))].sort(
    (a, b) => a - b,
  );
  const currentCalendarYear = Number(today.slice(0, 4));
  const effectiveYear =
    selectedYear ?? (years.includes(currentCalendarYear) ? currentCalendarYear : years[years.length - 1]);
  const yearEvents = showAllYears ? events : events.filter((event) => Number(event.date.slice(0, 4)) === effectiveYear);
  const visibleEvents = yearEvents.filter((event) => showPast || event.date >= today);
  const groups = groupByMonth(visibleEvents);
  const totalUnfilled = visibleEvents.reduce((sum, event) => sum + unfilledCount(event), 0);

  return (
    <section aria-label="Admin schedule">
      {notice && <div className="notice" role="status">{notice}</div>}

      {tab === "settings" ? (
        <div className="settings-section">
          <div className="page-heading"><h1>Settings</h1><p>Manage email delivery and staffing notifications.</p></div>
          <h3 className="settings-section-title">Notification recipients</h3>
          <div className="settings-box notification-email-grid">
            <div className="form-group">
              <label htmlFor="administrator-notification-email">Primary notification email</label>
              <input id="administrator-notification-email" onChange={(event) => setSettings((current) => ({ ...current, toEmail: event.target.value }))} placeholder="administrator@example.com" type="email" value={settings.toEmail ?? ""} />
              <p className="muted">Main recipient for selected administrator notifications.</p>
            </div>
            <div className="form-group">
              <label htmlFor="secondary-notification-email">Secondary notification email</label>
              <input id="secondary-notification-email" onChange={(event) => setSettings((current) => ({ ...current, ccEmail: event.target.value }))} placeholder="secondary@example.com" type="email" value={settings.ccEmail ?? ""} />
              <p className="muted">Optional second recipient. Leave blank if it is not needed.</p>
            </div>
          </div>
          <h3 className="settings-section-title settings-following-title">Notification types</h3>
          <div className="settings-box">
            <div className="notification-matrix" role="group" aria-label="Notification recipients by type">
              <div className="notification-matrix-heading">Notification</div><div className="notification-matrix-heading recipient-heading">Primary</div><div className="notification-matrix-heading recipient-heading">Secondary</div>
              {([
                ["Shift filled", "A shift reaches volunteer capacity.", "notifShiftFilled", "secondaryShiftFilled"],
                ["Volunteer removed", "A signup is removed from a shift.", "notifShiftRemoved", "secondaryShiftRemoved"],
                ["Event filled", "Every shift for an event is fully staffed.", "notifEventFilled", "secondaryEventFilled"],
              ] as const).map(([label, description, primaryKey, secondaryKey]) => (
                <div className="notification-matrix-row" key={label}>
                  <span className="notification-type"><strong>{label}</strong><small>{description}</small></span>
                  <label className="matrix-checkbox"><span className="sr-only">Send {label} to primary email</span><input checked={settings[primaryKey]} onChange={(event) => setSettings((current) => ({ ...current, [primaryKey]: event.target.checked }))} type="checkbox" /></label>
                  <label className="matrix-checkbox"><span className="sr-only">Send {label} to secondary email</span><input checked={settings[secondaryKey]} disabled={!settings.ccEmail?.trim()} onChange={(event) => setSettings((current) => ({ ...current, [secondaryKey]: event.target.checked }))} type="checkbox" /></label>
                </div>
              ))}
            </div>
            <div className="settings-card-actions">
              <button
                className="button"
                disabled={busy === "save-settings"}
                onClick={() => void saveSettings()}
                type="button"
              >
                {busy === "save-settings" ? "Saving…" : "Save Settings"}
              </button>
            </div>
          </div>
          <NotificationPanel />
        </div>
      ) : (
        <>
      <div className="page-heading schedule-heading-row"><div><h1>Schedule</h1><p>Manage events, shifts, and volunteer coverage.</p></div></div>

      <div className="admin-toolbar">
        <span className="admin-summary">
          {visibleEvents.length} event{visibleEvents.length !== 1 ? "s" : ""} ·{" "}
          {totalUnfilled} volunteer spot{totalUnfilled !== 1 ? "s" : ""} still open
        </span>
        <div style={{ display: "flex", gap: "0.9rem", alignItems: "center" }}>
          <label className="past-events-toggle" style={{ marginLeft: 0, padding: 0 }}>
            <input
              checked={showPast}
              onChange={(event) => setShowPast(event.target.checked)}
              type="checkbox"
            />
            Show past events
          </label>
          <button
            className="button"
            onClick={() => {
              setAddEventOpen(true);
              setNewEvent({ date: "", name: "", notes: "", adminNotes: "", maxVols: 2 });
              setNewEventSlots(new Set(STANDARD_SLOTS.slice(3)));
              setNewEventCustomChecked(false);
              setNewEventCustom("");
            }}
            type="button"
          >
            + Add Event
          </button>
        </div>
      </div>

      {!groups.length ? (
        <div className="state-card">
          <h2>No events</h2>
          <p>Check &quot;Show past events&quot; or click &quot;+ Add Event&quot; to add one.</p>
        </div>
      ) : (
        <div className="event-list">
          {groups.map((group) => (
            <div className="month-group" key={group.month}>
              <div className="month-header">
                <span>{displayMonth(group.month)}</span>
                <button
                  className="cal-icon-btn"
                  onClick={() => setCalendarMonth(group.month)}
                  title={`View ${monthTitle(group.month)} calendar`}
                  type="button"
                >
                  📅
                </button>
              </div>
              {group.events.map((event) => {
                const isOpen = openEventIds.has(event.id);
                const badge = headerBadge(event);
                return (
                  <article
                    className={`event-card${isOpen ? " open" : ""}${event.isLocked ? " locked" : ""}`}
                    id={`admin-event-${event.id}`}
                    key={event.id}
                  >
                    <div
                      className="event-header"
                      onClick={() => toggleEventOpen(event.id)}
                      onKeyDown={(keyEvent) => {
                        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                          keyEvent.preventDefault();
                          toggleEventOpen(event.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <span className="event-date">{displayDate(event.date)}</span>
                      <span className="event-name">
                        {event.name}
                        {event.notes && <span className="event-notes">{event.notes}</span>}
                        {event.isLocked && <span className="lock-icon"> 🔒</span>}
                        {event.isPrivate && <span className="lock-icon"> 🔕 Private</span>}
                      </span>
                      <span className={`unfilled-col ${badge.tone === "full" ? "all-filled" : "has-open"}`}>
                        {badge.label}
                      </span>
                      <span className="chevron">▶</span>
                    </div>

                    {isOpen && (
                      <div className="slot-admin-panel">
                        <div className="event-toolbar">
                          <button
                            className="button ghost small"
                            onClick={() => toggleAddSlotForm(event.id)}
                            type="button"
                          >
                            + Add Slot
                          </button>
                          <button
                            className="button ghost small"
                            onClick={() => openEditModal(event)}
                            type="button"
                          >
                            ✎ Edit Event
                          </button>
                          <button
                            className="button ghost small"
                            onClick={() => openCloneModal(event)}
                            type="button"
                          >
                            ⧉ Clone
                          </button>
                          <button
                            className={`button small ${event.isPrivate ? "danger" : "ghost"}`}
                            disabled={busy === `isPrivate-${event.id}`}
                            onClick={() => void toggleEventFlag(event, "isPrivate")}
                            type="button"
                          >
                            {event.isPrivate ? "🔕 Private Event" : "🔔 Private Event"}
                          </button>
                          <button
                            className={`button small ${event.isLocked ? "danger" : "ghost"}`}
                            disabled={busy === `isLocked-${event.id}`}
                            onClick={() => void toggleEventFlag(event, "isLocked")}
                            type="button"
                          >
                            {event.isLocked ? "🔒 Unlock Event" : "🔓 Lock Event"}
                          </button>
                          <button
                            className="button danger small"
                            disabled={busy === `delete-event-${event.id}`}
                            onClick={() => void handleDeleteEvent(event)}
                            style={{ marginLeft: "auto" }}
                            type="button"
                          >
                            Delete Event
                          </button>
                        </div>

                        <div className="notes-panel">
                          <div>
                            <label>
                              Public Notes{" "}
                              <span style={{ fontWeight: 400, color: "#aaa" }}>
                                (visible to volunteers)
                              </span>
                            </label>
                            <textarea
                              onChange={(textEvent) =>
                                setNoteDraft(event.id, "notes", textEvent.target.value)
                              }
                              placeholder="e.g. Shotgun 10:00am, cash bar"
                              rows={2}
                              value={noteValue(event, "notes")}
                            />
                            <button
                              className={`notes-save-btn${noteDirty(event, "notes") ? " unsaved" : ""}`}
                              disabled={busy === `notes-notes-${event.id}`}
                              onClick={() => void saveNote(event, "notes")}
                              type="button"
                            >
                              Save notes
                            </button>
                          </div>
                          <div className="admin-notes-box">
                            <label>
                              🔒 Admin Notes{" "}
                              <span style={{ fontWeight: 400, color: "#aaa" }}>
                                (hidden from volunteers)
                              </span>
                            </label>
                            <textarea
                              onChange={(textEvent) =>
                                setNoteDraft(event.id, "adminNotes", textEvent.target.value)
                              }
                              placeholder="Internal notes…"
                              rows={2}
                              value={noteValue(event, "adminNotes")}
                            />
                            <button
                              className={`notes-save-btn${noteDirty(event, "adminNotes") ? " unsaved" : ""}`}
                              disabled={busy === `notes-adminNotes-${event.id}`}
                              onClick={() => void saveNote(event, "adminNotes")}
                              type="button"
                            >
                              Save notes
                            </button>
                          </div>
                        </div>

                        <table className="slot-admin-table">
                          <thead>
                            <tr>
                              <th>Time Slot</th>
                              <th>Max</th>
                              <th>Status</th>
                              <th>Volunteers</th>
                              <th>Open</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {event.shifts.map((shift) => {
                              const isCustom = !STANDARD_SLOTS.includes(shift.displayTime);
                              const openCount = shift.isOpen
                                ? Math.max(0, shift.capacity - shift.assignments.length)
                                : 0;
                              return (
                                <tr key={shift.id}>
                                  <td>
                                    <select
                                      disabled={busy === `slot-time-${shift.id}`}
                                      onChange={(selectEvent) =>
                                        void handleSlotTimeChange(shift.id, selectEvent.target.value)
                                      }
                                      value={shift.displayTime}
                                    >
                                      {STANDARD_SLOTS.map((slot) => (
                                        <option key={slot} value={slot}>
                                          {slot}
                                        </option>
                                      ))}
                                      {isCustom && (
                                        <option value={shift.displayTime}>{shift.displayTime}</option>
                                      )}
                                    </select>
                                  </td>
                                  <td>
                                    <select
                                      disabled={busy === `slot-max-${shift.id}`}
                                      onChange={(selectEvent) =>
                                        void handleMaxVolsChange(shift.id, Number(selectEvent.target.value))
                                      }
                                      value={shift.capacity}
                                    >
                                      {[1, 2, 3, 4].map((n) => (
                                        <option key={n} value={n}>
                                          {n}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td>
                                    <button
                                      className={`toggle-btn ${shift.isOpen ? "toggle-open" : "toggle-closed"}`}
                                      disabled={busy === `slot-open-${shift.id}`}
                                      onClick={() => void handleToggleOpen(shift)}
                                      type="button"
                                    >
                                      {shift.isOpen ? "Open" : "Closed"}
                                    </button>
                                  </td>
                                  <td>
                                    <div className="volunteers-cell">
                                      {shift.assignments.map((assignment) => (
                                        <span className="admin-vol-chip" key={assignment.id}>
                                          {assignment.enteredName}
                                          <button
                                            className="x-btn"
                                            disabled={busy === `vol-remove-${assignment.id}`}
                                            onClick={() => void handleAdminRemoveVolunteer(assignment.id)}
                                            title="Remove"
                                            type="button"
                                          >
                                            ×
                                          </button>
                                        </span>
                                      ))}
                                      {Array.from({
                                        length: Math.max(0, shift.capacity - shift.assignments.length),
                                      }).map((_, index) => {
                                        const key = `${shift.id}-${index}`;
                                        return (
                                          <input
                                            className="vol-add-input"
                                            disabled={busy === `vol-save-${event.id}`}
                                            key={key}
                                            onChange={(inputEvent) =>
                                              setVolDrafts((current) => ({
                                                ...current,
                                                [key]: inputEvent.target.value,
                                              }))
                                            }
                                            onKeyDown={(keyEvent) => {
                                              if (keyEvent.key === "Enter") {
                                                keyEvent.preventDefault();
                                                void submitAllVolunteers(event);
                                              }
                                            }}
                                            placeholder="Add name"
                                            type="text"
                                            value={volDrafts[key] ?? ""}
                                          />
                                        );
                                      })}
                                    </div>
                                  </td>
                                  <td className={`unfilled-col ${openCount === 0 ? "all-filled" : "has-open"}`}>
                                    {shift.isOpen ? openCount : "—"}
                                  </td>
                                  <td>
                                    <button
                                      aria-label={`Delete ${shift.displayTime} shift`}
                                      className="button danger small shift-delete-button"
                                      disabled={busy === `delete-shift-${shift.id}`}
                                      onClick={() => void handleDeleteSlot(shift.id)}
                                      title="Delete shift"
                                      type="button"
                                    >
                                      <svg aria-hidden="true" viewBox="0 0 24 24">
                                        <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
                                      </svg>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        <button
                          className={`notes-save-btn vol-save-btn${eventHasDirtyVolDraft(event) ? " unsaved" : ""}`}
                          disabled={busy === `vol-save-${event.id}`}
                          onClick={() => void submitAllVolunteers(event)}
                          type="button"
                        >
                          Save Volunteers
                        </button>

                        {addSlotEventIds.has(event.id) && (
                          <div className="add-slot-form">
                            <h4>Add Time Slot</h4>
                            <div className="slot-form-row">
                              <label>Time</label>
                              <select
                                onChange={(selectEvent) =>
                                  setAddSlotDrafts((current) => ({
                                    ...current,
                                    [event.id]: {
                                      ...(current[event.id] ?? {
                                        slot: STANDARD_SLOTS[0],
                                        custom: "",
                                        maxVols: 2,
                                      }),
                                      slot: selectEvent.target.value,
                                    },
                                  }))
                                }
                                value={addSlotDrafts[event.id]?.slot ?? STANDARD_SLOTS[0]}
                              >
                                {STANDARD_SLOTS.map((slot) => (
                                  <option key={slot} value={slot}>
                                    {slot}
                                  </option>
                                ))}
                                <option value={CUSTOM_VALUE}>Custom…</option>
                              </select>
                              {addSlotDrafts[event.id]?.slot === CUSTOM_VALUE && (
                                <input
                                  onChange={(inputEvent) =>
                                    setAddSlotDrafts((current) => ({
                                      ...current,
                                      [event.id]: {
                                        ...(current[event.id] ?? {
                                          slot: CUSTOM_VALUE,
                                          custom: "",
                                          maxVols: 2,
                                        }),
                                        custom: inputEvent.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="e.g. 9:30am–11:30am"
                                  type="text"
                                  value={addSlotDrafts[event.id]?.custom ?? ""}
                                />
                              )}
                              <label>Max vols</label>
                              <select
                                onChange={(selectEvent) =>
                                  setAddSlotDrafts((current) => ({
                                    ...current,
                                    [event.id]: {
                                      ...(current[event.id] ?? {
                                        slot: STANDARD_SLOTS[0],
                                        custom: "",
                                        maxVols: 2,
                                      }),
                                      maxVols: Number(selectEvent.target.value),
                                    },
                                  }))
                                }
                                value={addSlotDrafts[event.id]?.maxVols ?? 2}
                              >
                                {[1, 2, 3, 4].map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                              <button
                                className="button small"
                                disabled={busy === `add-slot-${event.id}`}
                                onClick={() => void submitAddSlot(event.id)}
                                type="button"
                              >
                                Add
                              </button>
                              <button
                                className="button secondary small"
                                onClick={() => toggleAddSlotForm(event.id)}
                                type="button"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {calendarMonth && (
        <AdminMonthCalendarModal
          events={events}
          month={calendarMonth}
          onClose={() => setCalendarMonth(null)}
          onJump={jumpToEvent}
          onNavigate={setCalendarMonth}
        />
      )}

      {creatingYear && (
        <CreateYearModal
          existingYearEvents={events.filter(
            (event) => Number(event.date.slice(0, 4)) === effectiveYear + 1,
          )}
          onClose={() => setCreatingYear(false)}
          onSubmit={async (payload) => {
            setBusy("create-year");
            setNotice("");
            try {
              const result = await adminFetch("/api/admin/schedule/clone-year", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
              });
              setNotice(`Created ${result.created} event(s) for ${payload.targetYear}!`);
              setCreatingYear(false);
              setSelectedYear(payload.targetYear);
              await reload();
            } catch (caught) {
              setNotice(caught instanceof Error ? caught.message : "Could not create the new year.");
            } finally {
              setBusy("");
            }
          }}
          sourceEvents={yearEvents}
          sourceYear={effectiveYear}
          submitting={busy === "create-year"}
          message={notice}
          targetYear={effectiveYear + 1}
        />
      )}

      {addEventOpen && (
        <div className="modal-overlay" onClick={() => setAddEventOpen(false)}>
          <div aria-labelledby="add-event-title" aria-modal="true" className="modal" onClick={(event) => event.stopPropagation()} role="dialog">
            <h2 id="add-event-title">Add Event</h2>
            <form onSubmit={(formEvent) => void handleAddEvent(formEvent)}>
              <div className="form-group">
                <label>Date</label>
                <input
                  onChange={(event) => setNewEvent((current) => ({ ...current, date: event.target.value }))}
                  required
                  type="date"
                  value={newEvent.date}
                />
              </div>
              <div className="form-group">
                <label>Event Name</label>
                <input
                  onChange={(event) => setNewEvent((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. Men's Invitational"
                  required
                  type="text"
                  value={newEvent.name}
                />
              </div>
              <div className="form-group">
                <label>
                  Notes <span style={{ fontWeight: 400, color: "#aaa" }}>(optional)</span>
                </label>
                <textarea
                  onChange={(event) => setNewEvent((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="e.g. Shotgun 10:00am, 101 guests"
                  value={newEvent.notes}
                />
              </div>
              <div className="form-group admin-notes-box">
                <label>
                  🔒 Admin Notes{" "}
                  <span style={{ fontWeight: 400, color: "#aaa" }}>(hidden from volunteers)</span>
                </label>
                <textarea
                  onChange={(event) =>
                    setNewEvent((current) => ({ ...current, adminNotes: event.target.value }))
                  }
                  placeholder="Internal notes…"
                  value={newEvent.adminNotes}
                />
              </div>
              <div className="form-group">
                <label>Time Slots to Create</label>
                <div className="slot-checks">
                  {STANDARD_SLOTS.map((slot) => (
                    <label
                      className={`slot-check-label${newEventSlots.has(slot) ? " checked" : ""}`}
                      key={slot}
                    >
                      <input
                        checked={newEventSlots.has(slot)}
                        onChange={() =>
                          setNewEventSlots((current) => {
                            const next = new Set(current);
                            if (next.has(slot)) next.delete(slot);
                            else next.add(slot);
                            return next;
                          })
                        }
                        type="checkbox"
                      />
                      {slot}
                    </label>
                  ))}
                  <label className={`slot-check-label${newEventCustomChecked ? " checked" : ""}`}>
                    <input
                      checked={newEventCustomChecked}
                      onChange={(event) => setNewEventCustomChecked(event.target.checked)}
                      type="checkbox"
                    />
                    Custom…
                  </label>
                </div>
                {newEventCustomChecked && (
                  <input
                    onChange={(event) => setNewEventCustom(event.target.value)}
                    placeholder="e.g. 9:30am–11:30am"
                    style={{ marginTop: "0.5rem" }}
                    type="text"
                    value={newEventCustom}
                  />
                )}
              </div>
              <div className="form-group">
                <label>Default Volunteers per Slot</label>
                <select
                  onChange={(event) =>
                    setNewEvent((current) => ({ ...current, maxVols: Number(event.target.value) }))
                  }
                  value={newEvent.maxVols}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-actions">
                <button className="button secondary" onClick={() => setAddEventOpen(false)} type="button">
                  Cancel
                </button>
                <button className="button" disabled={busy === "add-event"} type="submit">
                  {busy === "add-event" ? "Creating…" : "Create Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingEvent && (
        <div className="modal-overlay" onClick={() => setEditingEvent(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>Edit Event</h2>
            <form onSubmit={(formEvent) => void handleEditEvent(formEvent)}>
              <div className="form-group">
                <label>Date</label>
                <input
                  onChange={(event) => setEditDraft((current) => ({ ...current, date: event.target.value }))}
                  required
                  type="date"
                  value={editDraft.date}
                />
              </div>
              <div className="form-group">
                <label>Event Name</label>
                <input
                  onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))}
                  required
                  type="text"
                  value={editDraft.name}
                />
              </div>
              <div className="form-group">
                <label>
                  Notes <span style={{ fontWeight: 400, color: "#aaa" }}>(optional)</span>
                </label>
                <textarea
                  onChange={(event) => setEditDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="e.g. Shotgun 10:00am, 101 guests"
                  value={editDraft.notes}
                />
              </div>
              <div className="form-group admin-notes-box">
                <label>
                  🔒 Admin Notes{" "}
                  <span style={{ fontWeight: 400, color: "#aaa" }}>(hidden from volunteers)</span>
                </label>
                <textarea
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, adminNotes: event.target.value }))
                  }
                  placeholder="Internal notes…"
                  value={editDraft.adminNotes}
                />
              </div>
              <div className="form-actions">
                <button className="button secondary" onClick={() => setEditingEvent(null)} type="button">
                  Cancel
                </button>
                <button className="button" disabled={busy === "edit-event"} type="submit">
                  {busy === "edit-event" ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cloningEvent && (
        <div className="modal-overlay" onClick={() => setCloningEvent(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>Clone Event Schedule</h2>
            <p style={{ fontSize: "0.82rem", color: "#666", marginBottom: "14px" }}>
              Copies all time slot settings — <strong>no volunteer names</strong> are carried over.
            </p>
            <form onSubmit={(formEvent) => void handleClone(formEvent)}>
              <div className="form-group">
                <label>New Date</label>
                <input
                  onChange={(event) => setCloneDraft((current) => ({ ...current, date: event.target.value }))}
                  required
                  type="date"
                  value={cloneDraft.date}
                />
              </div>
              <div className="form-group">
                <label>New Event Name</label>
                <input
                  onChange={(event) => setCloneDraft((current) => ({ ...current, name: event.target.value }))}
                  required
                  type="text"
                  value={cloneDraft.name}
                />
              </div>
              <div className="form-group">
                <label>
                  Notes <span style={{ fontWeight: 400, color: "#aaa" }}>(optional)</span>
                </label>
                <textarea
                  onChange={(event) =>
                    setCloneDraft((current) => ({ ...current, notes: event.target.value }))
                  }
                  value={cloneDraft.notes}
                />
              </div>
              <div className="form-actions">
                <button className="button secondary" onClick={() => setCloningEvent(null)} type="button">
                  Cancel
                </button>
                <button className="button" disabled={busy === "clone-event"} type="submit">
                  {busy === "clone-event" ? "Cloning…" : "Clone"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function AdminMonthCalendarModal({
  events,
  month,
  onClose,
  onJump,
  onNavigate,
}: {
  events: AdminEvent[];
  month: string;
  onClose: () => void;
  onJump: (event: AdminEvent) => void;
  onNavigate: (month: string) => void;
}) {
  const availableMonths = new Set(events.map((event) => event.date.slice(0, 7)));
  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);

  const eventsByDay = new Map<number, AdminEvent[]>();
  events
    .filter((event) => event.date.slice(0, 7) === month)
    .forEach((event) => {
      const day = Number(event.date.slice(8, 10));
      const list = eventsByDay.get(day) ?? [];
      list.push(event);
      eventsByDay.set(day, list);
    });

  const totalDays = daysInMonth(month);
  const leadingBlanks = firstWeekday(month);
  const cells: Array<number | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="month-cal-modal" onClick={(event) => event.stopPropagation()}>
        <div className="month-cal-hdr">
          <button
            className="month-cal-nav"
            disabled={!availableMonths.has(prevMonth)}
            onClick={() => onNavigate(prevMonth)}
            type="button"
          >
            ‹
          </button>
          <h2>{monthTitle(month)}</h2>
          <button
            className="month-cal-nav"
            disabled={!availableMonths.has(nextMonth)}
            onClick={() => onNavigate(nextMonth)}
            type="button"
          >
            ›
          </button>
          <button className="month-cal-close" onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div className="mcal-grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div className="mcal-dow" key={day}>
              {day}
            </div>
          ))}
          {cells.map((day, index) => {
            if (day === null) return <div className="mcal-day mcal-blank" key={`blank-${index}`} />;
            const dayEvents = eventsByDay.get(day) ?? [];
            return (
              <div className={`mcal-day${dayEvents.length ? " mcal-has-events" : ""}`} key={day}>
                <div className="mcal-day-num">{day}</div>
                {dayEvents.map((event) => {
                  const status = calendarStatus(event);
                  return (
                    <div
                      className={`mcal-ev mcal-ev-${status.tone}`}
                      key={event.id}
                      onClick={() => onJump(event)}
                    >
                      <div className="mcal-ev-name">{event.name}</div>
                      <div className="mcal-ev-status">{status.label}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type CloneYearRow = { checked: boolean; newDate: string };

function CreateYearModal({
  sourceYear,
  targetYear,
  sourceEvents,
  existingYearEvents,
  submitting,
  message,
  onClose,
  onSubmit,
}: {
  sourceYear: number;
  targetYear: number;
  sourceEvents: AdminEvent[];
  existingYearEvents: AdminEvent[];
  submitting: boolean;
  message: string;
  onClose: () => void;
  onSubmit: (payload: {
    targetYear: number;
    replaceExisting: boolean;
    events: Array<{ sourceEventId: string; date: string }>;
  }) => void;
}) {
  const sorted = [...sourceEvents].sort((a, b) => a.date.localeCompare(b.date));
  const [rows, setRows] = useState<Record<string, CloneYearRow>>(() =>
    Object.fromEntries(
      sorted.map((event) => [event.id, { checked: true, newDate: nearestMatchingWeekday(event.date, targetYear) }]),
    ),
  );

  function toggleRow(eventId: string) {
    setRows((current) => ({
      ...current,
      [eventId]: { ...current[eventId], checked: !current[eventId].checked },
    }));
  }
  function setRowDate(eventId: string, date: string) {
    setRows((current) => ({ ...current, [eventId]: { ...current[eventId], newDate: date } }));
  }

  function handleSubmit() {
    const selected = sorted
      .filter((event) => rows[event.id]?.checked)
      .map((event) => ({ sourceEventId: event.id, date: rows[event.id].newDate }));
    if (!selected.length) return;

    if (existingYearEvents.length > 0) {
      const confirmed = window.confirm(
        `${targetYear} already has ${existingYearEvents.length} event(s). Continuing will permanently delete ` +
          "all of them and their volunteer signups, then replace with this clone. This cannot be undone. Continue?",
      );
      if (!confirmed) return;
    }

    onSubmit({
      targetYear,
      replaceExisting: existingYearEvents.length > 0,
      events: selected,
    });
  }

  const checkedCount = sorted.filter((event) => rows[event.id]?.checked).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(event) => event.stopPropagation()}>
        <h2>Create {targetYear} Schedule</h2>
        <p style={{ fontSize: "0.82rem", color: "#666", marginBottom: "14px" }}>
          Cloning from {sourceYear}. Dates default to the closest matching weekday in {targetYear}.
          Uncheck any event you don&apos;t want carried over, and adjust
          dates as needed — <strong>no volunteer names</strong> are carried over.
        </p>
        {message && <div className="notice" role="status">{message}</div>}
        {existingYearEvents.length > 0 && (
          <div className="danger-box">
            ⚠ {targetYear} already has {existingYearEvents.length} event(s). Confirming will{" "}
            <strong>permanently delete</strong> them and all volunteer signups, then replace with
            this clone.
          </div>
        )}
        {!sorted.length ? (
          <p>There are no {sourceYear} events to clone.</p>
        ) : (
          <div className="clone-year-list">
            {sorted.map((event) => (
              <label className="clone-year-row" key={event.id}>
                <input
                  checked={rows[event.id]?.checked ?? false}
                  onChange={() => toggleRow(event.id)}
                  type="checkbox"
                />
                <span className="clone-year-name">{event.name}</span>
                <span className="clone-year-orig">{event.date}</span>
                <span aria-hidden="true">→</span>
                <input
                  disabled={!rows[event.id]?.checked}
                  onChange={(inputEvent) => setRowDate(event.id, inputEvent.target.value)}
                  type="date"
                  value={rows[event.id]?.newDate ?? ""}
                />
              </label>
            ))}
          </div>
        )}
        <div className="form-actions">
          <button className="button secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="button"
            disabled={submitting || !checkedCount}
            onClick={handleSubmit}
            type="button"
          >
            {submitting ? "Creating…" : `Create ${targetYear} (${checkedCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}
