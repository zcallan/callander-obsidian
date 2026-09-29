import {
	EVENT_SPECIAL_TIMES,
	EVENT_TYPES,
	type EventType,
} from "@/constants";
import { parseFlexDate } from "@/utils/flexdate";
import { normalizeTimezone } from "@/utils/timezone";
import { formatDurationLabel, parseDurationMinutes } from "@/utils/planFormat";
import { hhmm, isoDateOf, pad2 } from "@/utils/dates";
import { formatCount } from "@/utils/text";

/**
 * Bulk event import: CSV in, events out.
 *
 * CSV because it's what a spreadsheet exports and what an AI will reliably
 * produce when asked to "fill in this format" — a season's fixtures, a
 * term's classes. The header row names the columns, so their order is the
 * writer's choice, and only Name is required.
 *
 * Pure: the modals parse and preview with this, and only the confirmation
 * touches the vault.
 */

export const IMPORT_COLUMNS = [
	{ key: "name", label: "Name", example: "Celtics vs Knicks" },
	{ key: "date", label: "Date", example: "2026-10-22" },
	{ key: "time", label: "Time", example: "19:30" },
	{ key: "timezone", label: "Timezone", example: "" },
	{ key: "duration", label: "Duration", example: "2h 30m" },
	{ key: "type", label: "Type", example: "sports" },
	{ key: "location", label: "Location", example: "TD Garden, Boston" },
	{
		key: "people",
		label: "People",
		example: "Haruki Murakami; John Steinbeck",
	},
	{ key: "link", label: "Link", example: "https://example.com/tickets" },
	{ key: "description", label: "Description", example: "Home opener" },
] as const;

type ColumnKey = (typeof IMPORT_COLUMNS)[number]["key"];

/** A second example row for the prompt: the leading-emoji habit, a quoted
 * location, and the empty cells a row can leave. */
const PROMPT_EXAMPLE_ROW = [
	"🏀 Celtics vs Heat",
	"2026-10-25",
	"7:00pm",
	"ET",
	"",
	"sports",
	"Kaseya Center, Miami",
	"",
	"",
	"Away game",
];

/**
 * Both example rows, by column — the format box's and the prompt's. A row
 * that matches one of these is the example left in by accident while
 * pasting real events under it, and is skipped rather than imported.
 */
const EXAMPLES: Record<ColumnKey, string>[] = [
	IMPORT_COLUMNS.map((c) => c.example),
	PROMPT_EXAMPLE_ROW,
].map(
	(row) =>
		Object.fromEntries(
			IMPORT_COLUMNS.map((c, i) => [c.key, row[i] ?? ""])
		) as Record<ColumnKey, string>
);

/** One event read from the import, cleaned up and ready to write. */
export interface ImportedEvent {
	/** The line its row starts on, for pointing at it. */
	line: number;
	name: string;
	/** Flex date, as the rest of the plugin stores it; "" for undated. */
	date: string;
	/** 24-hour "HH:MM", or "". */
	time: string;
	/** IANA zone the time belongs to, or "" when it simply floats. */
	timezone: string;
	/** Canonical "2h 30m", or "". */
	duration: string;
	type: EventType | "";
	location: string;
	/** As written — names, not links. The vault resolves them. */
	people: string[];
	link: string;
	description: string;
}

export interface ImportError {
	/** The line the problem is on; 0 when it's about the input as a whole. */
	line: number;
	message: string;
}

/** A cell as CSV writes it: quoted when it has to be. */
function csvCell(value: string): string {
	return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The header row and one example row — what the import modal offers to
 * copy, and what an AI can be handed as the format to follow. */
export function importTemplate(): string {
	const header = IMPORT_COLUMNS.map((c) => csvCell(c.label)).join(",");
	const example = IMPORT_COLUMNS.map((c) => csvCell(c.example)).join(",");
	return `${header}\n${example}`;
}

/**
 * CSV rows, each with the line it started on.
 *
 * The usual rules: a comma separates cells, a double quote wraps one that
 * holds commas, quotes or line breaks, and "" inside a quoted cell is a
 * quote. Wholly blank lines are skipped — a pasted block often ends with
 * one, and a gap between groups of rows is easy to leave by accident.
 *
 * A quote only opens a quoted cell at the start of one (spaces before it
 * allowed). Anywhere else it's just a character — `12" pizza` — which
 * otherwise opened a quoted cell that ran on into the rows after it,
 * silently folding them into this row's last cell.
 */
export function parseCsv(raw: string): { line: number; cells: string[] }[] {
	// One kind of line break, before anything reads the text: a "\r\n"
	// inside a quoted cell was kept as it was, and written into the event.
	const text = raw.replace(/\r\n?/g, "\n");
	const rows: { line: number; cells: string[] }[] = [];
	let cells: string[] = [];
	let cell = "";
	let quoted = false;
	let line = 1;
	let rowLine = 1;

	const endRow = () => {
		cells.push(cell);
		if (cells.some((c) => c.trim() !== "")) {
			rows.push({ line: rowLine, cells });
		}
		cells = [];
		cell = "";
	};

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					cell += '"';
					i++;
				} else {
					quoted = false;
				}
			} else {
				if (ch === "\n") line++;
				cell += ch;
			}
			continue;
		}
		if (ch === '"' && cell.trim() === "") {
			quoted = true;
		} else if (ch === ",") {
			cells.push(cell);
			cell = "";
		} else if (ch === "\n") {
			endRow();
			line++;
			rowLine = line;
		} else {
			cell += ch;
		}
	}
	endRow();
	return rows;
}

/**
 * "19:30", "7:30pm", "7pm", "7 PM" → "19:30"; null when it isn't a time.
 *
 * "Anytime" and "TBD" come through as themselves — they're answers an
 * event can store, so a spreadsheet gets to give them.
 */
export function normalizeTime(raw: string): string | null {
	const text = raw.trim().toLowerCase();
	const special = EVENT_SPECIAL_TIMES.find(
		(t) => t.id === text || t.label.toLowerCase() === text
	);
	if (special) return special.id;
	const clock = /^(\d{1,2}):(\d{2})$/.exec(text);
	if (clock) {
		const h = Number(clock[1]);
		const m = Number(clock[2]);
		return h <= 23 && m <= 59 ? hhmm(h, m) : null;
	}
	const twelve = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(text);
	if (twelve) {
		const h = Number(twelve[1]);
		const m = twelve[2] ? Number(twelve[2]) : 0;
		if (h < 1 || h > 12 || m > 59) return null;
		const hour = (h % 12) + (twelve[3] === "pm" ? 12 : 0);
		return hhmm(hour, m);
	}
	return null;
}

/** A date as the plugin stores it — zero-padded, at the precision given. */
function normalizeDate(raw: string): string | null {
	const p = parseFlexDate(raw.trim());
	if (!p || p.year === null) return null;
	if (p.month === null) return String(p.year);
	if (p.day === null) return `${p.year}-${pad2(p.month)}`;
	// parseFlexDate takes any day up to 31; a date that doesn't exist — the
	// 30th of February — is a typo worth catching rather than storing.
	const d = new Date(p.year, p.month - 1, p.day);
	if (d.getMonth() !== p.month - 1) return null;
	return isoDateOf(p.year, p.month, p.day);
}

/** An event type by id or label, any case: "sports", "Sports", "Life event". */
function typeOf(raw: string): EventType | null {
	const text = raw.trim().toLowerCase();
	const hit = EVENT_TYPES.find(
		(t) => t.id.toLowerCase() === text || t.label.toLowerCase() === text
	);
	return hit ? hit.id : null;
}

/** A header row as column keys, noting any name it doesn't know. */
function readHeader(
	header: { line: number; cells: string[] },
	errors: ImportError[]
): (ColumnKey | null)[] {
	return header.cells.map((raw) => {
		const label = raw.trim().toLowerCase();
		const col = IMPORT_COLUMNS.find((c) => c.label.toLowerCase() === label);
		if (!col && label !== "") {
			errors.push({
				line: header.line,
				message: `Unknown column "${raw.trim()}". The columns are: ${IMPORT_COLUMNS.map(
					(c) => c.label
				).join(", ")}.`,
			});
		}
		return col ? col.key : null;
	});
}

/**
 * Parse an import into events, or say exactly what's wrong with it.
 *
 * All-or-nothing by design: the confirmation only proceeds on no errors,
 * so every problem is collected rather than stopping at the first — fixing
 * a pasted season one error per round trip would be miserable.
 */
export function parseEventImport(text: string): {
	events: ImportedEvent[];
	errors: ImportError[];
} {
	const rows = parseCsv(text);
	if (rows.length === 0) return { events: [], errors: [] };

	const errors: ImportError[] = [];
	// The header is optional: a first row naming any known column is one,
	// and anything else is already an event, its cells in the standard
	// order — which is what an AI asked to "skip the header" produces.
	const labelOf = (raw: string) => raw.trim().toLowerCase();
	const header = rows[0];
	const hasHeader = header.cells.some((raw) =>
		IMPORT_COLUMNS.some((c) => c.label.toLowerCase() === labelOf(raw))
	);
	const data = hasHeader ? rows.slice(1) : rows;
	const columns: (ColumnKey | null)[] = hasHeader
		? readHeader(header, errors)
		: IMPORT_COLUMNS.map((c) => c.key);
	if (!columns.includes("name")) {
		errors.push({
			line: header.line,
			message:
				'The column names need to include "Name" — copy the format above to start from.',
		});
		return { events: [], errors };
	}
	if (data.length === 0) {
		errors.push({
			line: 0,
			message: "There's a header row but no events under it yet.",
		});
		return { events: [], errors };
	}

	const events: ImportedEvent[] = [];
	for (const row of data) {
		const at = (key: ColumnKey): string => {
			const i = columns.indexOf(key);
			return i >= 0 ? (row.cells[i] ?? "").trim() : "";
		};
		const problem = (message: string) =>
			errors.push({ line: row.line, message });

		if (row.cells.length > columns.length) {
			problem(
				`Has ${row.cells.length} cells but ${
					hasHeader ? "the header has" : "there are only"
				} ${columns.length} columns — a comma inside a cell needs the cell in "double quotes".`
			);
			continue;
		}

		// The example, left in: skipped without a word. Compared on the
		// columns this import actually has, so it's still caught under a
		// header trimmed down to a few of them.
		const present = columns.filter((c): c is ColumnKey => c !== null);
		if (
			EXAMPLES.some((ex) =>
				present.every((key) => at(key).toLowerCase() === ex[key].toLowerCase())
			)
		) {
			continue;
		}

		const name = at("name");
		if (!name) problem("Has no name.");

		const rawDate = at("date");
		if (!rawDate) problem("Has no date. Every event needs one.");
		const date = rawDate ? normalizeDate(rawDate) : "";
		if (date === null) {
			problem(`"${rawDate}" isn't a date — use YYYY-MM-DD, like 2026-10-22.`);
		}

		const rawTime = at("time");
		const time = rawTime ? normalizeTime(rawTime) : "";
		if (time === null) {
			problem(
				`"${rawTime}" isn't a time — use 24-hour HH:MM, like 19:30, or Anytime or TBD.`
			);
		}

		const rawZone = at("timezone");
		const timezone = rawZone ? normalizeTimezone(rawZone) : "";
		if (timezone === null) {
			problem(
				`"${rawZone}" isn't a timezone — use one like ET, Central or America/Chicago, or leave it blank for a local time.`
			);
		}

		const rawDuration = at("duration");
		const minutes = rawDuration ? parseDurationMinutes(rawDuration) : null;
		if (rawDuration && minutes === null) {
			problem(`"${rawDuration}" isn't a duration — use hours and minutes, like 2h 30m.`);
		}

		const rawType = at("type");
		const type = rawType ? typeOf(rawType) : "";
		if (type === null) {
			problem(
				`"${rawType}" isn't an event type. Use one of: ${EVENT_TYPES.map(
					(t) => t.id
				).join(", ")} — or leave it blank.`
			);
		}

		if (!name || !rawDate || date === null || time === null) continue;
		if (type === null) continue;
		if (timezone === null) continue;
		if (rawDuration && minutes === null) continue;

		events.push({
			line: row.line,
			name,
			date,
			time,
			// A zone with no clock to qualify has nothing to say — an
			// "Anytime" in Central is just an Anytime.
			timezone: /^\d{1,2}:\d{2}$/.test(time) ? timezone : "",
			duration: minutes ? formatDurationLabel(minutes) : "",
			type,
			location: at("location"),
			people: at("people")
				.split(";")
				.map((p) => p.trim().replace(/^\[\[|\]\]$/g, "").trim())
				.filter(Boolean),
			link: at("link"),
			description: at("description"),
		});
	}
	return { events: errors.length > 0 ? [] : events, errors };
}

/** "1 problem to fix" / "3 problems to fix" — the box's own heading. */
export function problemsHeading(count: number): string {
	return `${formatCount(count, "problem")} to fix`;
}

/** One problem as a line: "Line 4: …", or bare when it has no row. */
export function problemLine(error: ImportError): string {
	return error.line > 0 ? `Line ${error.line}: ${error.message}` : error.message;
}

/**
 * Every problem as plain text, for pasting somewhere else — most usefully
 * back to whatever produced the CSV, to have it fixed.
 *
 * All of them, where the box on screen stops at twenty and says "and N
 * more": the box is for reading, and a copy that dropped the tail would
 * hand back a list that fixes twenty and leaves the rest to be found on
 * the next paste.
 */
export function problemsText(errors: readonly ImportError[]): string {
	return [problemsHeading(errors.length), ...errors.map(problemLine)].join("\n");
}

/**
 * Names that appear more than once in the import, and names already taken
 * by an event in the vault — both compared without case or edge spaces.
 * Not errors: a season can meet the same team twice. Worth a look though.
 */
export function duplicateNames(
	imported: readonly { name: string }[],
	existing: readonly string[]
): { inImport: string[]; inVault: string[] } {
	const key = (s: string) => s.trim().toLowerCase();
	const counts = new Map<string, { name: string; n: number }>();
	for (const e of imported) {
		const k = key(e.name);
		const hit = counts.get(k);
		if (hit) hit.n++;
		else counts.set(k, { name: e.name.trim(), n: 1 });
	}
	const taken = new Set(existing.map(key));
	return {
		inImport: [...counts.values()].filter((c) => c.n > 1).map((c) => c.name),
		inVault: [...counts.entries()]
			.filter(([k]) => taken.has(k))
			.map(([, c]) => c.name),
	};
}

/**
 * A prompt to hand an AI along with a description of some events, so what
 * comes back is CSV this import reads first time: every rule the parser
 * enforces, the event types it knows, and a worked example.
 *
 * Ends on "Here are the events:" so whatever is pasted after it is the
 * thing to convert.
 */
export function importPrompt(): string {
	const example = [
		importTemplate(),
		PROMPT_EXAMPLE_ROW.map(csvCell).join(","),
	].join("\n");
	const types = EVENT_TYPES.map(
		(t) => `  - ${t.id} (${t.emoji} ${t.label})`
	).join("\n");
	return `I want to add some events to Callander, an Obsidian plugin, using its bulk CSV import. Please turn the events I describe below into CSV that follows these rules exactly, and reply with only the CSV, in a single code block.

FORMAT
- The first row is the header. Use exactly these column names, in this order: ${IMPORT_COLUMNS.map(
		(c) => c.label
	).join(", ")}.
- One event per row, in date order.
- Separate cells with commas. If a cell contains a comma, a double quote or a line break, wrap the whole cell in double quotes, and write any double quote inside it as two ("").
- Every row has exactly as many cells as the header. Leave a cell empty (nothing between the commas) when there's nothing to put in it. Name and Date are required; everything else may be empty.

COLUMNS
- Name: the event's title, short and specific (e.g. Celtics vs Knicks). You can start it with one emoji that suits the event (e.g. 🏀 Celtics vs Knicks) — the calendar shows that emoji in place of the type's.
- Date: the day it happens, as YYYY-MM-DD (e.g. 2026-10-22). Required — every event has one. It must be a real date. Use YYYY-MM if only the month is known, or YYYY if only the year is.
- Time: the start time, 24-hour HH:MM (e.g. 19:30). Write Anytime for something that runs whenever, or TBD when a time is coming but isn't settled. Leave it empty for something all-day.
- Timezone: which zone the Time is quoted in. This matters — get it wrong and every time reads an hour or three out.
  - Leave it EMPTY when the time is simply the local time where the event happens, and I'd read it that way too. A dinner at 7pm is at 7pm; it shouldn't be converted. This is the normal case, so prefer it when unsure.
  - FILL IT IN when the time belongs to a zone that isn't necessarily mine — a schedule listing each game in the venue's local time, or a broadcast quoted as "12pm CT". Then I see it converted to my own zone automatically, which is the whole point.
  - Write it as an abbreviation (ET, CT, MT, PT) or an IANA name (America/Chicago). If a source lists times in the venue's local zone, use the venue's zone for each row — they won't all be the same.
- Duration: how long it runs, in hours and minutes (e.g. 2h 30m, 3h, 45m). Optional.
- Type: exactly one of these ids, or empty if none fits:
${types}
- Location: the venue and place (e.g. "TD Garden, Boston" — quoted, because it has a comma).
- People: the people going, by name, separated by semicolons (e.g. Sally Rooney; Haruki Murakami). Only include people I've named — otherwise leave it empty.
- Link: a URL for tickets or details, if there is one.
- Description: a short note, if it's useful.

EXAMPLE
\`\`\`csv
${example}
\`\`\`

Before replying, check that every row has the same number of cells as the header, every row has a date, every date is real and written YYYY-MM-DD, every time is 24-hour HH:MM (or Anytime or TBD), every Timezone is either empty or a real zone, and every Type is one of the ids above.

Here are the events:
`;
}
