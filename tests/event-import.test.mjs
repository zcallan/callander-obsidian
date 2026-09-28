import { createSuite } from "./harness.mjs";
import {
	importTemplate,
	parseCsv,
	normalizeTime,
	parseEventImport,
	problemLine,
	problemsHeading,
	problemsText,
	duplicateNames,
	importPrompt,
	IMPORT_COLUMNS,
} from "./.build/callander.mjs";

const HEADER = "Name,Date,Time,Timezone,Duration,Type,Location,People,Link,Description";

/**
 * The bulk import reads CSV an AI or a spreadsheet wrote, so these pin down
 * the CSV rules, every value it cleans up, and that a bad row is reported
 * by line rather than half-imported.
 */
export function run() {
	const { eq, ok, result } = createSuite("event import");

	// ---------- the template ----------
	{
		const [head, example] = importTemplate().split("\n");
		eq("the template's first row is the column names", head, HEADER);
		const parsed = parseEventImport(importTemplate());
		eq("the template's own example reads cleanly", parsed.errors, []);
		eq("…and is skipped, as an example left in", parsed.events.length, 0);
		ok("…with its comma-holding cell quoted", example.includes('"TD Garden, Boston"'));
	}

	// ---------- CSV ----------
	eq(
		"quoted cells keep their commas",
		parseCsv('a,"b, c",d').map((r) => r.cells),
		[["a", "b, c", "d"]]
	);
	eq(
		'doubled quotes are a quote',
		parseCsv('"say ""hi"""').map((r) => r.cells),
		[['say "hi"']]
	);
	eq(
		"a quoted cell can hold a line break",
		parseCsv('"one\ntwo",x\nnext,y').map((r) => r.cells),
		[["one\ntwo", "x"], ["next", "y"]]
	);
	eq(
		"…and the next row still knows its line",
		parseCsv('"one\ntwo",x\nnext,y').map((r) => r.line),
		[1, 3]
	);
	eq(
		"blank lines and windows line endings are fine",
		parseCsv("a,b\r\n\r\nc,d\r\n").map((r) => r.cells),
		[["a", "b"], ["c", "d"]]
	);
	eq(
		"a quote inside a cell is just a character, and the rows stay apart",
		parseCsv('Pizza,2026-10-02,12" oven\nOther,2026-10-03,Place').map(
			(r) => r.cells
		),
		[
			["Pizza", "2026-10-02", '12" oven'],
			["Other", "2026-10-03", "Place"],
		]
	);
	eq(
		"…while one after spaces still opens a quoted cell",
		parseCsv('a, "b, c",d').map((r) => r.cells),
		[["a", " b, c", "d"]]
	);

	// ---------- times ----------
	eq("24-hour stays", normalizeTime("19:30"), "19:30");
	eq("single-digit hours are padded", normalizeTime("7:05"), "07:05");
	eq("pm converts", normalizeTime("7:30pm"), "19:30");
	eq("a bare hour with pm", normalizeTime("7 PM"), "19:00");
	eq("12am is midnight", normalizeTime("12am"), "00:00");
	eq("12pm is noon", normalizeTime("12pm"), "12:00");
	// Words an event can genuinely store, so a spreadsheet gets to give
	// them — by id or by the label the picker shows.
	eq("anytime comes through", normalizeTime("Anytime"), "anytime");
	eq("tbd comes through", normalizeTime("TBD"), "tbd");
	eq("...however it's cased", normalizeTime("tbd"), "tbd");
	eq("nonsense isn't a time", normalizeTime("soon"), null);
	eq("25:00 isn't a time", normalizeTime("25:00"), null);

	// ---------- rows ----------
	{
		const text = `${HEADER}\nGig,2026-10-02,8pm,,2h,Concert,"The Sinclair, Cambridge",[[Sally Rooney]]; Haruki Murakami,https://x.y,Loud`;
		const { events, errors } = parseEventImport(text);
		eq("a full row imports", errors, []);
		const e = events[0];
		eq("the time is converted", e.time, "20:00");
		eq("the type matches its label, any case", e.type, "concert");
		eq("the duration is stored canonically", e.duration, "2h");
		eq("people split on semicolons, links unwrapped", e.people, ["Sally Rooney", "Haruki Murakami"]);
		eq("a quoted location keeps its comma", e.location, "The Sinclair, Cambridge");
		eq("an empty timezone floats", e.timezone, "");
	}
	{
		// The case the Timezone column exists for: a listing quoting a
		// game in the venue's zone rather than the reader's.
		const text = `${HEADER}\nGame,2026-10-22,12:00,CT,,sports,,,,`;
		const { events, errors } = parseEventImport(text);
		eq("a zoned row imports", errors, []);
		eq("an abbreviation becomes an IANA id", events[0].timezone, "America/Chicago");
	}
	{
		const text = `${HEADER}\nGame,2026-10-22,12:00,Neptune,,sports,,,,`;
		const { errors } = parseEventImport(text);
		ok(
			"a zone that isn't one is reported",
			errors.some((e) => e.message.includes("Neptune"))
		);
	}
	{
		// A zone with no clock to qualify says nothing, so it isn't kept.
		const text = `${HEADER}\nGame,2026-10-22,TBD,CT,,sports,,,,`;
		const { events } = parseEventImport(text);
		eq("a zone on a TBD time is dropped", events[0].timezone, "");
	}
	{
		const { events, errors } = parseEventImport("date,NAME\n2026-1-5,Dentist");
		eq("columns in any order and case", errors, []);
		eq("dates are zero-padded", events[0].date, "2026-01-05");
	}
	{
		// An event without a date is a someday — a different page with a
		// different shape — so the import says so rather than making one.
		const { events, errors } = parseEventImport(
			"date,NAME\n2026-1-5,Dentist\n,Someday thing"
		);
		ok(
			"a row with no date is refused",
			errors.some((e) => e.message.includes("no date"))
		);
		eq("...and nothing imports around it", events, []);
	}
	eq("nothing pasted, nothing to say", parseEventImport("  \n "), { events: [], errors: [] });

	// ---------- what's wrong, and where ----------
	{
		const { events, errors } = parseEventImport(
			`${HEADER}\nFine,2026-10-02\n,2026-10-03\nBad date,2026-02-30\nBad time,2026-10-04,soon\nBad type,2026-10-05,,,,picnic`
		);
		eq("any error means nothing imports", events, []);
		eq(
			"every problem is reported, by line",
			errors.map((e) => e.line),
			[3, 4, 5, 6]
		);
		ok("a missing name says so", errors[0]?.message.includes("no name"));
		ok("a date that doesn't exist is caught", errors[1]?.message.includes("2026-02-30"));
		ok("a bad type lists the real ones", errors[3]?.message.includes("hangout"));
	}
	{
		const { errors } = parseEventImport("Date,Time\n2026-10-02,19:30");
		ok("a header without Name is an error", errors.some((e) => e.message.includes('"Name"')));
	}
	{
		const { errors } = parseEventImport("Name,Title\nGig,x");
		ok("an unknown column is an error", errors.some((e) => e.message.includes('"Title"')));
	}

	// ---------- copying the problems ----------
	{
		const errs = [
			{ line: 3, message: "Has no name." },
			{ line: 0, message: "Missing the Name column." },
		];
		eq(
			"a copy is the heading, then a line per problem",
			problemsText(errs),
			"2 problems to fix\nLine 3: Has no name.\nMissing the Name column."
		);
		eq("one problem is singular", problemsHeading(1), "1 problem to fix");
		eq("a row-less problem has no line prefix", problemLine(errs[1]), "Missing the Name column.");
		// The box on screen stops at twenty and says "and N more". The copy
		// must not — it's what gets pasted back to have them all fixed.
		const many = Array.from({ length: 35 }, (_, i) => ({
			line: i + 2,
			message: "Has no date.",
		}));
		const lines = problemsText(many).split("\n");
		eq("all thirty-five make it into the copy", lines.length, 36);
		eq("...headed with the true count", lines[0], "35 problems to fix");
		eq("...ending on the last one", lines[35], "Line 36: Has no date.");
	}

	// ---------- no header ----------
	{
		const { events, errors } = parseEventImport(
			// Name, Date, Time, Timezone, Duration, Type — the order
		// IMPORT_COLUMNS declares, which is what a headerless row means.
		"Gig,2026-10-02,8pm,,,concert\nDentist,2026-10-05"
		);
		eq("without a header, the first row is an event", errors, []);
		eq("…in the standard column order", events.map((e) => [e.name, e.date, e.time, e.type]), [
			["Gig", "2026-10-02", "20:00", "concert"],
			["Dentist", "2026-10-05", "", ""],
		]);
	}
	{
		const { errors } = parseEventImport("Title,When\nGig,2026-10-02");
		eq(
			"a first row naming no known column is read as an event",
			errors.map((e) => e.line),
			[1]
		);
		ok("…and a bad one says what's wrong with it", errors[0]?.message.includes('"When"'));
	}

	// ---------- the example, left in ----------
	{
		const { events, errors } = parseEventImport(
			`${importTemplate()}\nGig,2026-10-02`
		);
		eq("a real event under the example still imports", errors, []);
		eq("…without the example", events.map((e) => e.name), ["Gig"]);
	}
	{
		const { events } = parseEventImport(
			"Name,Date\nCeltics vs Knicks,2026-10-22\nGig,2026-10-02"
		);
		eq("the example is caught under a trimmed-down header", events.map((e) => e.name), ["Gig"]);
	}
	{
		const { events } = parseEventImport(
			"Name,Date\nCeltics vs Knicks,2026-11-01"
		);
		eq("a real event that only shares its name is kept", events.length, 1);
	}
	{
		const row = importTemplate().split("\n")[1];
		const { events } = parseEventImport(`${row}\nGig,2026-10-02`);
		eq("…and it's caught without a header too", events.map((e) => e.name), ["Gig"]);
	}
	{
		const { errors } = parseEventImport("Name,Date\nGig, Cambridge,2026-10-02");
		ok("too many cells points at quoting", errors[0]?.message.includes("double quotes"));
	}
	eq(
		"a header with nothing under it",
		parseEventImport(HEADER).errors.length,
		1
	);

	// ---------- duplicates ----------
	{
		const d = duplicateNames(
			[{ name: "Celtics vs Knicks" }, { name: "celtics vs knicks " }, { name: "Dinner at Toro" }, { name: "Gig" }],
			["Dinner at Toro", "Something else"]
		);
		eq("repeats within the import, ignoring case", d.inImport, ["Celtics vs Knicks"]);
		eq("names already in the vault", d.inVault, ["Dinner at Toro"]);
	}

	// ---------- the prompt ----------
	{
		const prompt = importPrompt();
		const block = /```csv\n([\s\S]*?)\n```/.exec(prompt)?.[1] ?? "";
		const parsed = parseEventImport(block);
		eq("the prompt's example reads cleanly", parsed.errors, []);
		eq("…and both its rows are skipped as examples", parsed.events.length, 0);
		const edited = parseEventImport(block.replace("2026-10-25", "2026-10-26"));
		eq("…though an edited row is a real event", edited.events.map((e) => e.name), ["🏀 Celtics vs Heat"]);
		ok("it names every column", IMPORT_COLUMNS.every((c) => prompt.includes(c.label)));
		ok(
			"it lists every event type by id",
			["hangout", "party", "concert", "movie", "sports", "task", "other"].every((id) =>
				prompt.includes(`- ${id} (`)
			)
		);
		ok("it ends ready for the events to be pasted after", prompt.trimEnd().endsWith("Here are the events:"));
	}

	return result();
}
