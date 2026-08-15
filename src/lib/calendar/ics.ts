import ICAL from "ical.js";
import type { CalendarRecord } from "../types.js";
import { toWallClock } from "../time.js";
import type { CalendarSource, FetchWindow, ParsedOccurrence } from "./source.js";

/**
 * Reads a published iCloud calendar (the webcal/ICS "Public Calendar" link).
 *
 * Read-only by construction: there is no code path here that writes back to
 * iCloud, which is exactly the guarantee we want.
 */

/** Ceiling on occurrences generated from one recurring event, to bound work. */
const MAX_OCCURRENCES_PER_EVENT = 5000;

const FETCH_TIMEOUT_MS = 20_000;

export function normaliseFeedUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("webcal://")) return `https://${trimmed.slice("webcal://".length)}`;
  return trimmed;
}

export async function fetchIcsText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(normaliseFeedUrl(url), {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) {
      throw new Error("Response was not an iCalendar feed (no BEGIN:VCALENDAR)");
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Wall-clock for an ICAL.Time, keeping all-day dates floating. */
function wallOf(time: ICAL.Time): { ymd: string; minutes: number | null } {
  if (time.isDate) {
    const ymd = [
      String(time.year).padStart(4, "0"),
      String(time.month).padStart(2, "0"),
      String(time.day).padStart(2, "0"),
    ].join("-");
    return { ymd, minutes: null };
  }
  const wc = toWallClock(time.toJSDate());
  return { ymd: wc.ymd, minutes: wc.minutes };
}

/**
 * An all-day event's DTEND is exclusive in iCalendar (a one-day event on the
 * 15th ends on the 16th). Pull it back so the grid renders the right span.
 */
function inclusiveAllDayEnd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d - 1));
  return [
    String(shifted.getUTCFullYear()).padStart(4, "0"),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Expand an ICS document into concrete occurrences inside `window`.
 *
 * Handles what a real iCloud feed actually contains: VTIMEZONE definitions,
 * arbitrary RRULEs (not just WEEKLY), EXDATE cancellations, and RECURRENCE-ID
 * overrides where a single instance was moved or renamed.
 */
export function parseIcs(icsText: string, window: FetchWindow): ParsedOccurrence[] {
  const root = new ICAL.Component(ICAL.parse(icsText));

  for (const vtz of root.getAllSubcomponents("vtimezone")) {
    const tz = new ICAL.Timezone(vtz);
    if (!ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz);
  }

  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];

  for (const vevent of root.getAllSubcomponents("vevent")) {
    let event: ICAL.Event;
    try {
      event = new ICAL.Event(vevent);
    } catch {
      continue; // Malformed VEVENT — skip rather than fail the whole feed.
    }
    if (!event.startDate) continue;
    if (event.isRecurrenceException()) exceptions.push(event);
    else if (event.uid) masters.set(event.uid, event);
  }

  for (const exception of exceptions) {
    const master = exception.uid ? masters.get(exception.uid) : undefined;
    if (master) {
      master.relateException(exception);
    } else if (exception.uid) {
      // Override with no master in the feed — keep it as a standalone event.
      masters.set(`${exception.uid}::${exception.recurrenceId?.toString()}`, exception);
    }
  }

  const out: ParsedOccurrence[] = [];

  for (const event of masters.values()) {
    const uid = event.uid ?? "";
    const summary = (event.summary ?? "").trim() || "(no title)";
    const notes = (event.description ?? "").trim() || null;

    const emit = (
      startTime: ICAL.Time,
      endTime: ICAL.Time | null,
      recurrenceId: string | null,
      title: string,
      description: string | null,
    ) => {
      const start = wallOf(startTime);
      if (start.ymd > window.toYmd) return;
      const allDay = startTime.isDate;
      const rawEnd = endTime ? wallOf(endTime) : null;
      const endYmd = rawEnd
        ? allDay
          ? inclusiveAllDayEnd(rawEnd.ymd)
          : rawEnd.ymd
        : start.ymd;
      if ((endYmd < start.ymd ? start.ymd : endYmd) < window.fromYmd) return;
      if (start.ymd < window.fromYmd && endYmd < window.fromYmd) return;

      out.push({
        uid,
        recurrenceId,
        title,
        ymd: start.ymd,
        startMin: allDay ? null : start.minutes,
        endYmd: endYmd < start.ymd ? start.ymd : endYmd,
        endMin: allDay ? null : (rawEnd?.minutes ?? null),
        allDay,
        notes: description,
      });
    };

    if (!event.isRecurring()) {
      emit(event.startDate, event.endDate, null, summary, notes);
      continue;
    }

    let iterator: ICAL.RecurExpansion;
    try {
      iterator = event.iterator();
    } catch {
      emit(event.startDate, event.endDate, null, summary, notes);
      continue;
    }

    let guard = 0;
    let next: ICAL.Time | null;
    while ((next = iterator.next()) && guard++ < MAX_OCCURRENCES_PER_EVENT) {
      let details;
      try {
        details = event.getOccurrenceDetails(next);
      } catch {
        continue;
      }
      const occStart = wallOf(details.startDate);
      if (occStart.ymd > window.toYmd) break;
      if (occStart.ymd < window.fromYmd) continue;

      // getOccurrenceDetails resolves RECURRENCE-ID overrides, so an instance
      // that was renamed or moved comes back with its edited values.
      emit(
        details.startDate,
        details.endDate,
        details.recurrenceId.toString(),
        (details.item.summary ?? summary).trim() || summary,
        (details.item.description ?? "").trim() || notes,
      );
    }
  }

  return out;
}

export class IcsCalendarSource implements CalendarSource {
  readonly kind = "ics";

  async fetchOccurrences(
    calendar: CalendarRecord,
    window: FetchWindow,
  ): Promise<ParsedOccurrence[]> {
    const text = await fetchIcsText(calendar.url);
    return parseIcs(text, window);
  }
}
