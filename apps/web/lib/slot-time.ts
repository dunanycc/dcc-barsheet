export const STANDARD_SLOTS = [
  "11am–1pm",
  "1pm–3pm",
  "3pm–5pm",
  "5pm–7pm",
  "7pm–9pm",
  "9pm–11pm",
  "11pm–Closing",
];

export function slotStartMinutes(value: string) {
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!match) return 9999;
  let hour = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  if (match[3].toLowerCase() === "pm" && hour !== 12) hour += 12;
  if (match[3].toLowerCase() === "am" && hour === 12) hour = 0;
  return hour * 60 + minutes;
}
