import { createSuite } from "./harness.mjs";
import {
	birthdayMonths,
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
	eq("a mid-month window spans thirteen buckets", empty.length, 13);
	eq("it starts on the current month", keys(empty)[0], "2026-09");
	eq("and ends on the same month a year on", keys(empty).at(-1), "2027-09");
	eq(
		"every month is present even with nobody in it",
		empty.every((m) => m.entries.length === 0),
		true
	);
	// The year is what tells the two Septembers apart.
	eq("labels carry the year", [empty[0]?.label, empty.at(-1)?.label], [
		"September 2026",
		"September 2027",
	]);

	// Starting on the 1st, the year closes exactly and needs no 13th.
	eq(
		"a window opening on the 1st spans twelve",
		keys(birthdayMonths([], new Date(2026, 8, 1))).length,
		12
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

	eq("an upcoming birthday sits in this month", named(find(months, "2026-09")), [
		"Later this month",
	]);
	eq(
		"one that just passed sits in next year's September",
		named(find(months, "2027-09")),
		["Just gone"]
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
		"a birthday that has rolled counts to next year's",
		turning(find(birthdayMonths([person("A", "1997-09-02")], NOW), "2027-09")),
		[30]
	);
	eq(
		"no birth year, no age to reach",
		turning(find(birthdayMonths([person("A", "09-21")], NOW), "2026-09")),
		[null]
	);

	return result();
}
