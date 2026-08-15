import { monthGridDays, weekDays } from "./time.js";
import { getHabitProgress, getOccurrences, listCalendars, listHabits } from "./store.js";
import { syncStatus } from "./sync.js";
import type { CalendarRecord, HabitProgress, Occurrence, SyncStatus } from "./types.js";

export type ViewMode = "month" | "week";

export type CalendarState = {
  view: ViewMode;
  anchor: string;
  days: string[];
  occurrences: Occurrence[];
  progress: HabitProgress[];
  calendars: CalendarRecord[];
  habits: ReturnType<typeof listHabits>;
  sync: SyncStatus[];
  today: string;
};

export function rangeFor(view: ViewMode, anchor: string): string[] {
  return view === "week" ? weekDays(anchor) : monthGridDays(anchor);
}

export function buildState(view: ViewMode, anchor: string, today: string): CalendarState {
  const days = rangeFor(view, anchor);
  return {
    view,
    anchor,
    days,
    occurrences: getOccurrences(days[0], days[days.length - 1]),
    progress: getHabitProgress(today),
    calendars: listCalendars(),
    habits: listHabits(),
    sync: syncStatus(),
    today,
  };
}
