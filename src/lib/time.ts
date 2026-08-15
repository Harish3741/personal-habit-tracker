/**
 * Time handling for the habit tracker.
 *
 * The whole app works in a single display timezone (APP_TZ, default
 * Australia/Sydney). Rather than passing `Date` objects around and converting
 * repeatedly, every event is normalised once at ingest into *wall-clock* form:
 *
 *   ymd      "2026-08-15"  — the calendar day it lands on in APP_TZ
 *   startMin 545           — minutes from local midnight (null for all-day)
 *
 * Grid layout, "sort by start time", and weekly goal windows are then plain
 * integer/string arithmetic with no timezone reasoning at all. Only the ICS
 * ingest boundary deals with absolute instants.
 */

export const APP_TZ = process.env.APP_TZ ?? "Australia/Sydney";

/** Day the week starts on for weekly goals and the calendar grid. 1 = Monday. */
export const WEEK_STARTS_ON = 1;

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MS_PER_DAY = 86_400_000;

const ymdFormatterCache = new Map<string, Intl.DateTimeFormat>();

function ymdFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = ymdFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    ymdFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

export type WallClock = { ymd: string; minutes: number };

/** Convert an absolute instant into wall-clock date + minutes in `timeZone`. */
export function toWallClock(date: Date, timeZone: string = APP_TZ): WallClock {
  const parts = ymdFormatter(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    // Intl renders midnight as 24 in some ICU versions under hourCycle h23.
    minutes: (hour % 24) * 60 + minute,
  };
}

/** Today's date in APP_TZ. */
export function todayYmd(timeZone: string = APP_TZ): string {
  return toWallClock(new Date(), timeZone).ymd;
}

/** Treat a YYYY-MM-DD as UTC midnight — a stable anchor for day arithmetic. */
function ymdToUtc(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToYmd(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(ymd: string, days: number): string {
  return utcToYmd(ymdToUtc(ymd) + days * MS_PER_DAY);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((ymdToUtc(to) - ymdToUtc(from)) / MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(ymd: string): number {
  return new Date(ymdToUtc(ymd)).getUTCDay();
}

/** Monday of the week containing `ymd`. */
export function startOfWeek(ymd: string): string {
  const dow = dayOfWeek(ymd);
  const offset = (dow - WEEK_STARTS_ON + 7) % 7;
  return addDays(ymd, -offset);
}

export function endOfWeek(ymd: string): string {
  return addDays(startOfWeek(ymd), 6);
}

export function startOfMonth(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

export function addMonths(ymd: string, months: number): string {
  const [y, m] = ymd.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

/**
 * The days rendered by the month grid: whole weeks covering the month, so the
 * grid always starts on a Monday and shows trailing/leading days like the
 * macOS Calendar month view.
 */
export function monthGridDays(anchorYmd: string): string[] {
  const first = startOfMonth(anchorYmd);
  const gridStart = startOfWeek(first);
  const lastOfMonth = addDays(addMonths(first, 1), -1);
  const gridEnd = endOfWeek(lastOfMonth);
  const count = daysBetween(gridStart, gridEnd) + 1;
  return Array.from({ length: count }, (_, i) => addDays(gridStart, i));
}

export function weekDays(anchorYmd: string): string[] {
  const start = startOfWeek(anchorYmd);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 545 -> "9:05 am" */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "all-day";
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "09:05" -> 545. Returns null for empty input. */
export function parseTimeInput(value: string): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** 545 -> "09:05", for <input type="time"> */
export function toTimeInput(minutes: number | null): string {
  if (minutes === null) return "";
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function monthLabel(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function dayNumber(ymd: string): number {
  return parseInt(ymd.slice(8, 10), 10);
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}
