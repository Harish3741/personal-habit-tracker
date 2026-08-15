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

The server binds to `127.0.0.1` only, so it is not reachable from other devices
on your network — including shared wifi. Use the tunnel below to reach it from
your phone.

## Reach it from your phone

```bash
./scripts/tunnel-macos.sh            # start sharing
./scripts/tunnel-macos.sh --status   # show the URL
./scripts/tunnel-macos.sh --off      # stop sharing
```

This uses Tailscale Serve: HTTPS terminates on your Mac's tailnet name and
proxies to the loopback port. Only devices signed into your Tailscale account
can reach it, and the app stays bound to `127.0.0.1` throughout.

One-time setup:

1. `brew install --cask tailscale` (or the Mac App Store build), open it, sign in.
2. In the [admin console](https://login.tailscale.com/admin/dns), enable
   **MagicDNS** and **HTTPS Certificates**. Serve needs both.
3. Install Tailscale on your phone and sign in with the same account.
4. Run the script, then open the printed `https://<machine>.<tailnet>.ts.net/`
   URL on your phone. *Add to Home Screen* gives it an app icon.

Sharing persists across reboots — `--off` is the only thing that stops it.

> The app has no login of its own, so **your tailnet is the authentication
> boundary**. Do not expose it with `tailscale funnel`, a Cloudflare quick
> tunnel, or port forwarding: any of those put your entire calendar on a public
> URL that anyone holding the link can read.

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
