"use client";

import { endOfWeek, startOfWeek, dayNumber } from "@/lib/time";
import type { CalendarRecord, HabitProgress, SyncStatus } from "@/lib/types";

type Props = {
  today: string;
  progress: HabitProgress[];
  calendars: CalendarRecord[];
  sync: SyncStatus[];
  syncing: boolean;
  onToggleCalendar: (id: string, enabled: boolean) => void;
  onNewHabit: () => void;
  onEditHabit: (habitId: string) => void;
  onManageCalendars: () => void;
  onRefresh: () => void;
};

export default function Sidebar({
  today,
  progress,
  calendars,
  sync,
  syncing,
  onToggleCalendar,
  onNewHabit,
  onEditHabit,
  onManageCalendars,
  onRefresh,
}: Props) {
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);
  const failures = sync.filter((s) => s.lastStatus === "error");
  const lastOk = sync
    .map((s) => s.lastSyncAt)
    .filter((v): v is string => !!v)
    .sort()
    .at(-1);

  return (
    <aside className="flex w-[268px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-thin">
        <section className="p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              This week
            </h2>
            <span className="text-[11px] tabular-nums text-[var(--text-faint)]">
              {dayNumber(weekStart)}–{dayNumber(weekEnd)}
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-2.5">
            {progress.length === 0 && (
              <p className="text-[12px] leading-relaxed text-[var(--text-faint)]">
                No habits yet. Add one, then tick its events on the calendar to build progress.
              </p>
            )}

            {progress.map((entry) => (
              <HabitRow key={entry.habit.id} entry={entry} onEdit={() => onEditHabit(entry.habit.id)} />
            ))}
          </div>

          <button
            type="button"
            onClick={onNewHabit}
            className="mt-3 w-full rounded-lg border border-dashed border-[var(--border)] py-2 text-[12px]
              text-[var(--text-muted)] transition-colors hover:border-[#3d3d3d] hover:text-[var(--text)]"
          >
            + New habit
          </button>
        </section>

        <section className="border-t border-[var(--border)] p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Calendars
            </h2>
            <button
              type="button"
              onClick={onManageCalendars}
              className="text-[11px] text-[var(--text-faint)] transition-colors hover:text-[var(--text)]"
            >
              Manage
            </button>
          </div>

          <div className="mt-2.5 flex flex-col gap-0.5">
            {calendars.map((calendar) => {
              const status = sync.find((s) => s.calendarId === calendar.id);
              return (
                <label
                  key={calendar.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-white/[0.04]"
                >
                  <input
                    type="checkbox"
                    checked={calendar.enabled}
                    onChange={(e) => onToggleCalendar(calendar.id, e.target.checked)}
                    className="size-3.5 shrink-0 cursor-pointer appearance-none rounded-[4px] border-2 transition-colors"
                    style={{
                      borderColor: calendar.color,
                      backgroundColor: calendar.enabled ? calendar.color : "transparent",
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text)]">
                    {calendar.name}
                  </span>
                  {status?.lastStatus === "error" && (
                    <span title={status.lastError ?? "Sync failed"} className="text-[11px] text-[#e05a5a]">
                      !
                    </span>
                  )}
                </label>
              );
            })}
            {calendars.length === 0 && (
              <p className="text-[12px] leading-relaxed text-[var(--text-faint)]">
                No calendars yet — add a published iCloud URL to get started.
              </p>
            )}
          </div>
        </section>
      </div>

      <footer className="border-t border-[var(--border)] px-4 py-3">
        <button
          type="button"
          onClick={onRefresh}
          disabled={syncing}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--card)] py-2 text-[12px]
            text-[var(--text)] transition-colors hover:bg-[var(--card-hover)] disabled:opacity-50"
        >
          <svg
            viewBox="0 0 16 16"
            className={`size-3.5 ${syncing ? "animate-spin" : ""}`}
            aria-hidden="true"
          >
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13 2v3h-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {syncing ? "Refreshing…" : "Refresh"}
        </button>
        <p className="mt-2 text-center text-[11px] text-[var(--text-faint)]">
          {failures.length > 0
            ? `${failures.length} calendar${failures.length > 1 ? "s" : ""} failed to sync`
            : lastOk
              ? `Synced ${relativeTime(lastOk)} · hourly`
              : "Not synced yet"}
        </p>
      </footer>
    </aside>
  );
}

function HabitRow({ entry, onEdit }: { entry: HabitProgress; onEdit: () => void }) {
  const { habit, done, target, planned, streak } = entry;
  const pct = target > 0 ? Math.min(100, (done / target) * 100) : 0;
  const met = done >= target;

  return (
    <button
      type="button"
      onClick={onEdit}
      className="group w-full rounded-lg px-1 py-1 text-left transition-colors hover:bg-white/[0.04]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text)]">{habit.name}</span>
        <span
          className="shrink-0 text-[12px] tabular-nums"
          style={{ color: met ? habit.color : "var(--text-muted)" }}
        >
          {done}/{target}
        </span>
      </div>

      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: habit.color }}
        />
      </div>

      <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-faint)]">
        {streak > 0 && <span>{streak}-day streak</span>}
        {planned > 0 && <span>{planned} planned</span>}
        {done === 0 && planned === 0 && <span>Nothing ticked yet</span>}
        {met && <span style={{ color: habit.color }}>Goal met</span>}
      </div>
    </button>
  );
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
