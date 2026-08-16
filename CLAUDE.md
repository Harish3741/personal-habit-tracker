# Working notes

## Always end with the local link

After every change, finish the reply with the command to run the app and the
URL, so it can be opened without hunting for it:

```bash
git pull && npm install && npm run dev
```

→ **http://localhost:4321**

`npm install` only matters when dependencies changed, but it is a no-op
otherwise and saves a confusing failure.

## Shape of the app

- Local-only. Next.js + SQLite (`data/habits.db`), no hosting, no auth.
- Binds `127.0.0.1` deliberately — not reachable from other devices.
- Reads published iCloud ICS feeds. **There is no write path to iCloud**;
  keep it that way.
- Calendar URLs are read-secrets: they belong in `.env.local` or the SQLite
  database, never in a commit.

## Conventions

- `src/lib` stays free of Next imports and uses NodeNext `.js` specifiers so it
  compiles and tests under plain `tsc`. `next.config.ts` maps those back to the
  TypeScript sources for the bundler.
- Timezone handling: events are normalised once at ingest into APP_TZ
  wall-clock (`ymd` + minutes from midnight). Don't reintroduce `Date` maths in
  layout or goal code.
- Weeks run Monday–Sunday. The to-do board is the exception: a rolling
  yesterday → +5 window, independent of calendar navigation.
- `npm test` compiles `src/lib` then runs the parser/time tests. Run it before
  claiming a change works.
