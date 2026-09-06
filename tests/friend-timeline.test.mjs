import { createSuite } from "./harness.mjs";
import {
	birthdayMonths,
	calendarBirthdayKey,
	nextBirthdayOccurrence,
} from "./.build/callander.mjs";

/** 6 September 2026, local — mid-month on purpose, so the window wraps. */
const NOW = new Date(2026, 8, 6);

const person = (name, birthday) => ({ name, birthday });
const keys = (months) => months.map((m) => m.key);
const named = (month) => (month?.entries ?? []).map((e) => e.person.name);
const find = (months, key) => months.find((m) => m.key === key);

/**
 * When a birthday next comes round, and which month bucket it lands in.
 *
 * The rules that decide whether someone you expect to see is missing from
 * the All friends timeline — and the one the dashboard's countdown now
 * shares, since ContactOperations.calculateDaysUntilBirthday delegates here.
 */
export function run() {
	const { eq, result } = createSuite("friend timeline");

	// ---------- nextBirthdayOccurrence ----------
	eq(
		"a birthday later this month is this year's",
		nextBirthdayOccurrence("1997-09-21", NOW),
		{ date: "2026-09-21", days: 15 }
	);
	// The case the whole 13-month window exists for.
	eq(
		"a birthday earlier this month has rolled to next year",
		nextBirthdayOccurrence("1997-09-02", NOW),
		{ date: "2027-09-02", days: 361 }
	);
	eq("today's birthday is zero days away", nextBirthdayOccurrence("1997-09-06", NOW), {
		date: "2026-09-06",
		days: 0,
	});
	// Only month and day are consulted, so a year-less birthday is no
	// different to one that has a year.
	eq("a year-less birthday still resolves", nextBirthdayOccurrence("09-21", NOW), {
		date: "2026-09-21",
		days: 15,
	});

	eq("a month-only birthday has no day to land on", nextBirthdayOccurrence("1997-09", NOW), null);
	eq("a year-only birthday has none either", nextBirthdayOccurrence("1997", NOW), null);
	eq("nothing recorded, nothing returned", nextBirthdayOccurrence("", NOW), null);

	// Documented behaviour, not an accident: this is what the dashboard has
	// always shown, and moving it to 28 Feb would move a date users read.
	eq(
		"29 Feb rolls into 1 March in a non-leap year",
		nextBirthdayOccurrence("2000-02-29", NOW),
		{ date: "2027-03-01", days: 176 }
	);

	// ---------- birthdayMonths: the window ----------
	const empty = birthdayMonths([], NOW);
	eq("the window is twelve whole months", empty.length, 12);
	eq("it opens on the current month", keys(empty)[0], "2026-09");
	eq("and closes eleven months on", keys(empty).at(-1), "2027-08");
	eq(
		"no second September at the far end",
		keys(empty).filter((k) => k.endsWith("-09")).length,
		1
	);
	eq(
		"every month is present even with nobody in it",
		empty.every((m) => m.entries.length === 0),
		true
	);
	// The window crosses a new year, so the label has to carry one.
	eq("labels carry the year", [empty[0]?.label, empty.at(-1)?.label], [
		"September 2026",
		"August 2027",
	]);

	// Whole months, so the day of the month can't change the shape.
	eq(
		"the day of the month doesn't change the span",
		[
			keys(birthdayMonths([], new Date(2026, 8, 1))),
			keys(birthdayMonths([], new Date(2026, 8, 30))),
		],
		[keys(empty), keys(empty)]
	);

	// ---------- birthdayMonths: placement ----------
	const people = [
		person("Later this month", "1997-09-21"),
		person("Just gone", "1997-09-02"),
		person("Midwinter", "1990-01-14"),
		person("No year", "11-30"),
		person("Month only", "1997-04"),
	];
	const months = birthdayMonths(people, NOW);

	eq(
		"an upcoming birthday sits in this month",
		named(find(months, "2026-09")).includes("Later this month"),
		true
	);
	// The reason the window is whole months: on the 20th, the 10th is
	// still this month's business, not something to find eleven months
	// down the page.
	eq(
		"one already past this month stays in this month",
		named(find(months, "2026-09")).includes("Just gone"),
		true
	);
	eq(
		"it sorts above the ones still to come",
		named(find(months, "2026-09")),
		["Just gone", "Later this month"]
	);
	eq(
		"and counts backwards, so callers can say Turned",
		find(months, "2026-09").entries[0].days,
		-4
	);
	eq("a January birthday sits in January", named(find(months, "2027-01")), [
		"Midwinter",
	]);
	eq("a year-less birthday is placed like any other", named(find(months, "2026-11")), [
		"No year",
	]);
	eq(
		"a month-only birthday appears nowhere",
		months.flatMap(named).includes("Month only"),
		false
	);

	// ---------- birthdayMonths: ordering ----------
	const sameMonth = birthdayMonths(
		[
			person("Late", "1990-09-28"),
			person("Early", "1990-09-11"),
			person("Middle", "1990-09-20"),
		],
		NOW
	);
	eq("entries within a month run in date order", named(find(sameMonth, "2026-09")), [
		"Early",
		"Middle",
		"Late",
	]);
	// Stable, so a caller that hands them over alphabetically gets A-Z back.
	const shared = birthdayMonths(
		[person("Ada", "1990-09-21"), person("Bo", "1991-09-21")],
		NOW
	);
	eq("a shared birthday keeps the order it arrived in", named(find(shared, "2026-09")), [
		"Ada",
		"Bo",
	]);

	// ---------- birthdayMonths: turning ----------
	const turning = (month) => (month?.entries ?? []).map((e) => e.turning);
	eq(
		"the age reached comes from the years themselves",
		turning(find(birthdayMonths([person("A", "1997-09-21")], NOW), "2026-09")),
		[29]
	);
	// Counted to the occurrence, not to today — on the morning of a birthday
	// a stored "age" is already a year behind what the row should read.
	eq(
		"one already past this month reports the age just reached",
		turning(find(birthdayMonths([person("A", "1997-09-02")], NOW), "2026-09")),
		[29]
	);
	// A birthday in an earlier month has genuinely rolled, and lands at the
	// far end of the window with next year's age.
	eq(
		"an earlier month rolls to next year",
		turning(find(birthdayMonths([person("A", "1997-04-02")], NOW), "2027-04")),
		[30]
	);
	eq(
		"no birth year, no age to reach",
		turning(find(birthdayMonths([person("A", "09-21")], NOW), "2026-09")),
		[null]
	);

	// ---------- calendarBirthdayKey ----------
	// The All friends "Jan-Dec" sort. Distinct from "next birthday": this
	// one opens with January whatever today is.
	const order = (list) =>
		[...list]
			.sort((a, b) => calendarBirthdayKey(a[1]) - calendarBirthdayKey(b[1]))
			.map((p) => p[0]);

	// Day numbers deliberately reversed against the months: with a key that
	// forgot the month, Dec 2 would beat Jan 30 and this would pass by luck.
	eq("January comes before December", order([
		["Dec", "1990-12-02"],
		["Jan", "1990-01-30"],
	]), ["Jan", "Dec"]);
	eq("and days order within a month", order([
		["late", "1990-03-28"],
		["early", "1990-03-02"],
	]), ["early", "late"]);
	// The year has no bearing at all — that's what makes it calendar order
	// rather than a date sort.
	eq(
		"the birth year is ignored",
		calendarBirthdayKey("1990-03-14") === calendarBirthdayKey("2005-03-14"),
		true
	);
	eq(
		"a year-less birthday keys the same as a dated one",
		calendarBirthdayKey("03-14"),
		calendarBirthdayKey("1990-03-14")
	);
	// Known to the month is still a place in the year; it just leads its
	// month rather than falling on a day in it.
	eq(
		"a month-only birthday heads its month",
		calendarBirthdayKey("1990-03") < calendarBirthdayKey("1990-03-01"),
		true
	);
	eq("a year-only birthday has no place", calendarBirthdayKey("1990"), null);
	eq("nor does a blank one", calendarBirthdayKey(""), null);

	return result();
}
