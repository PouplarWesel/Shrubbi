export const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

const TIME_WITH_OPTIONAL_SECONDS_REGEX =
  /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;
const TIME_HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeWaterDays(
  value: number[] | null | undefined,
): number[] {
  if (!value?.length) return [];

  return Array.from(
    new Set(
      value.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  ).sort((a, b) => a - b);
}

export function normalizeWaterTimeForInput(
  value: string | null | undefined,
): string {
  if (!value) return "";
  const match = value.trim().match(TIME_WITH_OPTIONAL_SECONDS_REGEX);
  if (!match) return "";
  const [, hour, minute] = match;
  return `${hour}:${minute}`;
}

export function isValidWaterTimeInput(value: string): boolean {
  return TIME_HH_MM_REGEX.test(value.trim());
}

export function parseWaterTimeToMinutes(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const match = value.trim().match(TIME_WITH_OPTIONAL_SECONDS_REGEX);
  if (!match) return null;

  const [, hour, minute] = match;
  return Number(hour) * 60 + Number(minute);
}

export function formatWaterTime(value: string | null | undefined): string {
  const minutes = parseWaterTimeToMinutes(value);
  if (minutes == null) return "No time";

  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function formatWaterDays(days: number[] | null | undefined): string {
  const normalized = normalizeWaterDays(days);
  if (!normalized.length) return "No days";
  const labels = normalized
    .map((day) => WEEKDAY_OPTIONS.find((option) => option.value === day)?.label)
    .filter(Boolean);
  return labels.join(", ");
}

export function isDueToWaterNow(
  waterDays: number[] | null | undefined,
  waterTime: string | null | undefined,
  lastWateredAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const latestScheduledAt = getLatestScheduledAt(waterDays, waterTime, now);
  if (!latestScheduledAt) return false;

  const lastWateredDate = lastWateredAt ? new Date(lastWateredAt) : null;
  if (!lastWateredDate || Number.isNaN(lastWateredDate.getTime())) return true;

  return lastWateredDate.getTime() < latestScheduledAt.getTime();
}

export function getLatestScheduledAt(
  waterDays: number[] | null | undefined,
  waterTime: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  const normalizedDays = normalizeWaterDays(waterDays);
  if (!normalizedDays.length) return null;

  const minutesScheduled = parseWaterTimeToMinutes(waterTime);
  if (minutesScheduled == null) return null;

  for (let dayOffset = 0; dayOffset <= 6; dayOffset += 1) {
    const scheduledAt = new Date(now);
    scheduledAt.setHours(0, 0, 0, 0);
    scheduledAt.setDate(scheduledAt.getDate() - dayOffset);

    if (!normalizedDays.includes(scheduledAt.getDay())) continue;

    const hours = Math.floor(minutesScheduled / 60);
    const minutes = minutesScheduled % 60;
    scheduledAt.setHours(hours, minutes, 0, 0);

    if (scheduledAt.getTime() <= now.getTime()) {
      return scheduledAt;
    }
  }

  return null;
}
