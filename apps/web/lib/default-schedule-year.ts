/** Default to next year only once no current-year events remain today or later. */
export function defaultScheduleYear(events: ReadonlyArray<{ date: string }>, today: string): string {
  const current = today.slice(0, 4);
  const next = String(Number(current) + 1);
  const hasRemaining = events.some(event => event.date.slice(0, 4) === current && event.date >= today);
  return !hasRemaining && events.some(event => event.date.slice(0, 4) === next) ? next : current;
}
