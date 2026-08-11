import { createSuite } from "./harness.mjs";
import {
	eventRowFields,
	formatEventTime,
	applyEventSort,
	classifyExistingEvent,
	eventSortOf,
	matchesEventWhen,
} from "./.build/callander.mjs";

/**
 * The Events page's row text and orderings. Wrong output here reads as
 * merely odd rather than broken — a date column that quietly sorts
 * undated events to the top, say — so it needs pinning down.
 */

function event(over = {}) {
	const name = over.name ?? "Concert";
	return {
		file: { path: `Events/${name}.md` },
		name,
		date: "",
		time: "",
		type: "",
		location: "",
		status: "open",
		created: "2026-01-01",
		updated: "2026-01-01",
		...over,
	};
}

export function run() {
	const { eq, result } = createSuite("event row");

	const now = new Date(2026, 7, 5); // 5 August 2026
	const order = (list, sort) => applyEventSort(list, sort).map((e) => e.name);
	const parts = (over) =>
		eventRowFields(event(over), now, over?.people ?? "");

	// ---------- the icon ----------
	eq(
		"an untyped event gets the neutral calendar",
		parts({}).icon,
		"📅"
	);
	eq("the type supplies the emoji", parts({ type: "concert" }).icon, "🎸");
	{
		// A name with its own emoji lends it to the icon and drops it from
		// the name, so the row never shows the same glyph twice.
		const p = parts({ name: "🎂 Birthday dinner", type: "concert" });
		eq("the name's own emoji wins", p.icon, "🎂");
		eq("...and leaves the name", p.name, "Birthday dinner");
	}
	eq("an ordinary name is untouched", parts({}).name, "Concert");

	// ---------- the suffix slot ----------
	eq("nothing recorded, nothing shown", parts({}).suffix, "");
	eq(
		"a person-less event falls back to where it is",
		parts({ location: "The Sinclair" }).suffix,
		"The Sinclair"
	);
	eq(
		"people win the slot when there are any",
		parts({ location: "The Sinclair", people: "Riley" }).suffix,
		"Riley"
	);

	// ---------- the date line ----------
	eq("an undated event says so", parts({}).date, "Anytime");
	eq("...and has no distance", parts({}).relative, "");
	eq(
		"a dated event leads with its weekday",
		parts({ date: "2026-09-12" }).date,
		"Saturday 12 Sep"
	);
	eq(
		"a date in another year says which",
		parts({ date: "2027-09-12" }).date,
		"Sunday 12 Sep 2027"
	);
	eq("the time is formatted", parts({ time: "19:00" }).time, "7:00 PM");
	eq(
		"the distance rides alongside",
		parts({ date: "2026-08-06" }).relative,
		"tomorrow"
	);
	eq(
		"a coarse date keeps its precision",
		parts({ date: "2026-09" }).date,
		"September 2026"
	);

	// ---------- "tonight" ----------
	// A same-day event after 6pm reads better as "tonight" — "today"
	// undersells something you're about to walk out the door for.
	eq(
		"an evening event today is tonight",
		parts({ date: "2026-08-05", time: "19:00" }).relative,
		"tonight"
	);
	eq(
		"...but a morning one is just today",
		parts({ date: "2026-08-05", time: "09:00" }).relative,
		"today"
	);
	eq(
		"...and an evening event tomorrow is still tomorrow",
		parts({ date: "2026-08-06", time: "19:00" }).relative,
		"tomorrow"
	);

	// ---------- cancelled ----------
	// Kept on the record rather than deleted, so the row has to say what it
	// is: the name struck, and "Cancelled" in the slot the people or the
	// location would otherwise have had.
	{
		const live = parts({
			date: "2026-09-12",
			location: "The Sinclair",
			people: "Riley",
		});
		eq("an ordinary row shows who's coming", live.suffix, "Riley");
		eq("...and isn't flagged", live.cancelled, undefined);

		const off = parts({
			date: "2026-09-12",
			location: "The Sinclair",
			people: "Riley",
			status: "cancelled",
		});
		eq("a cancelled row says so", off.suffix, "Cancelled");
		eq("...and is flagged for the strike-through", off.cancelled, true);
		// Everything else still reads normally — it's a record, not a husk.
		eq("...but keeps its date", off.date, "Saturday 12 Sep");
		eq("...and its name", off.name, "Concert");
	}
	// Done is a different thing entirely and leaves the row alone.
	eq(
		"a done event is not treated as cancelled",
		parts({ date: "2026-09-12", location: "X", status: "done" }).suffix,
		"X"
	);

	// ---------- tone ----------
	eq("something imminent is flagged soon", parts({ date: "2026-08-05" }).tone, "soon");
	eq("something gone is flagged past", parts({ date: "2026-07-01" }).tone, "past");
	eq(
		"something ordinary is unflagged",
		parts({ date: "2026-10-01" }).tone,
		undefined
	);

	// ---------- times ----------
	eq("morning", formatEventTime("09:30"), "9:30 AM");
	eq("noon is PM", formatEventTime("12:00"), "12:00 PM");
	eq("midnight is 12 AM", formatEventTime("00:15"), "12:15 AM");
	eq("evening", formatEventTime("19:00"), "7:00 PM");
	eq("garbage passes through", formatEventTime("later"), "later");


	// ---------- classifying events that predate the variant field ----------
	// Provenance is already lost for these, so the shape has to answer it.
	// Erring towards "reminder" means a stray row on the Events page, which
	// you can see and fix; erring the other way makes it vanish.
	const classify = (over) =>
		classifyExistingEvent(
			{
				date: "",
				type: "",
				people: [],
				source: "",
				hideFromDashboard: false,
				...over,
			},
			now
		);

	eq(
		"a past hangout with someone is a record of them",
		classify({ date: "2026-07-01", people: ["[[Riley]]"] }),
		"timeline"
	);
	eq(
		"...but the same thing still ahead is a plan",
		classify({ date: "2026-09-01", people: ["[[Riley]]"] }),
		"reminder"
	);
	eq(
		"a past event with nobody on it is your own calendar entry",
		classify({ date: "2026-07-01" }),
		"reminder"
	);
	eq(
		"a task is yours even when it names someone",
		classify({ date: "2026-07-01", people: ["[[Riley]]"], type: "task" }),
		"reminder"
	);
	eq(
		"an undated event is a standing reminder",
		classify({ people: ["[[Riley]]"] }),
		"reminder"
	);
	eq(
		"anything logged from a diary entry is a record",
		classify({
			date: "2026-09-01",
			source: "Diary/2026-07-01.md",
			people: ["[[Riley]]"],
		}),
		"timeline"
	);
	// An explicit hide is a decision already made — it outranks the shape.
	eq(
		"a hidden future event stays hidden",
		classify({
			date: "2026-09-01",
			hideFromDashboard: true,
			people: ["[[Riley]]"],
		}),
		"timeline"
	);
	// ...but only while it has somewhere to be hidden TO. With nobody on
	// it, "timeline" is nowhere — under the old flag such an event was
	// unreachable from any list, so this recovers it rather than
	// preserving the orphaning.
	eq(
		"a hidden event with nobody on it comes back to the calendar",
		classify({ date: "2026-07-01", hideFromDashboard: true }),
		"reminder"
	);
	eq(
		"...and so does a person-less diary-sourced one",
		classify({ date: "2026-07-01", source: "Diary/2026-07-01.md" }),
		"reminder"
	);
	eq(
		"today counts as still ahead",
		classify({ date: "2026-08-05", people: ["[[Riley]]"] }),
		"reminder"
	);

	// ---------- sorting ----------
	// Sorting and filtering are separate now: applyEventSort only orders,
	// and matchesEventWhen decides which half of the timeline you see.
	const mixed = () => [
		event({ name: "next week", date: "2026-08-12" }),
		event({ name: "next year", date: "2027-03-01" }),
		event({ name: "last week", date: "2026-07-29" }),
		event({ name: "years ago", date: "2019-04-02" }),
	];

	// Sorting no longer narrows: Natural orders the whole list, both halves
	// of the timeline together.
	eq("Natural orders everything chronologically", order(mixed(), "natural"), [
		"years ago",
		"last week",
		"next week",
		"next year",
	]);
	eq(
		"nothing is dropped by sorting alone",
		order(mixed(), "natural").length,
		mixed().length
	);

	// Which half you see is the when filter's job now.
	const half = (list, when) =>
		list.filter((e) => matchesEventWhen(e.date, when, now)).map((e) => e.name);

	eq("Upcoming keeps only what's ahead", half(mixed(), "upcoming").sort(), [
		"next week",
		"next year",
	]);
	eq("Past keeps only what's behind", half(mixed(), "past").sort(), [
		"last week",
		"years ago",
	]);
	eq("All keeps everything", half(mixed(), "all").length, mixed().length);
	// Between them the two halves account for everything, exactly once —
	// an event that fell through both gaps would vanish from the page.
	eq(
		"the two halves partition the list",
		[...half(mixed(), "upcoming"), ...half(mixed(), "past")].sort(),
		mixed()
			.map((e) => e.name)
			.sort()
	);

	{
		// Today counts as still to come — it hasn't happened yet.
		const list = [event({ name: "today", date: "2026-08-05" })];
		eq("today is upcoming", half(list, "upcoming"), ["today"]);
		eq("...and not past", half(list, "past"), []);
		eq("...and shows under All", half(list, "all"), ["today"]);
	}
	{
		// An undated event hasn't happened, so it belongs with what's
		// ahead — but it has no date, so it sorts last there.
		const list = [
			event({ name: "aaa undated" }),
			event({ name: "zzz dated", date: "2026-09-01" }),
		];
		eq("undated counts as upcoming", half(list, "upcoming").sort(), [
			"aaa undated",
			"zzz dated",
		]);
		eq("...and never as past", half(list, "past"), []);
		eq("...and sorts last under Natural", order(list, "natural"), [
			"zzz dated",
			"aaa undated",
		]);
	}

	// A retired sort id falls back rather than leaving the select blank.
	// "upcoming"/"past" became filters; "soonest" and "nearest" were this
	// sort's own earlier names. All of them land on the current default.
	eq("a sort turned filter falls back", eventSortOf("upcoming"), "natural");
	eq("...as does a renamed one", eventSortOf("soonest"), "natural");
	eq("...and the one after that", eventSortOf("nearest"), "natural");
	eq("...as does anything unknown", eventSortOf("nonsense"), "natural");
	eq("a live one is kept", eventSortOf("newest"), "newest");

	// ---------- the whole-list sorts ----------
	{
		const list = [
			event({ name: "late", date: "2026-12-01" }),
			event({ name: "early", date: "2026-01-01" }),
			event({ name: "middle", date: "2026-06-01" }),
		];
		eq("Newest runs by event date, most recent first", order(list, "newest"), [
			"late",
			"middle",
			"early",
		]);
		// Unlike Upcoming/Past, Newest spans both halves.
		eq("...across the whole timeline", order(list, "newest").length, 3);
	}
	{
		const list = [
			event({ name: "aaa undated" }),
			event({ name: "zzz dated", date: "2026-06-01" }),
		];
		eq("undated sinks under Newest", order(list, "newest"), [
			"zzz dated",
			"aaa undated",
		]);
	}
	{
		// "Oldest" is the longest-standing NOTE, not the longest-ago event
		// — so the created stamps decide it and the event dates must not.
		// Dated in the opposite order on purpose: if this ever read the
		// event date, the answer would flip.
		const list = [
			event({ name: "added first", created: "2025-03-01", date: "2026-01-01" }),
			event({ name: "added later", created: "2026-07-01", date: "2026-12-01" }),
		];
		eq("Oldest runs by created stamp", order(list, "oldest"), [
			"added first",
			"added later",
		]);
		eq(
			"...which is not the event-date answer",
			order(list, "newest"),
			["added later", "added first"]
		);
	}
	{
		const list = [
			event({ name: "aaa unstamped", created: "" }),
			event({ name: "zzz stamped", created: "2025-01-01" }),
		];
		eq("an unstamped note sinks under Oldest", order(list, "oldest"), [
			"zzz stamped",
			"aaa unstamped",
		]);
	}
	{
		// Last updated: most recently touched leads. Created stamps run
		// the other way, so a sort reading the wrong field would invert.
		const list = [
			event({ name: "touched recently", created: "2024-01-01", updated: "2026-08-01" }),
			event({ name: "touched long ago", created: "2026-01-01", updated: "2025-02-01" }),
		];
		eq("Last updated leads with the freshest", order(list, "updated"), [
			"touched recently",
			"touched long ago",
		]);
		eq(
			"...which is not the created-stamp answer",
			order(list, "oldest"),
			["touched recently", "touched long ago"]
		);
	}
	{
		const list = [
			event({ name: "aaa unstamped", updated: "" }),
			event({ name: "zzz stamped", updated: "2025-01-01" }),
		];
		eq("an unstamped note sinks under Last updated", order(list, "updated"), [
			"zzz stamped",
			"aaa unstamped",
		]);
	}
	{
		const list = [event({ name: "Beta" }), event({ name: "alpha" })];
		eq("A-Z is case-insensitive", order(list, "nameAsc"), ["alpha", "Beta"]);
		eq("Z-A reverses it", order(list, "nameDesc"), ["Beta", "alpha"]);
	}
	{
		// A leading emoji is decoration the row renders as its icon —
		// comparing it would float every such event above the letters.
		const list = [
			event({ name: "🎂 Zebra party" }),
			event({ name: "Aquarium" }),
		];
		eq("a leading emoji doesn't hijack A-Z", order(list, "nameAsc"), [
			"Aquarium",
			"🎂 Zebra party",
		]);
	}
	{
		const list = [
			event({ name: "p", type: "party" }),
			event({ name: "c", type: "concert" }),
			event({ name: "m", type: "movie" }),
		];
		eq("types sort alphabetically", order(list, "type"), ["c", "m", "p"]);
	}
	{
		// Named so alphabetical order would put the untyped one first —
		// otherwise "Other before untyped" and "both last" look the same.
		const list = [
			event({ name: "aaa untyped" }),
			event({ name: "zzz other", type: "other" }),
			event({ name: "party", type: "party" }),
		];
		eq("Other is pinned last, untyped below even that", order(list, "type"), [
			"party",
			"zzz other",
			"aaa untyped",
		]);
	}
	{
		const list = [
			event({ name: "Bravo", type: "party" }),
			event({ name: "Alpha", type: "party" }),
		];
		eq("within a type, names order", order(list, "type"), ["Alpha", "Bravo"]);
	}
	{
		const list = [event({ name: "b" }), event({ name: "a" })];
		applyEventSort(list, "nameAsc", now);
		eq(
			"sorting returns a new array and leaves the caller's alone",
			list.map((e) => e.name),
			["b", "a"]
		);
	}

	// ---------- near dates said by weekday (the dashboard's reading) ----------
	// "now" is Wednesday 5 Aug 2026, so +6 is Tue 11th, +7 Wed 12th,
	// +13 Tue 18th, +14 Wed 19th.
	const near = (date) =>
		eventRowFields(event({ date }), now, "", { conversational: true }).date;
	const far = (date) => eventRowFields(event({ date }), now, "").date;

	// The two days nobody names — "Wednesday" for today is the long way
	// round to say it.
	eq("today says so", near("2026-08-05"), "Today");
	eq("tomorrow likewise", near("2026-08-06"), "Tomorrow");
	eq("the day after that takes its weekday", near("2026-08-07"), "Friday");
	eq("the last day inside a week", near("2026-08-11"), "Tuesday");
	eq("a week out crosses to 'Next'", near("2026-08-12"), "Next Wednesday");
	eq("still 'Next' the day after", near("2026-08-13"), "Next Thursday");
	eq("the last day inside a fortnight", near("2026-08-18"), "Next Tuesday");
	eq(
		"a fortnight out falls back to the date",
		near("2026-08-19"),
		"Wednesday 19 Aug"
	);
	// A date behind you needs the calendar — there's no single "Monday" back
	// there to mean.
	eq("a past date keeps its date", near("2026-08-03"), "Monday 3 Aug");
	// Off by default, so the events page is untouched.
	eq("without the option, near dates read as dates", far("2026-08-06"), "Thursday 6 Aug");
	eq("...and so do the rest", far("2026-08-19"), "Wednesday 19 Aug");
	// The relative column still counts days once it's far enough out that
	// the date label isn't saying the same thing.
	eq(
		"the relative text still counts days",
		eventRowFields(event({ date: "2026-08-12" }), now, "", {
			conversational: true,
		}).relative,
		"in 7 days"
	);

	// ---------- what the right-hand column says up close ----------
	// The date label already reads "Today"/"Tomorrow", so this side counts
	// down instead of repeating it, and says whether today's has started.
	const rel = (date, time, at = now) =>
		eventRowFields(event({ date, time }), at, "", {
			conversational: true,
		}).relative;

	eq("tomorrow counts rather than repeating", rel("2026-08-06", ""), "in 1 day");
	eq("...with a time too", rel("2026-08-06", "19:30"), "in 1 day");

	{
		// Eight in the morning, so the arithmetic below reads off the clock.
		const morning = new Date(2026, 7, 5, 8, 0);
		eq("three hours off", rel("2026-08-05", "11:00", morning), "in 3 hours");
		eq("one hour is singular", rel("2026-08-05", "09:00", morning), "in 1 hour");
		eq(
			"under an hour counts in minutes",
			rel("2026-08-05", "08:30", morning),
			"in 30 minutes"
		);
		eq(
			"one minute is singular",
			rel("2026-08-05", "08:01", morning),
			"in 1 minute"
		);
		// The minutes/hours line: anything under the full hour still counts
		// in minutes rather than rounding up to "in 1 hour".
		eq(
			"the last minute under the hour",
			rel("2026-08-05", "08:59", morning),
			"in 59 minutes"
		);
		// Rounds to the nearest hour: 1h50m is closer to 2 than to 1.
		eq(
			"an awkward gap rounds to the nearest hour",
			rel("2026-08-05", "09:50", morning),
			"in 2 hours"
		);
		// Counting an evening event in hours is exactly the point — no
		// guessing at whether "tonight" is the right word for it.
		eq(
			"an evening event counts too",
			rel("2026-08-05", "19:00", morning),
			"in 11 hours"
		);
		eq(
			"a time already gone is now",
			rel("2026-08-05", "07:00", morning),
			"now"
		);
		eq(
			"...and so is one happening this minute",
			rel("2026-08-05", "08:00", morning),
			"now"
		);
	}

	// No time means there's nothing to count down to. It repeats the label
	// beside it, but it's the only accurate thing to say.
	eq("today with no time at all is just today", rel("2026-08-05", ""), "today");

	// Off by default — the events page keeps "today"/"tomorrow".
	eq(
		"without the option, tomorrow still reads 'tomorrow'",
		eventRowFields(event({ date: "2026-08-06" }), now, "").relative,
		"tomorrow"
	);
	eq(
		"...and an untimed today still reads 'today'",
		eventRowFields(event({ date: "2026-08-05" }), now, "").relative,
		"today"
	);

	return result();
}
