import { createSuite } from "./harness.mjs";
import {
	hhmm,
	isoDateOf,
	isoDay,
	pad2,
	startOfLocalDay,
	wholeDaysBetween,
} from "./.build/callander.mjs";

/**
 * The calendar primitives every day count and date key goes through. The
 * day counts are checked in two zones either side of the equator, across
 * each one's daylight-saving changes, since that's where a floored or
 * UTC-based count goes a day wrong.
 */
export function run() {
	const { eq, ok, result } = createSuite("dates");

	eq("padding", [pad2(7), pad2(10), pad2(0)], ["07", "10", "00"]);
	eq("a date key from fields, the year as given", [isoDateOf(2026, 3, 7), isoDateOf(999, 12, 31)], ["2026-03-07", "999-12-31"]);
	eq("a clock time", [hhmm(7, 5), hhmm(19, 30)], ["07:05", "19:30"]);

	const zone = process.env.TZ;
	for (const tz of ["America/New_York", "Australia/Sydney"]) {
		process.env.TZ = tz;
		const d = (y, m, day, h = 12) => new Date(y, m - 1, day, h);
		eq(`${tz}: a local date key, not UTC's`, isoDay(d(2026, 3, 8, 23)), "2026-03-08");
		const sod = startOfLocalDay(d(2026, 3, 8, 15));
		ok(`${tz}: start of day is local midnight, on a copy`, sod.getHours() === 0 && sod.getMinutes() === 0 && sod.getDate() === 8);
		// US spring forward 8 Mar 2026, fall back 1 Nov; Sydney's fall back
		// 5 Apr 2026, spring forward 4 Oct.
		eq(`${tz}: across March's change`, wholeDaysBetween(d(2026, 3, 7, 23), d(2026, 3, 9, 0)), 2);
		eq(`${tz}: across April's`, wholeDaysBetween(d(2026, 4, 4, 1), d(2026, 4, 6, 23)), 2);
		eq(`${tz}: across October's`, wholeDaysBetween(d(2026, 10, 3), d(2026, 10, 5)), 2);
		eq(`${tz}: across November's`, wholeDaysBetween(d(2026, 10, 31, 0), d(2026, 11, 2, 23)), 2);
		eq(`${tz}: backwards is negative`, wholeDaysBetween(d(2026, 11, 2), d(2026, 10, 31)), -2);
		eq(`${tz}: the same day, whatever the hours`, wholeDaysBetween(d(2026, 3, 8, 0), d(2026, 3, 8, 23)), 0);
	}
	if (zone === undefined) delete process.env.TZ;
	else process.env.TZ = zone;

	return result();
}
