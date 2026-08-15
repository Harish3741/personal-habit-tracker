import type { CalendarRecord } from "../types.js";
import type { CalendarSource, FetchWindow, ParsedOccurrence } from "./source.js";

/**
 * Placeholder for the CalDAV source (step 2 of the calendar plan).
 *
 * Compared with published ICS this gives near-live sync instead of Apple's
 * ~15-60 minute CDN cache, every calendar behind one credential instead of a
 * per-calendar share link, and per-event ETags so only changes are fetched.
 *
 * To implement:
 *   1. Apple ID + app-specific password (appleid.apple.com -> Sign-In and
 *      Security -> App-Specific Passwords). Store it in the OS keychain, never
 *      in the repo.
 *   2. PROPFIND https://caldav.icloud.com/ for current-user-principal, then the
 *      calendar-home-set, then PROPFIND Depth:1 to list calendars.
 *   3. REPORT calendar-query with a time-range filter per calendar; feed each
 *      returned VEVENT through the existing parseIcs expansion.
 *
 * The returned ParsedOccurrence shape is unchanged, so sync/storage/UI stay put.
 */
export class CalDavCalendarSource implements CalendarSource {
  readonly kind = "caldav";

  async fetchOccurrences(
    _calendar: CalendarRecord,
    _window: FetchWindow,
  ): Promise<ParsedOccurrence[]> {
    throw new Error(
      "CalDAV source is not implemented yet — use a published ICS calendar URL for now.",
    );
  }
}
