"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Assignment = { id: string; enteredName: string; canRemove: boolean; profileLabel?: "PRIMARY" | "PARTNER" | null };
type VolunteerProfile = { id: string; firstName: string; lastName: string; relationship: "PRIMARY" | "PARTNER" };
type Shift = {
  id: string;
  displayTime: string;
  capacity: number;
  isOpen: boolean;
  assignments: Assignment[];
};
type Event = {
  id: string;
  date: string;
  name: string;
  notes: string | null;
  isLocked: boolean;
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

function displayMonth(value: string) {
  return monthTitle(value).toUpperCase();
}

function monthTitle(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00Z`));
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

function parseSlotTime(slotTime: string) {
  const value = slotTime.replace(/–/g, "-").trim();

  const structured = value.match(
    /^(\d{1,2}):(\d{2})\s*(am|pm)\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i,
  );
  if (structured) {
    let startHour = Number(structured[1]);
    const startMinute = Number(structured[2]);
    let endHour = Number(structured[4]);
    const endMinute = Number(structured[5]);
    if (/pm/i.test(structured[3]) && startHour !== 12) startHour += 12;
    if (/am/i.test(structured[3]) && startHour === 12) startHour = 0;
    if (/pm/i.test(structured[6]) && endHour !== 12) endHour += 12;
    if (/am/i.test(structured[6]) && endHour === 12) endHour = 0;
    return { start: [startHour, startMinute] as const, end: [endHour, endMinute] as const };
  }

  const simple = value.match(/^(\d{1,2})(am|pm)\s*-\s*(?:(\d{1,2})(am|pm)|(Closing))$/i);
  if (simple) {
    let startHour = Number(simple[1]);
    if (/pm/i.test(simple[2]) && startHour !== 12) startHour += 12;
    if (/am/i.test(simple[2]) && startHour === 12) startHour = 0;
    if (simple[5]) return { start: [startHour, 0] as const, end: null };
    let endHour = Number(simple[3]);
    if (/pm/i.test(simple[4]) && endHour !== 12) endHour += 12;
    if (/am/i.test(simple[4]) && endHour === 12) endHour = 0;
    return { start: [startHour, 0] as const, end: [endHour, 0] as const };
  }

  return null;
}

function foldIcsLine(line: string) {
  if (line.length <= 75) return line;
  let out = "";
  let pos = 0;
  while (pos < line.length) {
    out += (pos === 0 ? "" : "\r\n ") + line.slice(pos, pos + (pos === 0 ? 75 : 74));
    pos += pos === 0 ? 75 : 74;
  }
  return out;
}

function downloadIcs(event: Event, shift: Shift) {
  const escapeIcs = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const parsed = parseSlotTime(shift.displayTime);
  const [year, month, day] = event.date.split("-").map(Number);
  const pad2 = (value: number) => String(value).padStart(2, "0");
  const dateStamp = `${year}${pad2(month)}${pad2(day)}`;
  const stamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
  const uid = `dcc-bar-${event.date}-${shift.id}@barsheet`;
  const volunteerNames = shift.assignments.map((assignment) => assignment.enteredName);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DCC Bar Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
  ];

  if (parsed) {
    lines.push(`DTSTART:${dateStamp}T${pad2(parsed.start[0])}${pad2(parsed.start[1])}00`);
    if (parsed.end) {
      lines.push(`DTEND:${dateStamp}T${pad2(parsed.end[0])}${pad2(parsed.end[1])}00`);
    } else {
      lines.push("DURATION:PT2H");
    }
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateStamp}`, `DTEND;VALUE=DATE:${dateStamp}`);
  }

  lines.push(
    `DTSTAMP:${stamp}`,
    `UID:${uid}`,
    `SUMMARY:DCC Bar Shift: ${escapeIcs(event.name)}`,
    `DESCRIPTION:Volunteer shift — ${escapeIcs(shift.displayTime)}${volunteerNames.map((name) => `\\n- ${escapeIcs(name)}`).join("")}`,
    "LOCATION:Dunany Country Club",
    "END:VEVENT",
    "END:VCALENDAR",
  );

  const blob = new Blob([lines.map(foldIcsLine).join("\r\n")], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dcc-bar-${event.date}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function calendarBadge(event: Event) {
  const badge = eventBadge(event);
  const shortLabels: Record<string, string> = {
    locked: "Locked",
    na: "No shifts",
    full: "✓ Full",
    open: `${badge.label.split(" ")[0]} open`,
  };
  return { tone: badge.tone, label: shortLabels[badge.tone] };
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function eventBadge(event: Event) {
  const openShifts = event.shifts.filter((shift) => shift.isOpen);
  const unfilled = openShifts.reduce(
    (sum, shift) => sum + Math.max(0, shift.capacity - shift.assignments.length),
    0,
  );
  if (event.isLocked) return { label: "Locked", tone: "locked" as const };
  if (!openShifts.length) return { label: "No open shifts", tone: "na" as const };
  if (unfilled === 0) return { label: "Fully staffed", tone: "full" as const };
  return { label: `${unfilled} spot${unfilled !== 1 ? "s" : ""} open`, tone: "open" as const };
}

function groupByMonth(events: Event[]) {
  const groups: Array<{ month: string; events: Event[] }> = [];
  for (const event of events) {
    const month = event.date.slice(0, 7);
    const current = groups[groups.length - 1];
    if (current && current.month === month) current.events.push(event);
    else groups.push({ month, events: [event] });
  }
  return groups;
}

export default function ScheduleClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [profiles, setProfiles] = useState<VolunteerProfile[]>([]);
  const [signupChoice, setSignupChoice] = useState<{ shiftId: string; key: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"schedule" | "myshifts">("schedule");
  const [showPast, setShowPast] = useState(false);
  const [selectedScheduleYear, setSelectedScheduleYear] = useState("");
  const [openEventIds, setOpenEventIds] = useState<Set<string>>(new Set());
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [calendarMonth, setCalendarMonth] = useState<string | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "myshifts") setTab("myshifts");
  }, []);

  const loadSchedule = useCallback(async () => {
    try {
      const response = await fetch("/api/schedule", { cache: "no-store" });
      const payload = (await response.json()) as { events?: Event[]; profiles?: VolunteerProfile[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Schedule could not be loaded.");
      const nextEvents = payload.events ?? [];
      setEvents(nextEvents);
      setSelectedScheduleYear((current) => {
        if (current) return current;
        const availableYears = [...new Set(nextEvents.map((event) => event.date.slice(0, 4)))].sort();
        const calendarYear = todayIso().slice(0, 4);
        const initialYear = availableYears.includes(calendarYear) ? calendarYear : availableYears.at(-1) || calendarYear;
        if (isAdmin) window.dispatchEvent(new CustomEvent("schedule-year-change", { detail: Number(initialYear) }));
        return initialYear;
      });
      setProfiles(payload.profiles ?? []);
      setSelectedNames((current) => current.size ? current : new Set((payload.profiles ?? []).map((profile) => `${profile.firstName} ${profile.lastName}`.trim())));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Schedule could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  useEffect(() => {
    if (!pendingScrollId) return;
    const element = document.getElementById(`event-${pendingScrollId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingScrollId(null);
    }
  }, [pendingScrollId, showPast, events, openEventIds]);

  function jumpToEvent(event: Event) {
    setCalendarMonth(null);
    setOpenEventIds((current) => new Set(current).add(event.id));
    if (event.date < todayIso()) setShowPast(true);
    setPendingScrollId(event.id);
  }

  function toggleEventOpen(eventId: string) {
    setOpenEventIds((current) => {
      const next = new Set(current);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  async function signUp(shiftId: string, key: string, volunteerProfileId?: string) {
    if (!volunteerProfileId && profiles.length > 1) { setSignupChoice({ shiftId, key }); return; }
    setBusy(key);
    setNotice("");
    try {
      const response = await fetch(`/api/shifts/${shiftId}/signup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ volunteerProfileId: volunteerProfileId || profiles[0]?.id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Signup failed.");
      setNotice("You are signed up. Thank you!");
      await loadSchedule();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Signup failed.");
    } finally {
      setBusy("");
    }
  }

  async function removeSignup(assignmentId: string, volunteerName: string) {
    if (!window.confirm(`Remove ${volunteerName} from this shift?`)) return;
    setBusy(assignmentId);
    setNotice("");
    try {
      const response = await fetch(isAdmin ? `/api/admin/assignments/${assignmentId}` : `/api/assignments/${assignmentId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Removal failed.");
      setNotice("The signup was removed.");
      await loadSchedule();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Removal failed.");
    } finally {
      setBusy("");
    }
  }

  const availableYears = useMemo(() => [...new Set(events.map((event) => event.date.slice(0, 4)))].sort(), [events]);
  const scheduleYearForView = selectedScheduleYear || (availableYears.includes(todayIso().slice(0, 4)) ? todayIso().slice(0, 4) : availableYears.at(-1) || todayIso().slice(0, 4));

  const volunteerNames = useMemo(() => {
    const names = new Set<string>();
    events
      .filter((event) => scheduleYearForView === "all" || event.date.slice(0, 4) === scheduleYearForView)
      .forEach((event) =>
        event.shifts.forEach((shift) =>
          shift.assignments.forEach((assignment) => names.add(assignment.enteredName)),
        ),
      );
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [events, scheduleYearForView]);

  function toggleSelectedName(name: string) {
    setSelectedNames((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (loading) return <div className="state-card">Loading the schedule…</div>;
  if (error) {
    return (
      <div className="state-card error-state">
        <p>{error}</p>
        <button className="button secondary" onClick={() => void loadSchedule()}>
          Try again
        </button>
      </div>
    );
  }

  const today = todayIso();
  const selectedYearEvents = events.filter((event) => scheduleYearForView === "all" || event.date.slice(0, 4) === scheduleYearForView);
  const visibleEvents = selectedYearEvents.filter((event) => showPast || event.date >= today);
  const scheduleGroups = groupByMonth(visibleEvents);

  const myShiftsEvents = selectedYearEvents
    .map((event) => ({
      ...event,
      shifts: event.shifts.filter(
        (shift) =>
          shift.isOpen &&
          shift.assignments.some((assignment) => selectedNames.has(assignment.enteredName)),
      ),
    }))
    .filter((event) => event.shifts.length > 0);
  const myShiftsGroups = groupByMonth(myShiftsEvents);

  return (
    <section aria-label="Volunteer schedule">
      <div className="tab-bar volunteer-tabs">
        <button
          className={`tab-btn${tab === "schedule" ? " active" : ""}`}
          onClick={() => setTab("schedule")}
          type="button"
        >
          Schedule
        </button>
        <button
          className={`tab-btn${tab === "myshifts" ? " active" : ""}`}
          onClick={() => setTab("myshifts")}
          type="button"
        >
          My Shifts
        </button>
        <Link className="tab-btn" href="/profile">My Profile</Link>
        {isAdmin && <Link className="tab-btn" href="/admin">Administration</Link>}
        <div className="volunteer-tab-actions">
          {isAdmin && <label className="schedule-year-picker"><span className="sr-only">Schedule year</span><select aria-label="Schedule year" onChange={(event) => {
            const value = event.target.value;
            setSelectedScheduleYear(value);
            window.dispatchEvent(new CustomEvent("schedule-year-change", { detail: value === "all" ? "All Years" : Number(value) }));
          }} value={scheduleYearForView}>
            <option value="all">All years</option>
            {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select></label>}
          {tab === "schedule" && <label className="past-events-toggle">
              <input
                checked={showPast}
                onChange={(event) => setShowPast(event.target.checked)}
                type="checkbox"
              />
              Show past events
            </label>}
        </div>
      </div>

      {notice && <div className="notice" role="status">{notice}</div>}

      {tab === "schedule" ? (
        !scheduleGroups.length ? (
          <div className="state-card">
            <h2>No shifts posted yet</h2>
            <p>Please check back soon.</p>
          </div>
        ) : (
          <div className="event-list">
            {scheduleGroups.map((group) => (
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
                  const badge = eventBadge(event);
                  const isOpen = openEventIds.has(event.id);
                  return (
                    <article
                      className={`event-card${isOpen ? " open" : ""}${event.isLocked ? " locked" : ""}`}
                      id={`event-${event.id}`}
                      key={event.id}
                    >
                      <div
                        className="event-header"
                        onClick={() => toggleEventOpen(event.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(keyEvent) => {
                          if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                            keyEvent.preventDefault();
                            toggleEventOpen(event.id);
                          }
                        }}
                      >
                        <span className="event-date">{displayDate(event.date)}</span>
                        <span className="event-name">
                          {event.name}
                          {event.notes && <span className="event-notes">{event.notes}</span>}
                        </span>
                        <span className={`badge badge-${badge.tone}`}>{badge.label}</span>
                        <span className="chevron">▶</span>
                      </div>

                      {isOpen && (
                        <div className="slots-container">
                          {event.notes && <div className="public-notes">{event.notes}</div>}
                          {event.isLocked && (
                            <div className="locked-notice">
                              🔒 This event is locked. Contact the bar coordinator to sign up.
                            </div>
                          )}
                          {event.shifts.map((shift) => {
                            if (!shift.isOpen) {
                              return (
                                <div className="slot-row" key={shift.id}>
                                  <span className="slot-time">{shift.displayTime}</span>
                                  <span className="slot-closed">Closed</span>
                                </div>
                              );
                            }
                            const openCount = Math.max(
                              0,
                              shift.capacity - shift.assignments.length,
                            );
                            return (
                              <div className="slot-row" key={shift.id}>
                                <span className="slot-time">{shift.displayTime}</span>
                                <div className="volunteer-spots">
                                  {shift.assignments.map((assignment) => (
                                    <span
                                      className={`vol-chip${event.isLocked ? " locked-chip" : ""}`}
                                      key={assignment.id}
                                    >
                                      {assignment.enteredName}
                                      {assignment.canRemove && (!event.isLocked || isAdmin) && (
                                        <button
                                          aria-label={`Remove ${assignment.enteredName}`}
                                          className="x-btn"
                                          disabled={busy === assignment.id}
                                          onClick={() => void removeSignup(assignment.id, assignment.enteredName)}
                                          type="button"
                                        >
                                          ×
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                  {event.isLocked
                                    ? Array.from({ length: openCount }).map((_, index) => (
                                        <span className="add-link disabled-spot" key={index}>
                                          Open
                                        </span>
                                      ))
                                    : Array.from({ length: openCount }).map((_, index) => {
                                        const key = `${shift.id}-${index}`;
                                        return (
                                          <span className="open-spot" key={key}>
                                            <button
                                              className="add-link"
                                              disabled={busy === key}
                                              onClick={() => void signUp(shift.id, key)}
                                              type="button"
                                            >
                                              {busy === key ? "Adding…" : "+ Sign up"}
                                            </button>
                                          </span>
                                        );
                                      })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="myshifts-layout">
          <details className="myshifts-sidebar">
            <summary><span><small>People shown</small><strong>{selectedNames.size ? Array.from(selectedNames).join(", ") : "None selected"}</strong></span><span className="filter-change">Change</span></summary>
            <div className="volunteer-filter-options">
              <h3>Find anyone&apos;s shifts</h3>
              {!volunteerNames.length ? (
                <p className="myshifts-empty-list">No volunteers yet.</p>
              ) : (
                volunteerNames.map((name) => (
                  <label className="vol-checkbox-label" key={name}>
                    <input
                      checked={selectedNames.has(name)}
                      onChange={() => toggleSelectedName(name)}
                      type="checkbox"
                    />
                    {name}
                  </label>
                ))
              )}
            </div>
          </details>
          <div className="myshifts-main">
            {!selectedNames.size ? (
              <div className="myshifts-empty">Select one or more names to view their shifts.</div>
            ) : !myShiftsGroups.length ? (
              <div className="myshifts-empty">No shifts found for the selected volunteer(s).</div>
            ) : (
              myShiftsGroups.map((group) => (
                <div className="month-group" key={group.month}>
                  <div className="month-header">{displayMonth(group.month)}</div>
                  {group.events.map((event) => (
                    <article className="myshifts-card" key={event.id}>
                      <div className="myshifts-card-header">
                        <div className="myshifts-card-date">{displayDate(event.date)}</div>
                        <div className="myshifts-card-name">{event.name}</div>
                        {event.notes && <div className="myshifts-card-notes">{event.notes}</div>}
                      </div>
                      <div className="myshifts-slots">
                        {event.shifts.map((shift) => (
                          <div className="slot-row" key={shift.id}>
                            <div className="myshift-slot-heading"><span className="slot-time">{shift.displayTime}</span><button
                              className="ics-btn"
                              onClick={() => downloadIcs(event, shift)}
                              title="Download .ics file"
                              type="button"
                            >
                              📅 Add to calendar
                            </button></div>
                            <div className="volunteer-spots">
                              {shift.assignments.map((assignment) => (
                                <span
                                  className={`vol-chip${selectedNames.has(assignment.enteredName) ? " vol-chip-highlight" : ""}`}
                                  key={assignment.id}
                                >
                                  {assignment.enteredName}
                                  {assignment.profileLabel && <small className="profile-label">{assignment.profileLabel === "PRIMARY" ? "Primary" : "Partner"}</small>}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {calendarMonth && (
        <MonthCalendarModal
          events={selectedYearEvents}
          month={calendarMonth}
          onClose={() => setCalendarMonth(null)}
          onJump={jumpToEvent}
          onNavigate={setCalendarMonth}
        />
      )}
      {signupChoice && <div className="modal-overlay" onClick={() => setSignupChoice(null)}><div aria-labelledby="signup-person-title" aria-modal="true" className="modal signup-person-modal" onClick={(event) => event.stopPropagation()} role="dialog"><h2 id="signup-person-title">Who is taking this shift?</h2><div className="profile-choice-list">{profiles.map((profile) => <button className="profile-choice" key={profile.id} onClick={() => { const choice=signupChoice; setSignupChoice(null); void signUp(choice.shiftId,choice.key,profile.id); }} type="button"><strong>{profile.firstName} {profile.lastName}</strong><span>{profile.relationship === "PRIMARY" ? "Primary volunteer" : "Partner"}</span></button>)}</div><button className="button secondary" onClick={() => setSignupChoice(null)} type="button">Cancel</button></div></div>}
    </section>
  );
}

function MonthCalendarModal({
  events,
  month,
  onClose,
  onJump,
  onNavigate,
}: {
  events: Event[];
  month: string;
  onClose: () => void;
  onJump: (event: Event) => void;
  onNavigate: (month: string) => void;
}) {
  const availableMonths = useMemo(
    () => new Set(events.map((event) => event.date.slice(0, 7))),
    [events],
  );
  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);

  const eventsByDay = useMemo(() => {
    const map = new Map<number, Event[]>();
    events
      .filter((event) => event.date.slice(0, 7) === month)
      .forEach((event) => {
        const day = Number(event.date.slice(8, 10));
        const list = map.get(day) ?? [];
        list.push(event);
        map.set(day, list);
      });
    return map;
  }, [events, month]);

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
                  const badge = calendarBadge(event);
                  return (
                    <div
                      className={`mcal-ev mcal-ev-${badge.tone}`}
                      key={event.id}
                      onClick={() => onJump(event)}
                    >
                      <div className="mcal-ev-name">{event.name}</div>
                      <div className="mcal-ev-status">{badge.label}</div>
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
