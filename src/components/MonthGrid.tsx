"use client";

import { useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import EventCard from "./EventCard";
import { DAY_LABELS, dayNumber, isSameMonth } from "@/lib/time";
import type { CalendarRecord, Occurrence } from "@/lib/types";

type Props = {
  days: string[];
  anchor: string;
  today: string;
  byDay: Map<string, Occurrence[]>;
  calendarsById: Map<string, CalendarRecord>;
  onToggle: (occurrence: Occurrence, completed: boolean) => void;
  onOpen: (occurrence: Occurrence) => void;
  onAdd: (ymd: string) => void;
};

export default function MonthGrid({
  days,
  anchor,
  today,
  byDay,
  calendarsById,
  onToggle,
  onOpen,
  onAdd,
}: Props) {
  const weeks = Math.ceil(days.length / 7);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b border-[var(--border)]">
        {DAY_LABELS.map((label) => (
          <div key={label} className="py-2 text-center text-[13px] text-[var(--text-muted)]">
            {label}
          </div>
        ))}
      </div>

      <div
        className="grid min-h-0 flex-1 grid-cols-7"
        style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}
      >
        {days.map((ymd) => (
          <DayCell
            key={ymd}
            ymd={ymd}
            inMonth={isSameMonth(ymd, anchor)}
            isToday={ymd === today}
            occurrences={byDay.get(ymd) ?? []}
            calendarsById={calendarsById}
            onToggle={onToggle}
            onOpen={onOpen}
            onAdd={onAdd}
          />
        ))}
      </div>
    </div>
  );
}

function DayCell({
  ymd,
  inMonth,
  isToday,
  occurrences,
  calendarsById,
  onToggle,
  onOpen,
  onAdd,
}: {
  ymd: string;
  inMonth: boolean;
  isToday: boolean;
  occurrences: Occurrence[];
  calendarsById: Map<string, CalendarRecord>;
  onToggle: (occurrence: Occurrence, completed: boolean) => void;
  onOpen: (occurrence: Occurrence) => void;
  onAdd: (ymd: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: ymd });
  const listRef = useRef<HTMLDivElement>(null);
  const hidden = useHiddenCount(listRef, occurrences.length);

  return (
    <div
      ref={setNodeRef}
      className={`day-cell relative flex min-h-0 flex-col border-b border-r border-[var(--border)] transition-colors
        ${isOver ? "bg-white/[0.06]" : ""}`}
    >
      <div className="flex items-center justify-between px-1.5 pt-1.5">
        <button
          type="button"
          onClick={() => onAdd(ymd)}
          aria-label={`Add event on ${ymd}`}
          className="day-add grid size-6 place-items-center rounded-md bg-[var(--card)] text-[var(--text-muted)]
            transition-colors hover:bg-[var(--card-hover)] hover:text-[var(--text)]"
        >
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
            <path
              d="M8 3.5v9M3.5 8h9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <span
          className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[13px] font-medium tabular-nums
            ${isToday ? "bg-[var(--accent)] text-white" : inMonth ? "text-[var(--text)]" : "text-[var(--text-faint)]"}`}
        >
          {dayNumber(ymd)}
        </span>
      </div>

      <div
        ref={listRef}
        className="scroll-thin relative flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1.5 pt-1"
      >
        {occurrences.map((occurrence) => (
          <EventCard
            key={occurrence.key}
            occurrence={occurrence}
            calendar={
              occurrence.calendarId ? calendarsById.get(occurrence.calendarId) : undefined
            }
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ))}
      </div>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => listRef.current?.scrollBy({ top: 120, behavior: "smooth" })}
          className="absolute inset-x-1.5 bottom-0 rounded-t-md bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]
            to-transparent pb-1 pt-2 text-[11px] font-medium text-[var(--text-muted)]
            transition-colors hover:text-[var(--text)]"
        >
          +{hidden} more
        </button>
      )}
    </div>
  );
}

/**
 * How many event cards are scrolled out of view. Day cells are short, so
 * without this an event can be silently invisible — the count makes the
 * overflow explicit and gives somewhere to click.
 */
function useHiddenCount(ref: React.RefObject<HTMLDivElement | null>, total: number): number {
  const [hidden, setHidden] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Layout metrics, deliberately not getBoundingClientRect: cards run a
    // translate/scale entry animation, and rects include transforms, so a card
    // measured mid-animation reads as overflowing when it actually fits. The
    // list is `relative` so it is the offsetParent — otherwise offsetTop would
    // resolve against the day cell and include the day-number header.
    const measure = () => {
      const limit = node.clientHeight + node.scrollTop;
      let visible = 0;
      for (const child of Array.from(node.children) as HTMLElement[]) {
        if (child.offsetTop + child.offsetHeight <= limit + 1) visible += 1;
      }
      setHidden(Math.max(0, total - visible));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", measure);
    };
  }, [ref, total]);

  return hidden;
}
