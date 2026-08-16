# Handover

Written for the next agent picking this up. Everything below reflects the state
at commit `41e45f0` on branch `claude/habit-tracker-icalendar-w6bid5`.

Read `CLAUDE.md` too — it holds the working conventions. This document holds the
history and the *why*, which is the part that is expensive to rediscover.

---

## 1. What this is

A local-only habit tracker for one person on one Mac. It mirrors published
iCloud calendars into a month/week grid, puts a seven-day to-do board above it,
and tracks habits from the events the user ticks off.

**The build has never run against the user's real calendars.** It was developed
in a cloud container whose network policy allowed package registries only —
`p103-caldav.icloud.com` returned 403 at the proxy. Everything was built and
tested against a fixture ICS served over local HTTP. Treat the first run on real
data as the real integration test; the most likely failures are habit titles not
matching and per-calendar sync errors (a red `!` in the sidebar).

## 2. Run it

```bash
cd ~/personal-habit-tracker
git checkout claude/habit-tracker-icalendar-w6bid5
npm install && npm run dev
```

→ **http://localhost:4321**

There is no `main` branch on the remote — this branch is all there is.

`npm test` compiles `src/lib` with `tsc`, then runs the parser and time tests
(17 of them). Run it before claiming a change works.

**Standing request from the user: end every reply with the run command and the
URL above.** This is in `CLAUDE.md` because it was asked for explicitly.

## 3. First-run setup the user still has to do

The app starts empty. Calendars go in via the sidebar → **Manage**, or via
`CALENDAR_<NAME>_URL` vars in `.env.local`, which seed the database on first run.

The user's six published iCloud URLs live in their n8n workflow **"Daily Task
Reminder"** (`WwuksnW4N1RhvD5d`), in the HTTP nodes named `Get Work Calendar`,
`Get Uni Calendar`, `Get Society Calendar`, `Get Health Calendar`,
`Get Dilly Dally Calendar`, `Get Life Calendar`.

**Those URLs are read-secrets** — anyone holding one can read that calendar.
They are deliberately not in this repo and must never be committed. `.env.local`
and `data/*.db` are gitignored; keep it that way.

That n8n flow also pulls a Google Calendar (`harish.uniwork@gmail.com`). The
user chose to leave Google out for now.

## 4. Decisions the user made

These were each answered explicitly. **Do not re-litigate them without asking.**

| Area | Decision |
| --- | --- |
| Calendar source | Published iCloud ICS now; CalDAV later, deliberately deferred |
| Stack | Local Next.js + SQLite, no hosting, no auth |
| Views | Month grid default, week view behind a toggle |
| Filtering | Show all events, per-calendar filters in the sidebar |
| Sync | Hourly background refresh + a manual Refresh button |
| Week start | Monday. Timezone `Australia/Sydney` (`APP_TZ`) |
| Habit definition | Typed manually: name, calendar, exact/contains title match |
| Goal types | times per week, days per week, every day |
| Completion | **Ticking an event is the only way to credit a habit.** No separate habit checklist — this was a correction the user made mid-build |
| Unscheduled sessions | Log by adding a local event and ticking it |
| Dragging an iCloud event | Detaches a local copy at the new slot, hides the original. Deleting the copy restores it. **Never writes to iCloud** |
| To-do board | 7 columns, yesterday → +5, independent of calendar navigation |
| Board tasks | Free text, local only. Adding one never creates a calendar event |
| Board ticks | Same single completion state as the calendar card |
| Remote access | Explicitly removed. GitHub Pages, Tailscale, phone access — all out of scope. Local only |

### Judgement calls made without being asked

Flag these if they come up; the user has not objected but has not confirmed either.

- **Unfinished tasks dated before the board window carry into the first column**
  (marked `↩`). The window rolls daily, so otherwise they would silently
  scroll out of reach.
- **The board respects the sidebar calendar filters.** The user said the board
  should be "independent" of the calendar, which was about *navigation*; showing
  events from a calendar they had switched off seemed more surprising.
- **All events are tickable**, not just habit-matching ones, so "Dentist" works
  as a to-do. Only habit matches move habit progress.

## 5. Architecture

```
src/lib/          no Next imports, NodeNext ".js" specifiers, testable under plain tsc
  time.ts         wall-clock helpers, week/month maths
  types.ts        shared types
  db.ts           SQLite open + schema migrations
  store.ts        all data access: calendars, habits, occurrences, tasks, completions
  sync.ts         fetch orchestration, hourly scheduler, occurrence keys
  view.ts         assembles the state the UI renders
  calendar/
    source.ts     CalendarSource interface
    ics.ts        published-ICS implementation
    caldav.ts     documented stub
src/app/api/      state, events, completions, habits, calendars, tasks, sync
src/components/   CalendarApp shell, MonthGrid, WeekGrid, TodoBoard, Sidebar, dialogs
```

`next.config.ts` maps the `.js` specifiers back to TypeScript sources for the
bundler. This is what lets `src/lib` be tested outside Next — don't "fix" it by
dropping the extensions.

### Three things that will bite if you don't know them

**Time model.** Events are normalised *once* at ICS ingest into APP_TZ
wall-clock: a `ymd` string plus minutes from midnight. Everything downstream —
grid layout, sorting, weekly goal windows — is integer and string arithmetic
with no timezone reasoning. Do not reintroduce `Date` maths in layout or goal
code; that is what the DST tests guard.

**Occurrence keys must stay stable across syncs.** Completions reference them.
`${calendarId}:${uid}` for one-offs, `${calendarId}:${uid}:${recurrenceId}` for
recurring instances. Local events use `local:${id}`.

**The ICS cache is disposable, everything else is not.** `ics_events` is wiped
and rewritten per calendar on every sync. `local_events`, `habits`,
`completions`, `tasks` and `hidden_occurrences` are user data.

### Schema

`calendars`, `ics_events` (cache), `local_events`, `hidden_occurrences`,
`habits`, `completions`, `tasks`, `sync_state`.

`completions.habit_id` is **nullable** — a ticked event that matches no habit is
just a to-do. Older databases are migrated by rebuilding the table, since SQLite
cannot drop a `NOT NULL` constraint in place (`relaxCompletionHabit` in `db.ts`).

## 6. Testing

`tests/` covers the parts that fail silently rather than loudly:

- a weekly 07:00 event stays 07:00 either side of the Sydney DST switch
- `EXDATE` removes a cancelled instance
- `RECURRENCE-ID` overrides move and rename a single instance
- all-day `DTEND` is exclusive, so a one-day event ends the same day
- non-weekly `RRULE`s expand (the user's n8n code only handled `FREQ=WEEKLY`,
  so monthly events were being silently dropped there)
- Monday-start week and month-grid arithmetic

There are no component tests. UI behaviour was verified by driving a real
browser: drag-detach, tick → progress, delete-restores-original, and the
task double-submit case.

## 7. Bugs already found and fixed — don't reintroduce

- **`offsetTop` overflow miscount.** The month cell's "+N more" measured child
  `offsetTop` against the scroll list, but the list was not positioned, so the
  offset resolved against the day cell and included the day-number header. The
  list is now `relative`. `getBoundingClientRect` is *not* the fix here: cards
  run a translate/scale entry animation and rects include transforms, so a card
  measured mid-animation reads as overflowing when it fits.
- **Event cards had no `shrink-0`.** As flex children they compressed to fit and
  clipped their own text instead of overflowing, which also suppressed the
  "+N more" affordance because nothing technically overflowed.
- **Task double-submit.** Enter submits and the following blur submitted again
  from a stale closure. A ref cleared synchronously is the guard; React state
  clears a render too late.
- **Habit sub-label** said "Nothing ticked yet" next to a non-zero count when
  there was no active streak.

## 8. Open threads

- **CalDAV** (`src/lib/calendar/caldav.ts`) — the intended next step for calendar
  access. Near-live instead of Apple's 15–60 min cache, one app-specific
  password instead of six share links, per-event ETags. The stub documents the
  PROPFIND/REPORT sequence. It is one adapter file; storage, matching and UI
  don't change.
- **Long-term tracking.** The user explicitly deferred this: "we can figure out
  the best way to represent long-term goal tracking once we have more data".
  Weekly progress in the sidebar is all that exists.
- **Google Calendar** — out for now; would need OAuth, or its private ICS URL.
- **Mac widget** — the user's original ask was a widget. Current answer is
  Safari → Add to Dock. A real WidgetKit widget was discussed and deferred.
- `scripts/install-macos.sh` installs a launchd agent so the app runs at login.
  Untested on real macOS — written and syntax-checked only.

## 9. Working style that fits this user

They ask good clarifying questions back and correct course quickly. They
respond well to being told what was *not* verified. Two habits worth keeping:

- Ask before guessing on product decisions; they answer precisely and dislike
  assumptions.
- State plainly what was tested and what wasn't. Several fixes in this repo came
  from admitting a gap rather than papering over it.
