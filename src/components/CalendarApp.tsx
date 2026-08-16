"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import MonthGrid from "./MonthGrid";
import WeekGrid from "./WeekGrid";
import Sidebar from "./Sidebar";
import TodoBoard from "./TodoBoard";
import EventDialog, { type EventDialogTarget } from "./EventDialog";
import HabitDialog from "./HabitDialog";
import CalendarsDialog from "./CalendarsDialog";
import { addDays, addMonths, monthLabel, startOfWeek } from "@/lib/time";
import type { CalendarState, ViewMode } from "@/lib/view";
import type { HabitRecord, Occurrence } from "@/lib/types";

export default function CalendarApp({ initial }: { initial: CalendarState }) {
  const [state, setState] = useState(initial);
  const [view, setView] = useState<ViewMode>(initial.view);
  const [anchor, setAnchor] = useState(initial.anchor);
  const [syncing, setSyncing] = useState(false);
  const [dragging, setDragging] = useState<Occurrence | null>(null);

  const [eventTarget, setEventTarget] = useState<EventDialogTarget | null>(null);
  const [habitTarget, setHabitTarget] = useState<HabitRecord | null | undefined>(undefined);
  const [showCalendars, setShowCalendars] = useState(false);

  const refresh = useCallback(
    async (nextView: ViewMode = view, nextAnchor: string = anchor) => {
      const res = await fetch(`/api/state?view=${nextView}&anchor=${nextAnchor}`, {
        cache: "no-store",
      });
      if (res.ok) setState(await res.json());
    },
    [view, anchor],
  );

  useEffect(() => {
    refresh(view, anchor);
    // `refresh` is recreated whenever view/anchor change, which is exactly when
    // we want to refetch — depending on it directly would double-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchor]);

  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const occurrence of state.occurrences) {
      const list = map.get(occurrence.ymd);
      if (list) list.push(occurrence);
      else map.set(occurrence.ymd, [occurrence]);
    }
    return map;
  }, [state.occurrences]);

  const calendarsById = useMemo(
    () => new Map(state.calendars.map((c) => [c.id, c])),
    [state.calendars],
  );

  const sensors = useSensors(
    // A small threshold keeps the checkbox and card clicks working; a drag only
    // starts once the pointer actually travels.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  async function toggleCompletion(occurrence: Occurrence, completed: boolean) {
    // Optimistic — ticking should feel instant.
    setState((prev) => ({
      ...prev,
      occurrences: prev.occurrences.map((o) =>
        o.key === occurrence.key ? { ...o, completed } : o,
      ),
      board: {
        ...prev.board,
        occurrences: prev.board.occurrences.map((o) =>
          o.key === occurrence.key ? { ...o, completed } : o,
        ),
      },
    }));
    const res = await fetch("/api/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: occurrence.key, completed }),
    });
    // Refetch either way: on success for recomputed progress, on failure to
    // roll the optimistic tick back.
    await refresh();
    void res;
  }

  async function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const over = event.over?.id;
    const occurrence = event.active.data.current?.occurrence as Occurrence | undefined;
    if (!over || !occurrence) return;

    // Month cells are "YYYY-MM-DD"; week slots are "YYYY-MM-DD@minutes".
    const [toYmd, minutes] = String(over).split("@");
    const toStartMin = minutes === undefined ? undefined : Number(minutes);
    if (toYmd === occurrence.ymd && toStartMin === undefined) return;
    if (toYmd === occurrence.ymd && toStartMin === occurrence.startMin) return;

    await fetch("/api/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: occurrence.key, toYmd, toStartMin }),
    });
    await refresh();
  }

  async function runSync() {
    setSyncing(true);
    await fetch("/api/sync", { method: "POST" });
    setSyncing(false);
    await refresh();
  }

  async function toggleCalendar(id: string, enabled: boolean) {
    setState((prev) => ({
      ...prev,
      calendars: prev.calendars.map((c) => (c.id === id ? { ...c, enabled } : c)),
    }));
    await fetch("/api/calendars", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    await refresh();
  }

  const step = (direction: number) =>
    setAnchor((prev) =>
      view === "month" ? addMonths(prev, direction) : addDays(startOfWeek(prev), direction * 7),
    );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) =>
        setDragging((e.active.data.current?.occurrence as Occurrence) ?? null)
      }
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex h-dvh">
        <Sidebar
          today={state.today}
          progress={state.progress}
          calendars={state.calendars}
          sync={state.sync}
          syncing={syncing}
          onToggleCalendar={toggleCalendar}
          onNewHabit={() => setHabitTarget(null)}
          onEditHabit={(id) => setHabitTarget(state.habits.find((h) => h.id === id) ?? null)}
          onManageCalendars={() => setShowCalendars(true)}
          onRefresh={runSync}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <TodoBoard
            days={state.board.days}
            today={state.today}
            occurrences={state.board.occurrences}
            tasks={state.board.tasks}
            calendarsById={calendarsById}
            onToggleEvent={toggleCompletion}
            onChanged={() => refresh()}
          />

          <header className="flex items-center gap-3 px-5 py-3.5">
            <h1 className="text-[22px] font-semibold tracking-tight">
              {view === "month" ? monthLabel(anchor) : weekLabel(anchor)}
            </h1>

            <div className="flex-1" />

            <div className="flex overflow-hidden rounded-lg bg-[var(--card)] p-0.5">
              {(["month", "week"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  className={`rounded-[6px] px-3 py-1 text-[12px] capitalize transition-colors ${
                    view === mode ? "bg-[var(--card-hover)] text-[var(--text)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <NavButton label="Previous" onClick={() => step(-1)}>
                <path d="M10 3.5L5.5 8l4.5 4.5" />
              </NavButton>
              <button
                type="button"
                onClick={() => setAnchor(state.today)}
                className="rounded-lg px-3 py-1.5 text-[13px] text-[var(--text)] transition-colors hover:bg-white/[0.06]"
              >
                Today
              </button>
              <NavButton label="Next" onClick={() => step(1)}>
                <path d="M6 3.5L10.5 8L6 12.5" />
              </NavButton>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col border-t border-l border-[var(--border)]">
            {view === "month" ? (
              <MonthGrid
                days={state.days}
                anchor={anchor}
                today={state.today}
                byDay={byDay}
                calendarsById={calendarsById}
                onToggle={toggleCompletion}
                onOpen={(occurrence) => setEventTarget({ mode: "edit", occurrence })}
                onAdd={(ymd) => setEventTarget({ mode: "create", ymd })}
              />
            ) : (
              <WeekGrid
                days={state.days}
                today={state.today}
                byDay={byDay}
                calendarsById={calendarsById}
                onToggle={toggleCompletion}
                onOpen={(occurrence) => setEventTarget({ mode: "edit", occurrence })}
                onAdd={(ymd, startMin) => setEventTarget({ mode: "create", ymd, startMin })}
              />
            )}
          </div>
        </main>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div
            className="rounded-lg bg-[var(--card-hover)] px-2 py-1.5 text-[13px] font-semibold shadow-xl"
            style={{ boxShadow: `inset 3px 0 0 ${dragging.habitColor ?? "#6b6b6b"}` }}
          >
            {dragging.title}
          </div>
        )}
      </DragOverlay>

      {eventTarget && (
        <EventDialog
          target={eventTarget}
          calendars={state.calendars}
          onClose={() => setEventTarget(null)}
          onSaved={() => {
            setEventTarget(null);
            refresh();
          }}
        />
      )}

      {habitTarget !== undefined && (
        <HabitDialog
          habit={habitTarget}
          calendars={state.calendars}
          onClose={() => setHabitTarget(undefined)}
          onSaved={() => {
            setHabitTarget(undefined);
            refresh();
          }}
        />
      )}

      {showCalendars && (
        <CalendarsDialog
          calendars={state.calendars}
          sync={state.sync}
          onClose={() => setShowCalendars(false)}
          onChanged={refresh}
        />
      )}
    </DndContext>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-8 place-items-center rounded-lg text-[var(--text-muted)] transition-colors
        hover:bg-white/[0.06] hover:text-[var(--text)]"
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

function weekLabel(anchor: string): string {
  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  const fmt = (ymd: string, withMonth: boolean) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", {
      day: "numeric",
      ...(withMonth ? { month: "short" } : {}),
      timeZone: "UTC",
    });
  };
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const [y, m] = start.split("-").map(Number);
  const monthYear = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return sameMonth
    ? `${fmt(start, false)}–${fmt(end, false)} ${monthYear}`
    : `${fmt(start, true)} – ${fmt(end, true)} ${end.slice(0, 4)}`;
}
