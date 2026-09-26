/**
 * Builds the example vault from the fictional cast, anchored to today.
 *
 * Callander's UI is almost entirely relative dates — "in 2 days", "8 days
 * ago", "Next Wednesday" — so a vault with hardcoded dates only photographs
 * correctly on the day it was written. The previous example vault was pinned
 * to a single afternoon and had drifted into showing an empty dashboard.
 *
 * So the cast stores *offsets*, and this re-derives real dates each run.
 * Regenerate before a screenshot pass and everything reads correctly again.
 *
 *   node tools/screenshots/make-seed.mjs                     # write examples/example-vault
 *   node tools/screenshots/make-seed.mjs --out DIR           # write somewhere else
 *   node tools/screenshots/make-seed.mjs --today 2026-09-18  # anchor to a day, not the clock
 *
 * `--today` is for changing what's written without moving every date: the
 * files are named for their dates, so a plain re-run on a later day renames
 * most of the vault. Pin it to the day the committed one was made for and
 * only the change you meant to make shows up in the diff.
 *
 * Ideas, quotes, notes and drafts are written as markdown sections in the
 * note body — the shape the plugin itself stores them in — by calling the
 * plugin's own serializers, so this can't drift from what Obsidian writes.
 * The bundle they come from is built fresh on every run. A seed in an older
 * shape still loads, but only by firing a migration on first open, and would
 * be rewritten in Obsidian the moment anyone looked at it.
 */

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stringify } from "yaml";
import { buildTestBundle } from "../../tests/build.mjs";
import { OWNER, GROUPS, PEOPLE, EVENTS } from "./cast.mjs";
import { PLANS, SOMEDAYS, DIARY, EXPENSES, INBOX_DRAFTS } from "./cast-plans.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");

const {
	upsertIdeasSection,
	upsertQuotesSection,
	upsertNotesSection,
	upsertDraftsSection,
} = await import(pathToFileURL(await buildTestBundle()).href);

const outArg = process.argv.indexOf("--out");
const OUT = outArg > -1 ? path.resolve(process.argv[outArg + 1]) : path.join(repo, "examples", "example-vault");
const BASE = "Friends";

const todayArg = process.argv.indexOf("--today");
const TODAY =
	todayArg > -1 ? new Date(`${process.argv[todayArg + 1]}T12:00:00`) : new Date();
if (Number.isNaN(TODAY.getTime())) {
	throw new Error("--today needs a date, like 2026-09-18");
}
TODAY.setHours(12, 0, 0, 0);

const pad = (n) => String(n).padStart(2, "0");

function shift(days) {
	const d = new Date(TODAY);
	d.setDate(d.getDate() + days);
	return d;
}

/** ISO date `days` from today. */
const day = (days) => {
	const d = shift(days);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** A birthday: the historical year, moved to the month/day `days` out. */
function birthday(year, days) {
	const d = shift(days);
	return `${year}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM" `months` out — the flex-date shape a someday can carry. */
function month(months) {
	const d = new Date(TODAY);
	d.setDate(1);
	d.setMonth(d.getMonth() + months);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

const TODAY_ISO = day(0);
const link = (name) => `[[${name}]]`;

/**
 * A note: frontmatter, then a body. Keys with empty values are dropped, not
 * emitted.
 *
 * `raw` writes the body straight after the closing fence, as the plugin does
 * for the sections it owns; without it the body is set off by a blank line,
 * which is what prose (a diary entry) wants.
 */
function note(relPath, frontmatter, body = "", { raw = false } = {}) {
	const clean = {};
	for (const [k, v] of Object.entries(frontmatter)) {
		if (v === undefined || v === null || v === "") continue;
		if (Array.isArray(v) && v.length === 0) continue;
		clean[k] = v;
	}
	const yaml = stringify(clean, { lineWidth: 0 }).trimEnd();
	const full = path.join(OUT, relPath);
	mkdirSync(path.dirname(full), { recursive: true });
	writeFileSync(
		full,
		`---\n${yaml}\n---\n${raw ? body : body ? `\n${body}\n` : ""}`
	);
}

/** Filesystem-safe: Obsidian rejects these in filenames. */
const safe = (s) => s.replace(/[\\/:*?"<>|]/g, "-");

// Wipe only the plugin's own folder — anything else in the vault stays.
rmSync(path.join(OUT, BASE), { recursive: true, force: true });

// ── Groups ───────────────────────────────────────────────────────────────
for (const g of GROUPS) {
	note(`${BASE}/Groups/${safe(g.name)}.md`, { name: g.name, color: g.color });
}

// Drafts live as a checklist in the dashboard note, not in frontmatter —
// each about-someone one a wikilink on its line. Gathered here as people
// are written, then laid down under "## Drafts" with the dashboard below.
const DRAFTS = [];

// ── People ───────────────────────────────────────────────────────────────
for (const p of PEOPLE) {
	for (const d of p.drafts ?? []) {
		DRAFTS.push({ text: d.text, person: p.name, created: day(d.created), done: false });
	}

	// Quotes, then ideas, then notes: each goes above `## Notes`, which is
	// last, and this is the order the plugin's own moves leave them in.
	let body = "";
	if (p.quotes?.length) body = upsertQuotesSection(body, p.quotes);
	if (p.ideas?.length) {
		body = upsertIdeasSection(
			body,
			p.ideas.map((i) => ({
				category: i.category,
				text: i.text,
				done: i.done,
				...(i.resurface !== undefined ? { resurface: day(i.resurface) } : {}),
			}))
		);
	}
	if (p.notes) body = upsertNotesSection(body, p.notes);

	note(`${BASE}/People/${safe(p.name)}.md`, {
		name: p.name,
		displayName: p.displayName,
		shortName: p.shortName,
		nicknames: p.nicknames,
		birthday: birthday(p.year, p.bd),
		met: day(p.met),
		relationship: p.relationship,
		groups: p.groups,
		hometown: p.hometown,
		location: p.location,
		company: p.company,
		jobTitle: p.jobTitle,
		industry: p.industry,
		parents: p.parents,
		siblings: p.siblings,
		interests: p.interests,
		funFacts: p.funFacts,
		insideJokes: p.insideJokes,
		created: TODAY_ISO,
		updated: TODAY_ISO,
	}, body, { raw: true });
}

// ── Events ───────────────────────────────────────────────────────────────
for (const e of EVENTS) {
	const date = day(e.day);
	note(`${BASE}/Events/${date} ${safe(e.name)}.md`, {
		kind: "event",
		name: e.name,
		status: e.status ?? "open",
		created: TODAY_ISO,
		date,
		time: e.time,
		type: e.type,
		people: e.people?.map(link),
		location: e.location,
		link: e.link,
		description: e.description,
		variant: e.variant,
		updated: TODAY_ISO,
	});
}

// ── Plans ────────────────────────────────────────────────────────────────
for (const pl of PLANS) {
	const dated = (row) => ({
		...row,
		...(row.day !== undefined ? { date: day(row.day) } : {}),
		day: undefined,
	});
	const strip = (row) => {
		const out = dated(row);
		delete out.day;
		return out;
	};
	note(`${BASE}/Plans/${safe(pl.name)}.md`, {
		name: pl.name,
		date: day(pl.day),
		endDate: pl.endDay !== undefined ? day(pl.endDay) : undefined,
		location: pl.location,
		status: pl.status,
		members: pl.members?.map(link),
		unconfirmedMembers: pl.unconfirmedMembers,
		items: pl.items?.map(strip),
		travel: pl.travel?.map(strip),
		accommodation: pl.accommodation?.map(strip),
		bring: pl.bring,
		costs: pl.costs,
		credits: pl.credits,
		drafts: pl.drafts?.map((d) => ({
			text: d.text,
			created: day(d.created),
			...(d.day !== undefined ? { date: day(d.day) } : {}),
		})),
		created: TODAY_ISO,
		updated: TODAY_ISO,
	});
}

// ── Somedays ─────────────────────────────────────────────────────────────
for (const s of SOMEDAYS) {
	note(`${BASE}/Somedays/${safe(s.name)}.md`, {
		kind: "someday",
		name: s.name,
		status: s.status ?? "open",
		created: TODAY_ISO,
		types: s.types,
		date: s.monthOffset !== undefined ? month(s.monthOffset) : undefined,
		fromDate: s.fromDay !== undefined ? day(s.fromDay) : undefined,
		untilDate: s.untilDay !== undefined ? day(s.untilDay) : undefined,
		seasons: s.seasons,
		days: s.days,
		times: s.times,
		company: s.company,
		people: s.people?.map(link),
		cost: s.cost,
		notes: s.notes,
		updated: TODAY_ISO,
	});
}

// ── Diary ────────────────────────────────────────────────────────────────
for (const d of DIARY) {
	const date = day(d.day);
	note(
		`${BASE}/Diary/${date} ${safe(d.title)}.md`,
		{ title: d.title, date, created: date },
		d.body
	);
}

// ── Dashboard: loose expenses and the untriaged inbox ────────────────────
for (const d of INBOX_DRAFTS) {
	DRAFTS.push({ text: d.text, created: day(d.created), done: false });
}
// Oldest first, the way a checklist that's appended to would have grown.
DRAFTS.sort((a, b) => a.created.localeCompare(b.created));
note(
	`${BASE}/Dashboard.md`,
	{
		kind: "dashboard",
		expenses: EXPENSES.map((e) => ({
			label: e.label,
			amount: e.amount,
			...(e.settled ? { settled: true } : {}),
			people: e.people?.map(link),
			split: e.split,
		})),
	},
	DRAFTS.length ? upsertDraftsSection("", DRAFTS) : "",
	{ raw: true }
);

console.log(
	`seeded ${OUT} for ${TODAY_ISO} — ` +
		`${PEOPLE.length} people, ${EVENTS.length} events, ${PLANS.length} plans, ` +
		`${SOMEDAYS.length} somedays, ${DIARY.length} diary entries, owner "${OWNER}"`
);
