"use client";

import { useEffect, useRef } from "react";

export const SWATCHES = [
  "#e8674a",
  "#e0a33e",
  "#4ec98a",
  "#3fb8c4",
  "#5b8def",
  "#a970e0",
  "#e05a8a",
  "#8d8d8d",
];

export default function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="pop-in flex max-h-[85vh] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl
          border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 place-items-center rounded-md text-[var(--text-muted)]
              transition-colors hover:bg-white/[0.06] hover:text-[var(--text)]"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto px-4 py-3.5">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-[13px] " +
  "text-[var(--text)] placeholder:text-[var(--text-faint)]";

export function Swatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Colour ${color}`}
          onClick={() => onChange(color)}
          className={`size-6 rounded-full transition-transform ${
            value === color ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--surface)]" : ""
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export function PrimaryButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-[13px] font-medium text-white
        transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  danger,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      {...rest}
      className={`rounded-lg px-3 py-1.5 text-[13px] transition-colors hover:bg-white/[0.06] ${
        danger ? "text-[#e05a5a]" : "text-[var(--text-muted)]"
      }`}
    >
      {children}
    </button>
  );
}
