import { db, newId, nowIso } from "./db.js";
import { addDays, endOfWeek, startOfWeek, todayYmd } from "./time.js";
import type {
  CalendarRecord,
  HabitProgress,
  HabitRecord,
  MatchMode,
  Occurrence,
  TargetType,
} from "./types.js";

/* ------------------------------------------------------------------ calendars */

type CalendarRow = Omit<CalendarRecord, "enabled"> & { enabled: number };

export function listCalendars(): CalendarRecord[] {
  const rows = db()
    .prepare(
      `SELECT id, name, color, kind, url, enabled, position
         FROM calendars ORDER BY position, name`,
    )
    .all() as CalendarRow[];
  return rows.map((r) => ({ ...r, enabled: !!r.enabled }));
}

export function createCalendar(input: {
  name: string;
  url: string;
  color?: string;
  kind?: string;
}): CalendarRecord {
  const conn = db();
  const max = conn.prepare("SELECT COALESCE(MAX(position), -1) AS p FROM calendars").get() as {
    p: number;
  };
  const id = newId();
  conn
    .prepare(
      `INSERT INTO calendars (id, name, color, kind, url, enabled, position)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(id, input.name.trim(), input.color ?? "#8b8b8b", input.kind ?? "ics", input.url.trim(), max.p + 1);
  return listCalendars().find((c) => c.id === id)!;
}

export function updateCalendar(
  id: string,
  patch: Partial<Pick<CalendarRecord, "name" | "url" | "color" | "enabled">>,
): void {
  const conn = db();
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  if (patch.name !== undefined) (sets.push("name = @name"), (params.name = patch.name.trim()));
  if (patch.url !== undefined) (sets.push("url = @url"), (params.url = patch.url.trim()));
  if (patch.color !== undefined) (sets.push("color = @color"), (params.color = patch.color));
  if (patch.enabled !== undefined)
    (sets.push("enabled = @enabled"), (params.enabled = patch.enabled ? 1 : 0));
  if (!sets.length) return;
  conn.prepare(`UPDATE calendars SET ${sets.join(", ")} WHERE id = @id`).run(params);
}

export function deleteCalendar(id: string): void {
  db().prepare("DELETE FROM calendars WHERE id = ?").run(id);
}

/* -------------------------------------------------------------------- habits */

type HabitRow = Omit<HabitRecord, "archived"> & { archived: number };

function toHabit(row: HabitRow): HabitRecord {
  return { ...row, archived: !!row.archived };
}

export function listHabits(includeArchived = false): HabitRecord[] {
  const rows = db()
    .prepare(
      `SELECT id, name, match_title AS matchTitle, match_mode AS matchMode,
              calendar_id AS calendarId, target_type AS targetType,
              target_count AS targetCount, color, archived, position
         FROM habits
        ${includeArchived ? "" : "WHERE archived = 0"}
        ORDER BY position, name`,
    )
    .all() as HabitRow[];
  return rows.map(toHabit);
}

export function createHabit(input: {
  name: string;
  matchTitle?: string;
  matchMode?: MatchMode;
  calendarId?: string | null;
  targetType?: TargetType;
  targetCount?: number;
  color?: string;
}): HabitRecord {
  const conn = db();
  const max = conn.prepare("SELECT COALESCE(MAX(position), -1) AS p FROM habits").get() as {
    p: number;
  };
  const id = newId();
  const name = input.name.trim();
  conn
    .prepare(
      `INSERT INTO habits
         (id, name, match_title, match_mode, calendar_id, target_type, target_count, color, archived, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(
      id,
      name,
      (input.matchTitle ?? name).trim(),
      input.matchMode ?? "exact",
      input.calendarId ?? null,
      input.targetType ?? "times_per_week",
      input.targetCount ?? 1,
      input.color ?? "#e8734a",
      max.p + 1,
    );
  return listHabits(true).find((h) => h.id === id)!;
}

export function updateHabit(id: string, patch: Partial<HabitRecord>): void {
  const columns: Record<string, string> = {
    name: "name",
    matchTitle: "match_title",
    matchMode: "match_mode",
    calendarId: "calendar_id",
    targetType: "target_type",
    targetCount: "target_count",
    color: "color",
    position: "position",
  };
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const [key, column] of Object.entries(columns)) {
    const value = patch[key as keyof HabitRecord];
    if (value === undefined) continue;
    sets.push(`${column} = @${key}`);
    params[key] = typeof value === "string" ? value.trim() : value;
  }
  if (patch.archived !== undefined) {
    sets.push("archived = @archived");
    params.archived = patch.archived ? 1 : 0;
  }
  if (!sets.length) return;
  db().prepare(`UPDATE habits SET ${sets.join(", ")} WHERE id = @id`).run(params);
}

export function deleteHabit(id: string): void {
  db().prepare("DELETE FROM habits WHERE id = ?").run(id);
}

/* --------------------------------------------------------------- occurrences */

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** First habit whose title rule and calendar scope match this event. */
function matchHabit(
  habits: HabitRecord[],
  title: string,
  calendarId: string | null,
): HabitRecord | null {
  const haystack = normalise(title);
  for (const habit of habits) {
    if (habit.calendarId && habit.calendarId !== calendarId) continue;
    const needle = normalise(habit.matchTitle);
    if (!needle) continue;
    const hit = habit.matchMode === "contains" ? haystack.includes(needle) : haystack === needle;
    if (hit) return habit;
  }
  return null;
}

type IcsRow = {
  key: string;
  calendarId: string;
  title: string;
  ymd: string;
  startMin: number | null;
  endYmd: string;
  endMin: number | null;
  allDay: number;
  notes: string | null;
};

type LocalRow = {
  id: string;
  calendarId: string | null;
  title: string;
  ymd: string;
  startMin: number | null;
  endYmd: string;
  endMin: number | null;
  allDay: number;
  notes: string | null;
  detachedFromKey: string | null;
};

/** Sort key: all-day events first, then by start time, then title. */
function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const aMin = a.startMin ?? 0;
  const bMin = b.startMin ?? 0;
  if (aMin !== bMin) return aMin - bMin;
  return a.title.localeCompare(b.title);
}

export function getOccurrences(fromYmd: string, toYmd: string): Occurrence[] {
  const conn = db();
  const habits = listHabits();

  const icsRows = conn
    .prepare(
      `SELECT e.key, e.calendar_id AS calendarId, e.title, e.ymd,
              e.start_min AS startMin, e.end_ymd AS endYmd, e.end_min AS endMin,
              e.all_day AS allDay, e.notes
         FROM ics_events e
         JOIN calendars c ON c.id = e.calendar_id
        WHERE e.ymd BETWEEN ? AND ?
          AND c.enabled = 1
          AND e.key NOT IN (SELECT key FROM hidden_occurrences)`,
    )
    .all(fromYmd, toYmd) as IcsRow[];

  const localRows = conn
    .prepare(
      `SELECT id, calendar_id AS calendarId, title, ymd, start_min AS startMin,
              end_ymd AS endYmd, end_min AS endMin, all_day AS allDay, notes,
              detached_from_key AS detachedFromKey
         FROM local_events
        WHERE ymd BETWEEN ? AND ?`,
    )
    .all(fromYmd, toYmd) as LocalRow[];

  const completedKeys = new Set(
    (
      conn
        .prepare("SELECT occurrence_key AS key FROM completions WHERE ymd BETWEEN ? AND ?")
        .all(fromYmd, toYmd) as { key: string }[]
    ).map((r) => r.key),
  );

  const decorate = (
    key: string,
    origin: "ics" | "local",
    row: { title: string; calendarId: string | null },
  ) => {
    const habit = matchHabit(habits, row.title, row.calendarId);
    return {
      key,
      origin,
      habitId: habit?.id ?? null,
      habitName: habit?.name ?? null,
      habitColor: habit?.color ?? null,
      completed: completedKeys.has(key),
    };
  };

  const out: Occurrence[] = [
    ...icsRows.map((r) => ({
      ...decorate(r.key, "ics" as const, r),
      calendarId: r.calendarId,
      title: r.title,
      ymd: r.ymd,
      startMin: r.startMin,
      endYmd: r.endYmd,
      endMin: r.endMin,
      allDay: !!r.allDay,
      notes: r.notes,
      detachedFromKey: null,
    })),
    ...localRows.map((r) => ({
      ...decorate(`local:${r.id}`, "local" as const, r),
      calendarId: r.calendarId,
      title: r.title,
      ymd: r.ymd,
      startMin: r.startMin,
      endYmd: r.endYmd,
      endMin: r.endMin,
      allDay: !!r.allDay,
      notes: r.notes,
      detachedFromKey: r.detachedFromKey,
    })),
  ];

  return out.sort((a, b) => (a.ymd === b.ymd ? compareOccurrences(a, b) : a.ymd.localeCompare(b.ymd)));
}

/* -------------------------------------------------------------- local events */

export function createLocalEvent(input: {
  title: string;
  ymd: string;
  calendarId?: string | null;
  startMin?: number | null;
  endMin?: number | null;
  endYmd?: string;
  allDay?: boolean;
  notes?: string | null;
  detachedFromKey?: string | null;
}): string {
  const id = newId();
  const allDay = input.allDay ?? input.startMin == null;
  db()
    .prepare(
      `INSERT INTO local_events
         (id, calendar_id, title, ymd, start_min, end_ymd, end_min, all_day, notes, detached_from_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.calendarId ?? null,
      input.title.trim(),
      input.ymd,
      allDay ? null : (input.startMin ?? null),
      input.endYmd ?? input.ymd,
      allDay ? null : (input.endMin ?? null),
      allDay ? 1 : 0,
      input.notes ?? null,
      input.detachedFromKey ?? null,
      nowIso(),
    );
  return id;
}

export function updateLocalEvent(
  id: string,
  patch: {
    title?: string;
    ymd?: string;
    startMin?: number | null;
    endMin?: number | null;
    endYmd?: string;
    allDay?: boolean;
    notes?: string | null;
    calendarId?: string | null;
  },
): void {
  const columns: Record<string, string> = {
    title: "title",
    ymd: "ymd",
    startMin: "start_min",
    endMin: "end_min",
    endYmd: "end_ymd",
    notes: "notes",
    calendarId: "calendar_id",
  };
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const [key, column] of Object.entries(columns)) {
    const value = patch[key as keyof typeof patch];
    if (value === undefined) continue;
    sets.push(`${column} = @${key}`);
    params[key] = typeof value === "string" && key === "title" ? value.trim() : value;
  }
  if (patch.allDay !== undefined) {
    sets.push("all_day = @allDay");
    params.allDay = patch.allDay ? 1 : 0;
  }
  if (!sets.length) return;
  db().prepare(`UPDATE local_events SET ${sets.join(", ")} WHERE id = @id`).run(params);
}

export function deleteLocalEvent(id: string): void {
  const conn = db();
  const row = conn
    .prepare("SELECT detached_from_key AS key FROM local_events WHERE id = ?")
    .get(id) as { key: string | null } | undefined;

  const remove = conn.transaction(() => {
    conn.prepare("DELETE FROM local_events WHERE id = ?").run(id);
    conn.prepare("DELETE FROM completions WHERE occurrence_key = ?").run(`local:${id}`);
    // Deleting a detached copy restores the iCloud original it was hiding.
    if (row?.key) conn.prepare("DELETE FROM hidden_occurrences WHERE key = ?").run(row.key);
  });
  remove();
}

/**
 * Move an event to a new day, and optionally a new start time.
 *
 * Local events move in place. An iCloud event cannot be edited (and must never
 * be written back), so dragging one detaches a local copy at the new slot and
 * hides the original — the user's chosen behaviour.
 */
export function moveOccurrence(
  key: string,
  toYmd: string,
  toStartMin?: number | null,
): { key: string } {
  const conn = db();
  const retime = toStartMin !== undefined && toStartMin !== null;

  if (key.startsWith("local:")) {
    const id = key.slice("local:".length);
    const row = conn
      .prepare(
        `SELECT ymd, end_ymd AS endYmd, start_min AS startMin, end_min AS endMin, all_day AS allDay
           FROM local_events WHERE id = ?`,
      )
      .get(id) as
      | { ymd: string; endYmd: string; startMin: number | null; endMin: number | null; allDay: number }
      | undefined;
    if (!row) throw new Error("Event not found");
    const span = Math.max(0, daysApart(row.ymd, row.endYmd));

    if (retime) {
      const duration = durationOf(row.startMin, row.endMin);
      conn
        .prepare(
          `UPDATE local_events
              SET ymd = ?, end_ymd = ?, start_min = ?, end_min = ?, all_day = 0
            WHERE id = ?`,
        )
        .run(toYmd, addDays(toYmd, span), toStartMin, toStartMin! + duration, id);
    } else {
      conn
        .prepare("UPDATE local_events SET ymd = ?, end_ymd = ? WHERE id = ?")
        .run(toYmd, addDays(toYmd, span), id);
    }
    conn.prepare("UPDATE completions SET ymd = ? WHERE occurrence_key = ?").run(toYmd, key);
    return { key };
  }

  const source = conn
    .prepare(
      `SELECT calendar_id AS calendarId, title, ymd, start_min AS startMin,
              end_ymd AS endYmd, end_min AS endMin, all_day AS allDay, notes
         FROM ics_events WHERE key = ?`,
    )
    .get(key) as
    | {
        calendarId: string;
        title: string;
        ymd: string;
        startMin: number | null;
        endYmd: string;
        endMin: number | null;
        allDay: number;
        notes: string | null;
      }
    | undefined;
  if (!source) throw new Error("Event not found");

  const span = Math.max(0, daysApart(source.ymd, source.endYmd));
  const duration = durationOf(source.startMin, source.endMin);
  let newId = "";
  const detach = conn.transaction(() => {
    newId = createLocalEvent({
      title: source.title,
      ymd: toYmd,
      calendarId: source.calendarId,
      startMin: retime ? toStartMin : source.startMin,
      endMin: retime ? toStartMin! + duration : source.endMin,
      endYmd: addDays(toYmd, span),
      allDay: retime ? false : !!source.allDay,
      notes: source.notes,
      detachedFromKey: key,
    });
    conn
      .prepare("INSERT OR REPLACE INTO hidden_occurrences (key, created_at) VALUES (?, ?)")
      .run(key, nowIso());
    // Carry a tick across to the detached copy so progress is not lost.
    conn
      .prepare("UPDATE completions SET occurrence_key = ?, ymd = ? WHERE occurrence_key = ?")
      .run(`local:${newId}`, toYmd, key);
  });
  detach();

  return { key: `local:${newId}` };
}

/** Length of an event in minutes, defaulting to an hour when it has no end. */
function durationOf(startMin: number | null, endMin: number | null): number {
  if (startMin === null || endMin === null) return 60;
  return Math.max(15, endMin - startMin);
}

function daysApart(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/* ---------------------------------------------------------------- completions */

/**
 * Tick or untick an event. Only events matching a habit can be ticked — the
 * checkbox is the sole way a habit gets credited, so there is no separate
 * habit-level logging path.
 */
export function setCompletion(occurrenceKey: string, completed: boolean): void {
  const conn = db();
  if (!completed) {
    conn.prepare("DELETE FROM completions WHERE occurrence_key = ?").run(occurrenceKey);
    return;
  }

  const habits = listHabits();
  let row: { title: string; ymd: string; calendarId: string | null } | undefined;

  if (occurrenceKey.startsWith("local:")) {
    row = conn
      .prepare("SELECT title, ymd, calendar_id AS calendarId FROM local_events WHERE id = ?")
      .get(occurrenceKey.slice("local:".length)) as typeof row;
  } else {
    row = conn
      .prepare("SELECT title, ymd, calendar_id AS calendarId FROM ics_events WHERE key = ?")
      .get(occurrenceKey) as typeof row;
  }
  if (!row) throw new Error("Event not found");

  const habit = matchHabit(habits, row.title, row.calendarId);
  if (!habit) throw new Error("This event does not match a tracked habit");

  conn
    .prepare(
      `INSERT INTO completions (occurrence_key, habit_id, ymd, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(occurrence_key) DO UPDATE SET habit_id = excluded.habit_id, ymd = excluded.ymd`,
    )
    .run(occurrenceKey, habit.id, row.ymd, nowIso());
}

/* ------------------------------------------------------------------ progress */

/** Weekly progress for each habit, derived entirely from ticked events. */
export function getHabitProgress(anchorYmd: string = todayYmd()): HabitProgress[] {
  const conn = db();
  const habits = listHabits();
  if (!habits.length) return [];

  const weekStart = startOfWeek(anchorYmd);
  const weekEnd = endOfWeek(anchorYmd);
  const occurrences = getOccurrences(weekStart, weekEnd);
  const today = todayYmd();

  return habits.map((habit) => {
    const mine = occurrences.filter((o) => o.habitId === habit.id);
    const completed = mine.filter((o) => o.completed);
    const distinctDays = new Set(completed.map((o) => o.ymd));

    let done: number;
    let target: number;
    if (habit.targetType === "times_per_week") {
      done = completed.length;
      target = habit.targetCount;
    } else if (habit.targetType === "days_per_week") {
      done = distinctDays.size;
      target = habit.targetCount;
    } else {
      done = distinctDays.size;
      target = 7;
    }

    return {
      habit,
      done,
      target,
      planned: mine.length - completed.length,
      streak: currentStreak(conn, habit.id, today),
    };
  });
}

/** Consecutive days ending today (or yesterday, if today is still open). */
function currentStreak(
  conn: ReturnType<typeof db>,
  habitId: string,
  today: string,
): number {
  const rows = conn
    .prepare("SELECT DISTINCT ymd FROM completions WHERE habit_id = ? ORDER BY ymd DESC LIMIT 400")
    .all(habitId) as { ymd: string }[];
  const days = new Set(rows.map((r) => r.ymd));
  if (!days.size) return 0;

  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * Distinct event titles in the cached window, so the habit form can show how
 * many events a typed title would actually match before it is saved.
 */
export function titleSuggestions(calendarId: string | null): { title: string; count: number }[] {
  const conn = db();
  const rows = (
    calendarId
      ? conn
          .prepare(
            `SELECT title, COUNT(*) AS count FROM ics_events WHERE calendar_id = ?
              GROUP BY title ORDER BY count DESC, title LIMIT 200`,
          )
          .all(calendarId)
      : conn
          .prepare(
            `SELECT title, COUNT(*) AS count FROM ics_events
              GROUP BY title ORDER BY count DESC, title LIMIT 200`,
          )
          .all()
  ) as { title: string; count: number }[];
  return rows;
}
