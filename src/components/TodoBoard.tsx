"use client";

import { useRef, useState } from "react";
import { dayNumber, formatMinutes } from "@/lib/time";
import type { CalendarRecord, Occurrence } from "@/lib/types";
import type { TaskRecord } from "@/lib/store";

type Props = {
  days: string[];
  today: string;
  occurrences: Occurrence[];
  tasks: TaskRecord[];
  calendarsById: Map<string, CalendarRecord>;
  onToggleEvent: (occurrence: Occurrence, completed: boolean) => void;
  onChanged: () => void;
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekdayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * Seven-day to-do board above the calendar. Columns run yesterday → +5 and do
 * not follow the calendar's navigation.
 *
 * Each column mixes two kinds of row: events pulled from the calendar (ticking
 * one is the same completion the calendar card shows) and free-text tasks that
 * exist only here — adding a task never creates a calendar event.
 */
export default function TodoBoard({
  days,
  today,
  occurrences,
  tasks,
  calendarsById,
  onToggleEvent,
  onChanged,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const yesterday = days[0];

  const eventsByDay = new Map<string, Occurrence[]>();
  for (const occurrence of occurrences) {
    const list = eventsByDay.get(occurrence.ymd);
    if (list) list.push(occurrence);
    else eventsByDay.set(occurrence.ymd, [occurrence]);
  }

  const tasksByDay = new Map<string, TaskRecord[]>();
  for (const task of tasks) {
    // Unfinished tasks from before the window surface in the first column.
    const column = task.ymd < yesterday ? yesterday : task.ymd;
    const list = tasksByDay.get(column);
    if (list) list.push(task);
    else tasksByDay.set(column, [task]);
  }

  const outstanding = tasks.filter((t) => !t.done).length;

  return (
    <section className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)]">
      <header className="flex items-center gap-2 px-5 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide
            text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          <svg
            viewBox="0 0 16 16"
            className={`size-3 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
          To do
        </button>
        <span className="text-[11px] text-[var(--text-faint)]">
          {outstanding > 0 ? `${outstanding} open` : "all clear"}
        </span>
      </header>

      {!collapsed && (
        <div className="grid grid-cols-7 border-t border-[var(--border)]">
          {days.map((ymd) => (
            <DayColumn
              key={ymd}
              ymd={ymd}
              isToday={ymd === today}
              isPast={ymd < today}
              events={eventsByDay.get(ymd) ?? []}
              tasks={tasksByDay.get(ymd) ?? []}
              calendarsById={calendarsById}
              onToggleEvent={onToggleEvent}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DayColumn({
  ymd,
  isToday,
  isPast,
  events,
  tasks,
  calendarsById,
  onToggleEvent,
  onChanged,
}: {
  ymd: string;
  isToday: boolean;
  isPast: boolean;
  events: Occurrence[];
  tasks: TaskRecord[];
  calendarsById: Map<string, CalendarRecord>;
  onToggleEvent: (occurrence: Occurrence, completed: boolean) => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState("");
  // Enter submits and blur submits, and blur fires right after Enter. React
  // state clears a render too late for the second call to see it, so the ref
  // is the source of truth — cleared synchronously, it makes the follow-up
  // blur a no-op instead of adding the task twice.
  const pending = useRef("");

  function setValue(value: string) {
    pending.current = value;
    setDraft(value);
  }

  async function addTask() {
    const title = pending.current.trim();
    if (!title) return;
    setValue("");
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ymd, title }),
    });
    onChanged();
  }

  return (
    <div className={`flex min-w-0 flex-col border-r border-[var(--border)] ${isPast ? "opacity-70" : ""}`}>
      <div className="flex items-baseline gap-1.5 px-2 pt-2">
        <span className="text-[11px] text-[var(--text-muted)]">{weekdayLabel(ymd)}</span>
        <span
          className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-medium tabular-nums
            ${isToday ? "bg-[var(--accent)] text-white" : "text-[var(--text)]"}`}
        >
          {dayNumber(ymd)}
        </span>
      </div>

      <div className="scroll-thin flex max-h-[168px] min-h-[104px] flex-col gap-px overflow-y-auto px-1.5 py-1.5">
        {events.map((occurrence) => (
          <EventRow
            key={occurrence.key}
            occurrence={occurrence}
            calendar={occurrence.calendarId ? calendarsById.get(occurrence.calendarId) : undefined}
            onToggle={onToggleEvent}
          />
        ))}

        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} column={ymd} onChanged={onChanged} />
        ))}

        {events.length === 0 && tasks.length === 0 && (
          <p className="px-1 py-1 text-[11px] text-[var(--text-faint)]">Nothing yet</p>
        )}
      </div>

      <div className="px-1.5 pb-1.5">
        <input
          value={draft}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTask();
            if (e.key === "Escape") setValue("");
          }}
          onBlur={addTask}
          placeholder="+ task"
          aria-label={`Add a task on ${ymd}`}
          className="w-full rounded-md bg-transparent px-1 py-1 text-[12px] text-[var(--text)]
            placeholder:text-[var(--text-faint)] focus:bg-[var(--bg)]"
        />
      </div>
    </div>
  );
}

function Tick({
  checked,
  color,
  label,
  onChange,
}: {
  checked: boolean;
  color: string;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-[3px] size-3 shrink-0 cursor-pointer appearance-none rounded-[3px] border
        border-[#6a6a6a] transition-colors checked:border-transparent"
      style={
        checked
          ? {
              backgroundColor: color,
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath fill='none' stroke='%23131313' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round' d='M3 7.2l2.6 2.6L11 4.4'/%3E%3C/svg%3E\")",
              backgroundSize: "100%",
            }
          : undefined
      }
    />
  );
}

function EventRow({
  occurrence,
  calendar,
  onToggle,
}: {
  occurrence: Occurrence;
  calendar: CalendarRecord | undefined;
  onToggle: (occurrence: Occurrence, completed: boolean) => void;
}) {
  const color = occurrence.habitColor ?? calendar?.color ?? "#6b6b6b";

  return (
    <div className="group flex items-start gap-1.5 rounded-md px-1 py-1 hover:bg-white/[0.04]">
      <Tick
        checked={occurrence.completed}
        color={color}
        label={`Mark ${occurrence.title} done`}
        onChange={(next) => onToggle(occurrence, next)}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[12px] leading-tight ${
            occurrence.completed ? "text-[var(--text-faint)] line-through" : "text-[var(--text)]"
          }`}
          title={occurrence.title}
        >
          {occurrence.title}
        </span>
        {!occurrence.allDay && (
          <span className="block text-[10px] leading-tight text-[var(--text-faint)]">
            {formatMinutes(occurrence.startMin)}
          </span>
        )}
      </span>
      <span
        className="mt-[5px] size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        title={calendar?.name ?? "No calendar"}
      />
    </div>
  );
}

function TaskRow({
  task,
  column,
  onChanged,
}: {
  task: TaskRecord;
  column: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const carried = task.ymd < column;

  async function patch(body: Record<string, unknown>) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, ...body }),
    });
    onChanged();
  }

  async function remove() {
    await fetch(`/api/tasks?id=${encodeURIComponent(task.id)}`, { method: "DELETE" });
    onChanged();
  }

  async function commit() {
    setEditing(false);
    const title = draft.trim();
    if (!title) return remove();
    if (title !== task.title) await patch({ title });
  }

  return (
    <div className="group flex items-start gap-1.5 rounded-md px-1 py-1 hover:bg-white/[0.04]">
      <Tick
        checked={task.done}
        color="#8d8d8d"
        label={`Mark ${task.title} done`}
        onChange={(next) => patch({ done: next })}
      />

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(task.title);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 rounded bg-[var(--bg)] px-1 text-[12px] text-[var(--text)]"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`min-w-0 flex-1 truncate text-left text-[12px] leading-tight ${
            task.done ? "text-[var(--text-faint)] line-through" : "text-[var(--text)]"
          }`}
          title={carried ? `Carried over from ${task.ymd}` : task.title}
        >
          {carried && <span className="mr-1 text-[var(--text-faint)]">↩</span>}
          {task.title}
        </button>
      )}

      <button
        type="button"
        onClick={remove}
        aria-label={`Delete ${task.title}`}
        className="mt-[2px] shrink-0 text-[var(--text-faint)] opacity-0 transition-opacity
          hover:text-[#e05a5a] group-hover:opacity-100"
      >
        <svg viewBox="0 0 16 16" className="size-3" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
