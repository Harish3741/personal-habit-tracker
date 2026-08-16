import { addDays, monthGridDays, weekDays } from "./time.js";
import {
  getHabitProgress,
  getOccurrences,
  listCalendars,
  listHabits,
  listTasks,
  type TaskRecord,
} from "./store.js";
import { syncStatus } from "./sync.js";
import type { CalendarRecord, HabitProgress, Occurrence, SyncStatus } from "./types.js";

export type ViewMode = "month" | "week";

/**
 * The to-do board is a rolling seven-day window starting yesterday, so
 * something finished late is still in reach and the next five days are
 * visible. It is deliberately independent of the calendar's navigation —
 * browsing to next month must not move the board off today.
 */
export const BOARD_DAYS = 7;

export function boardDays(today: string): string[] {
  const start = addDays(today, -1);
  return Array.from({ length: BOARD_DAYS }, (_, i) => addDays(start, i));
}

export type BoardState = {
  days: string[];
  occurrences: Occurrence[];
  tasks: TaskRecord[];
};

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
  board: BoardState;
};

export function rangeFor(view: ViewMode, anchor: string): string[] {
  return view === "week" ? weekDays(anchor) : monthGridDays(anchor);
}

function buildBoard(today: string): BoardState {
  const days = boardDays(today);
  return {
    days,
    occurrences: getOccurrences(days[0], days[days.length - 1]),
    tasks: listTasks(days[0], days[days.length - 1]),
  };
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
    board: buildBoard(today),
  };
}
