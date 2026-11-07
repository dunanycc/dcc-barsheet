"use client";

import { useEffect, useState } from "react";

function currentScheduleYear() {
  return Number(new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date()));
}

export default function ScheduleYearTitle() {
  const [scheduleYear, setScheduleYear] = useState<number | "All Years">(currentScheduleYear);

  useEffect(() => {
    const updateYear = (event: Event) => setScheduleYear((event as CustomEvent<number | "All Years">).detail);
    window.addEventListener("schedule-year-change", updateYear);
    return () => window.removeEventListener("schedule-year-change", updateYear);
  }, []);

  return <>DCC Bar Schedule {scheduleYear}</>;
}
