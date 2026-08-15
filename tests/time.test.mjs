import test from "node:test";
import assert from "node:assert/strict";

import {
  addDays,
  addMonths,
  dayOfWeek,
  daysBetween,
  endOfWeek,
  formatMinutes,
  monthGridDays,
  startOfWeek,
  toWallClock,
  weekDays,
} from "../.test-build/time.js";

test("weeks start on Monday", () => {
  // 2026-08-15 is a Saturday.
  assert.equal(dayOfWeek("2026-08-15"), 6);
  assert.equal(startOfWeek("2026-08-15"), "2026-08-10");
  assert.equal(endOfWeek("2026-08-15"), "2026-08-16");
  // Sunday belongs to the week that began the previous Monday.
  assert.equal(startOfWeek("2026-08-16"), "2026-08-10");
  // Monday is its own week start.
  assert.equal(startOfWeek("2026-08-10"), "2026-08-10");
});

test("day arithmetic crosses month and year boundaries", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29"); // leap year
  assert.equal(daysBetween("2026-08-10", "2026-08-15"), 5);
  assert.equal(daysBetween("2026-08-15", "2026-08-10"), -5);
});

test("month arithmetic clamps to the first of the month", () => {
  assert.equal(addMonths("2026-08-15", 1), "2026-09-01");
  assert.equal(addMonths("2026-01-15", -1), "2025-12-01");
  assert.equal(addMonths("2026-12-01", 1), "2027-01-01");
});

test("month grid covers whole Monday-start weeks", () => {
  const days = monthGridDays("2026-08-15");
  assert.equal(days.length % 7, 0);
  assert.equal(dayOfWeek(days[0]), 1); // Monday
  assert.equal(days[0], "2026-07-27"); // 1 Aug 2026 is a Saturday
  assert.equal(days.at(-1), "2026-09-06");
  assert.ok(days.includes("2026-08-01"));
  assert.ok(days.includes("2026-08-31"));
});

test("week view returns Monday through Sunday", () => {
  const days = weekDays("2026-08-15");
  assert.equal(days.length, 7);
  assert.equal(days[0], "2026-08-10");
  assert.equal(days[6], "2026-08-16");
});

test("wall-clock conversion honours the Sydney offset", () => {
  // AEST (UTC+10) in August.
  assert.deepEqual(toWallClock(new Date("2026-08-14T23:30:00Z"), "Australia/Sydney"), {
    ymd: "2026-08-15",
    minutes: 9 * 60 + 30,
  });
  // AEDT (UTC+11) in December.
  assert.deepEqual(toWallClock(new Date("2026-12-14T23:30:00Z"), "Australia/Sydney"), {
    ymd: "2026-12-15",
    minutes: 10 * 60 + 30,
  });
  // Local midnight must read as 0 minutes, not 1440.
  assert.deepEqual(toWallClock(new Date("2026-08-14T14:00:00Z"), "Australia/Sydney"), {
    ymd: "2026-08-15",
    minutes: 0,
  });
});

test("time formatting", () => {
  assert.equal(formatMinutes(null), "all-day");
  assert.equal(formatMinutes(0), "12 am");
  assert.equal(formatMinutes(9 * 60 + 5), "9:05 am");
  assert.equal(formatMinutes(12 * 60), "12 pm");
  assert.equal(formatMinutes(18 * 60 + 30), "6:30 pm");
});
