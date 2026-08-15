import type { CalendarRecord } from "../types.js";

/** One expanded occurrence, already normalised to APP_TZ wall-clock. */
export type ParsedOccurrence = {
  uid: string;
  recurrenceId: string | null;
  title: string;
  ymd: string;
  startMin: number | null;
  endYmd: string;
  endMin: number | null;
  allDay: boolean;
  notes: string | null;
};

export type FetchWindow = { fromYmd: string; toYmd: string };

/**
 * Where calendar data comes from. Today the only implementation is the
 * published-ICS one; a CalDAV implementation slots in here without the sync
 * layer, the store, or the UI changing.
 */
export interface CalendarSource {
  readonly kind: string;
  fetchOccurrences(calendar: CalendarRecord, window: FetchWindow): Promise<ParsedOccurrence[]>;
}
