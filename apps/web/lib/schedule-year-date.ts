function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function nearestMatchingWeekday(sourceDate: string, targetYear: number) {
  const [sourceYear, month, day] = sourceDate.split("-").map(Number);
  const source = new Date(Date.UTC(sourceYear, month - 1, day));
  if (
    !Number.isInteger(targetYear) ||
    !Number.isInteger(sourceYear) ||
    source.getUTCFullYear() !== sourceYear ||
    source.getUTCMonth() !== month - 1 ||
    source.getUTCDate() !== day
  ) {
    throw new Error("A valid source date and target year are required.");
  }

  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  const anchor = new Date(Date.UTC(targetYear, month - 1, Math.min(day, lastDayOfTargetMonth)));
  const candidates: Date[] = [];

  for (let offset = -6; offset <= 6; offset += 1) {
    const candidate = new Date(anchor);
    candidate.setUTCDate(anchor.getUTCDate() + offset);
    if (candidate.getUTCFullYear() === targetYear && candidate.getUTCDay() === source.getUTCDay()) {
      candidates.push(candidate);
    }
  }

  candidates.sort((left, right) => {
    const leftDistance = Math.abs(left.valueOf() - anchor.valueOf());
    const rightDistance = Math.abs(right.valueOf() - anchor.valueOf());
    return leftDistance - rightDistance || left.valueOf() - right.valueOf();
  });

  if (!candidates[0]) throw new Error("Could not find a matching weekday in the target year.");
  return isoDate(candidates[0]);
}
