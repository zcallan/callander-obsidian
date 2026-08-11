import { createSuite } from "./harness.mjs";
import {
	buildEventShareText,
	formatShortWeekdayDate,
	normalizeUrl,
} from "./.build/callander.mjs";

function event(over = {}) {
	return {
		name: "Concert",
		type: "",
		date: "",
		time: "",
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

	return result();
}
