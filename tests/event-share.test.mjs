import { createSuite } from "./harness.mjs";
import {
	buildEventShareText,
	buildGoogleCalendarUrl,
	formatShortWeekdayDate,
	normalizeUrl,
} from "./.build/callander.mjs";

function event(over = {}) {
	return {
		name: "Concert",
		type: "",
		date: "",
		time: "",
		duration: "",
		location: "",
		description: "",
		link: "",
		...over,
	};
}

export function run() {
	const { eq, result } = createSuite("event share text");

	// ---------- the reference case from the request ----------
	eq(
		"movie, dated, timed, located",
		buildEventShareText(
			event({
				name: "Spider-Man: Brand New Day Movie",
				type: "movie",
				date: "2026-08-08",
				time: "12:00",
				location: "The Sinclair",
			})
		),
		[
			"🍿 Spider-Man: Brand New Day Movie",
			"Sat 8 Aug • 12:00 PM at The Sinclair",
		].join("\n")
	);

	// ---------- the title line ----------
	eq(
		"untyped, no leading emoji: name stands alone",
		buildEventShareText(event({ name: "Dinner" })),
		"Dinner"
	);
	eq(
		"a name with its own emoji is never given a second one",
		buildEventShareText(
			event({ name: "🎂 Birthday dinner", type: "party" })
		).split("\n")[0],
		"🎂 Birthday dinner"
	);

	// ---------- what request said to leave out ----------
	// People and a type LABEL are deliberately absent — only the emoji
	// carries the type, never its own line — so nothing here should ever
	// print the word "Movie" or list anyone.
	eq(
		"no people line, whatever the caller passes isn't even accepted",
		buildEventShareText(
			event({ type: "movie", date: "2026-08-08" })
		).includes("👥"),
		false
	);
	eq(
		"the type's label never appears as its own word",
		buildEventShareText(event({ name: "Thing", type: "movie" })),
		"🍿 Thing"
	);

	// ---------- the date/time/location line ----------
	eq("nothing dated or located: one line only", buildEventShareText(event({ name: "Task" })), "Task");
	eq(
		"date only",
		buildEventShareText(event({ name: "X", date: "2026-08-08" })),
		"X\nSat 8 Aug"
	);
	eq(
		"date and time, no location",
		buildEventShareText(
			event({ name: "X", date: "2026-08-08", time: "19:00" })
		),
		"X\nSat 8 Aug • 7:00 PM"
	);
	eq(
		"location only — stands alone rather than a dangling 'at'",
		buildEventShareText(event({ name: "X", location: "The Sinclair" })),
		"X\nThe Sinclair"
	);
	eq(
		"time with no date still shows — never silently dropped",
		buildEventShareText(event({ name: "X", time: "19:00" })),
		"X\n7:00 PM"
	);

	// ---------- coarse dates ----------
	eq(
		"month precision falls back to the full month, no weekday invented",
		buildEventShareText(event({ name: "X", date: "2026-08" })),
		"X\nAugust 2026"
	);
	eq(
		"year precision likewise",
		buildEventShareText(event({ name: "X", date: "2026" })),
		"X\n2026"
	);

	// ---------- notes and link ----------
	eq(
		"notes get their own line",
		buildEventShareText(event({ name: "X", description: "Bring cash" })),
		"X\nBring cash"
	);
	eq(
		"a link is normalized and gets its own line",
		buildEventShareText(event({ name: "X", link: "example.com/tix" })),
		"X\nhttps://example.com/tix"
	);
	eq(
		"an already-schemed link is untouched",
		buildEventShareText(
			event({ name: "X", link: "http://example.com" })
		),
		"X\nhttp://example.com"
	);

	// ---------- everything at once, in order ----------
	eq(
		"date/time/location, then notes, then link — in that order",
		buildEventShareText(
			event({
				name: "Show",
				type: "concert",
				date: "2026-08-08",
				time: "19:00",
				location: "The Sinclair",
				description: "Doors at 7",
				link: "example.com",
			})
		),
		[
			"🎸 Show",
			"Sat 8 Aug • 7:00 PM at The Sinclair",
			"Doors at 7",
			"https://example.com",
		].join("\n")
	);

	// ---------- formatShortWeekdayDate ----------
	eq(
		"weekday, day, short month — no year",
		formatShortWeekdayDate(new Date(2026, 6, 30)),
		"Thu 30 Jul"
	);
	eq(
		"single-digit days aren't zero-padded",
		formatShortWeekdayDate(new Date(2026, 7, 8)),
		"Sat 8 Aug"
	);

	// ---------- normalizeUrl ----------
	eq("bare domain gains https", normalizeUrl("example.com"), "https://example.com");
	eq("http is left alone", normalizeUrl("http://example.com"), "http://example.com");
	eq("https is left alone", normalizeUrl("https://example.com"), "https://example.com");
	eq(
		"a non-http scheme is still left alone — not every link is a website",
		normalizeUrl("obsidian://open?vault=x"),
		"obsidian://open?vault=x"
	);

	// ---------- buildGoogleCalendarUrl ----------
	// Parsed back with `URL`/`searchParams` rather than compared as a raw
	// string — that checks the actual param values survive encoding and
	// decoding, rather than pinning one particular escaping of the query
	// string that happens to match today's implementation.
	const urlParams = (over) => {
		const url = buildGoogleCalendarUrl(event(over));
		return url ? new URL(url) : null;
	};

	eq(
		"no date at all: nowhere to send someone, so no link",
		buildGoogleCalendarUrl(event({ date: "" })),
		null
	);
	eq(
		"a month-only date isn't day-precision either",
		buildGoogleCalendarUrl(event({ date: "2026-08" })),
		null
	);
	eq(
		"nor a bare year",
		buildGoogleCalendarUrl(event({ date: "2026" })),
		null
	);

	{
		const url = urlParams({ date: "2026-08-08" });
		eq("opens Google Calendar's own add-event page", url.origin + url.pathname, "https://calendar.google.com/calendar/render");
		eq("...as a prefilled template", url.searchParams.get("action"), "TEMPLATE");
	}

	// All-day: Google's own end date is exclusive, so a single day needs
	// the day after as its end — not the same day twice.
	eq(
		"an untimed event is a whole-day span, end date exclusive",
		urlParams({ date: "2026-08-08" }).searchParams.get("dates"),
		"20260808/20260809"
	);
	// The exact case this feature exists for: an hour is filled in as the
	// default length, since nothing here stores a real end time.
	eq(
		"a timed event runs for an hour by default",
		urlParams({ date: "2026-08-08", time: "12:00" }).searchParams.get(
			"dates"
		),
		"20260808T120000/20260808T130000"
	);
	// Real date arithmetic, not string padding — a naive "add 1 to the
	// hour digits" would produce the nonsense "20260808T243000".
	eq(
		"an hour added past midnight rolls the end onto the next day",
		urlParams({ date: "2026-08-08", time: "23:30" }).searchParams.get(
			"dates"
		),
		"20260808T233000/20260809T003000"
	);
	// Same for the all-day branch, at both a month and (separately trusted
	// via the same Date normalisation) a year boundary.
	eq(
		"an all-day event on the last day of the month rolls its end into the next month",
		urlParams({ date: "2026-01-31" }).searchParams.get("dates"),
		"20260131/20260201"
	);
	eq(
		"...and the last day of the year into the next one",
		urlParams({ date: "2026-12-31" }).searchParams.get("dates"),
		"20261231/20270101"
	);

	// No "Z": the stored time has no timezone of its own, so it travels as
	// the wall-clock time it was written down as, not as UTC.
	eq(
		"the time is floating, not UTC",
		urlParams({ date: "2026-08-08", time: "12:00" })
			.searchParams.get("dates")
			.includes("Z"),
		false
	);

	// ---------- duration decides the end ----------
	// Without one an event still gets an hour, the same default Google
	// fills in for an event made by hand.
	eq(
		"a duration is honoured over the one-hour default",
		urlParams({ date: "2026-08-08", time: "12:00", duration: "2h 30m" })
			.searchParams.get("dates"),
		"20260808T120000/20260808T143000"
	);
	eq(
		"a minutes-only duration works",
		urlParams({ date: "2026-08-08", time: "12:00", duration: "20m" })
			.searchParams.get("dates"),
		"20260808T120000/20260808T122000"
	);
	// Real time arithmetic, not hour-digit addition — this is the case that
	// would otherwise produce a nonsense "T250000".
	eq(
		"a duration running past midnight rolls onto the next day",
		urlParams({ date: "2026-08-08", time: "23:00", duration: "2h" })
			.searchParams.get("dates"),
		"20260808T230000/20260809T010000"
	);
	// A duration is meaningless without a start — the event is still a
	// whole-day one, not a 2h block beginning at midnight.
	eq(
		"a duration with no time leaves it an all-day event",
		urlParams({ date: "2026-08-08", duration: "2h" }).searchParams.get(
			"dates"
		),
		"20260808/20260809"
	);
	// Free text left over from before the dropdowns still reads.
	eq(
		"a legacy free-text duration is still understood",
		urlParams({ date: "2026-08-08", time: "12:00", duration: "2h flight" })
			.searchParams.get("dates"),
		"20260808T120000/20260808T140000"
	);
	// Unparseable falls back rather than producing a zero-length event.
	eq(
		"an unreadable duration falls back to the hour default",
		urlParams({ date: "2026-08-08", time: "12:00", duration: "ages" })
			.searchParams.get("dates"),
		"20260808T120000/20260808T130000"
	);

	// ---------- the title matches buildEventShareText's own rule ----------
	eq(
		"an untyped, unemojied name stands alone",
		urlParams({ date: "2026-08-08", name: "Dinner" }).searchParams.get(
			"text"
		),
		"Dinner"
	);
	eq(
		"a typed event gets its type's emoji",
		urlParams({
			date: "2026-08-08",
			name: "Brand New Day",
			type: "movie",
		}).searchParams.get("text"),
		"🍿 Brand New Day"
	);
	eq(
		"a name with its own emoji isn't given a second one",
		urlParams({
			date: "2026-08-08",
			name: "🎉 Party",
			type: "movie",
		}).searchParams.get("text"),
		"🎉 Party"
	);

	// ---------- "with …" on the calendar title ----------
	// Names arrive already resolved and shortened by the caller — this only
	// joins them, so the calendar entry matches what the modal displays.
	const titleWith = (over, people) =>
		new URL(
			buildGoogleCalendarUrl(event({ date: "2026-08-08", ...over }), people)
		).searchParams.get("text");

	eq(
		"one person",
		titleWith({ name: "Dinner" }, ["Riley"]),
		"Dinner with Riley"
	);
	eq(
		"several are comma separated",
		titleWith({ name: "Dinner" }, ["Riley", "Laura", "Harry"]),
		"Dinner with Riley, Laura, Harry"
	);
	eq(
		"nobody leaves the title untouched",
		titleWith({ name: "Dinner" }, []),
		"Dinner"
	);
	eq(
		"omitting the argument entirely is the same as nobody",
		new URL(
			buildGoogleCalendarUrl(event({ date: "2026-08-08", name: "Dinner" }))
		).searchParams.get("text"),
		"Dinner"
	);
	// The suffix goes after the whole title, emoji included — not wedged
	// between the emoji and the name.
	eq(
		"a typed event keeps its emoji leading",
		titleWith({ name: "Brand New Day", type: "movie" }, ["Riley"]),
		"🍿 Brand New Day with Riley"
	);
	eq(
		"a name with its own emoji likewise",
		titleWith({ name: "🎉 Party", type: "movie" }, ["Riley"]),
		"🎉 Party with Riley"
	);
	// A blank slipping through the caller's list shouldn't leave a dangling
	// comma in someone's calendar.
	eq(
		"blank names are dropped rather than punctuated",
		titleWith({ name: "Dinner" }, ["Riley", "", "Laura"]),
		"Dinner with Riley, Laura"
	);
	eq(
		"a list of only blanks adds nothing at all",
		titleWith({ name: "Dinner" }, ["", ""]),
		"Dinner"
	);
	// The share text is a separate thing and still names nobody.
	eq(
		"the share text is unaffected",
		buildEventShareText(event({ name: "Dinner", date: "2026-08-08" })),
		"Dinner\nSat 8 Aug"
	);

	// ---------- optional fields ----------
	eq(
		"no location, no notes: neither param is sent at all",
		[
			urlParams({ date: "2026-08-08" }).searchParams.has("location"),
			urlParams({ date: "2026-08-08" }).searchParams.has("details"),
		],
		[false, false]
	);
	eq(
		"location and notes carry across, special characters included",
		[
			urlParams({
				date: "2026-08-08",
				location: "Mom & Dad's",
			}).searchParams.get("location"),
			urlParams({
				date: "2026-08-08",
				description: "Bring the good & the great — 100% ready",
			}).searchParams.get("details"),
		],
		["Mom & Dad's", "Bring the good & the great — 100% ready"]
	);

	return result();
}
