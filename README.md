# Habits

A local-only calendar and habit tracker. It reads your published iCloud
calendars, shows them in a month/week grid, and tracks habits from the events
you tick off.

Everything runs on your Mac. Nothing is written back to iCloud, ever.

## How it works

- **Calendars are read-only mirrors.** Published iCloud (`webcal://`) feeds are
  fetched hourly and cached in SQLite. There is no write path to iCloud in this
  codebase.
- **Habits match event titles.** A habit like `Gym` matches events titled "Gym",
  optionally scoped to one calendar (e.g. only your Health calendar).
- **Ticking an event is the only way to complete a habit.** There is no separate
  habit checklist — progress comes from the checkbox on the event card. If you
  did something unscheduled, add it as an event and tick it.
- **Events you add stay local.** They live in SQLite and are marked with a small
  grey dot.
- **Dragging an iCloud event detaches a local copy** at the new day/time and
  hides the original. Delete the copy and the original comes back. The iCloud
  event itself is never modified.

Weeks run Monday–Sunday; dates render in `APP_TZ` (default `Australia/Sydney`).

## Setup

```bash
npm install
cp .env.example .env.local     # optional — you can add calendars in the UI instead
npm run dev                    # http://localhost:4321
```

To get a calendar URL: **Calendar.app → right-click a calendar → Share Calendar
→ tick Public Calendar → copy the link.** Paste it into the app's *Calendars*
dialog (sidebar → Manage), or into `.env.local`.

> These links let anyone holding them read that calendar. They are secrets.
> `.env.local` and `data/*.db` are gitignored — keep them out of commits.

## Run it whenever the laptop is on

```bash
./scripts/install-macos.sh
```

This builds the app and installs a launchd agent that starts it at login and
restarts it if it ever dies. Logs go to `~/Library/Logs/habits-tracker.log`.

Then open `http://localhost:4321` in Safari and choose **File → Add to Dock** for
an app icon and a chromeless window.

Remove it with `./scripts/install-macos.sh --uninstall`.

The server binds to `127.0.0.1`, so it is reachable from this Mac only — not
from other devices on the network, including shared wifi.

## Goal types

| Type | Counts |
| --- | --- |
| Times per week | every ticked event (two gym sessions in a day count twice) |
| Days per week | distinct days with at least one ticked event |
| Every day | distinct days, target fixed at 7, with a streak |

## Development

```bash
npm run dev      # dev server (127.0.0.1:4321; HOST/PORT override)
npm run build    # production build
npm test         # compiles src/lib with tsc, then runs the parser/time tests
```

`src/lib` is deliberately free of Next-specific imports and uses NodeNext `.js`
specifiers so it compiles and tests with plain `tsc`. `next.config.ts` maps
those specifiers back to the TypeScript sources for the bundler.

Tests cover the parts most likely to break silently: DST boundaries, `EXDATE`
cancellations, `RECURRENCE-ID` overrides, all-day exclusive end dates, non-weekly
recurrence rules, and Monday-start week maths.

## Swapping ICS for CalDAV later

Calendar access sits behind the `CalendarSource` interface
(`src/lib/calendar/source.ts`). `IcsCalendarSource` is the current
implementation; `CalDavCalendarSource` is a stub documenting the steps. CalDAV
gives near-live sync instead of Apple's cache delay, all calendars behind one
app-specific password, and per-event ETags. Swapping it in means writing that
one adapter — storage, habit matching, and the UI don't change.
