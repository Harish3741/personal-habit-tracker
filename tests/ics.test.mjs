import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseIcs } from "../.test-build/calendar/ics.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ics = fs.readFileSync(path.join(here, "fixtures/sample.ics"), "utf8");

const WINDOW = { fromYmd: "2026-01-01", toYmd: "2026-12-31" };
const all = parseIcs(ics, WINDOW);

const byUid = (uid) => all.filter((o) => o.uid === uid).sort((a, b) => a.ymd.localeCompare(b.ymd));

test("timed event keeps its Sydney wall-clock time", () => {
  const [gym] = byUid("simple-timed@test");
  assert.equal(gym.ymd, "2026-08-12");
  assert.equal(gym.startMin, 6 * 60 + 30);
  assert.equal(gym.endMin, 7 * 60 + 30);
  assert.equal(gym.allDay, false);
});

test("UTC event lands on the correct Sydney day across the date line", () => {
  // 2026-08-14T23:30Z is 09:30 on the 15th in Sydney (AEST, UTC+10).
  const [call] = byUid("utc-rollover@test");
  assert.equal(call.ymd, "2026-08-15");
  assert.equal(call.startMin, 9 * 60 + 30);
});

test("all-day event is floating — no timezone shift", () => {
  const [rest] = byUid("all-day@test");
  assert.equal(rest.ymd, "2026-08-15");
  assert.equal(rest.allDay, true);
  assert.equal(rest.startMin, null);
  // DTEND 20260816 is exclusive, so a one-day event ends on the 15th.
  assert.equal(rest.endYmd, "2026-08-15");
});

test("multi-day all-day event ends on its last real day", () => {
  const [trip] = byUid("multi-day@test");
  assert.equal(trip.ymd, "2026-08-20");
  assert.equal(trip.endYmd, "2026-08-22");
});

test("weekly recurrence holds wall-clock time across the DST switch", () => {
  // Sydney enters daylight saving on 2026-10-04. A 07:00 weekly event must
  // stay at 07:00 either side of it — the case naive UTC-offset maths breaks.
  const games = byUid("weekly-dst@test");
  assert.deepEqual(
    games.map((g) => g.ymd),
    ["2026-09-28", "2026-10-05", "2026-10-12"],
  );
  for (const game of games) assert.equal(game.startMin, 7 * 60);
});

test("EXDATE removes the cancelled instance", () => {
  const sessions = byUid("weekly-exdate@test");
  assert.deepEqual(
    sessions.map((s) => s.ymd),
    ["2026-08-03", "2026-08-17", "2026-08-24"],
  );
});

test("RECURRENCE-ID override moves and renames a single instance", () => {
  const visits = byUid("weekly-override@test");
  assert.deepEqual(
    visits.map((v) => v.ymd),
    ["2026-09-01", "2026-09-09", "2026-09-15"],
  );
  const moved = visits.find((v) => v.ymd === "2026-09-09");
  assert.equal(moved.title, "Physio (moved)");
  assert.equal(moved.startMin, 14 * 60);
  // Untouched instances keep the series title and time.
  assert.equal(visits[0].title, "Physio");
  assert.equal(visits[0].startMin, 9 * 60);
});

test("non-weekly recurrence rules are expanded too", () => {
  // COUNT=12 from 2026-02-10 runs to 2027-01-10; 11 of those fall in-window.
  const dentist = byUid("monthly@test");
  assert.deepEqual(
    dentist.map((d) => d.ymd),
    [
      "2026-02-10",
      "2026-03-10",
      "2026-04-10",
      "2026-05-10",
      "2026-06-10",
      "2026-07-10",
      "2026-08-10",
      "2026-09-10",
      "2026-10-10",
      "2026-11-10",
      "2026-12-10",
    ],
  );
  for (const visit of dentist) assert.equal(visit.startMin, 11 * 60);
});

test("occurrences outside the window are excluded", () => {
  const narrow = parseIcs(ics, { fromYmd: "2026-08-01", toYmd: "2026-08-31" });
  assert.ok(narrow.every((o) => o.ymd >= "2026-08-01" && o.ymd <= "2026-08-31"));
  assert.ok(narrow.some((o) => o.title === "Gym"));
  assert.ok(!narrow.some((o) => o.title === "Dentist" && o.ymd.startsWith("2026-02")));
});

test("every occurrence carries a stable recurrence identity", () => {
  for (const occ of all) {
    assert.equal(typeof occ.uid, "string");
    assert.ok(occ.uid.length > 0);
    assert.ok(occ.recurrenceId === null || typeof occ.recurrenceId === "string");
  }
});
