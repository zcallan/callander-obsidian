import {
	NOTES_HEADING,
	readSection,
	upsertSection,
	type SectionSpec,
} from "@/utils/markdownSection";
import { GENERATED_MARKER, isGenerated } from "@/utils/generated";

/**
 * Drafts, kept as a checklist under `## Drafts` in the dashboard note.
 *
 * A draft is a raw thought waiting to be sorted, and the list used to be
 * frontmatter that a draft was deleted from once handled — which left no
 * trace of what had been captured. As a checklist a handled draft is ticked
 * instead of removed, so the note doubles as a record.
 *
 * On disk:
 *
 *     ## Drafts
 *
 *     - [ ] Ask about the allotment [[George Orwell]] ➕ 2026-09-15
 *     - [x] Book the dentist ➕ 2026-09-10 ✅ 2026-09-21
 *
 * The markers are the Tasks plugin's own (➕ created, ✅ done), so the file
 * reads sensibly there too — and it is the same convention Ideas already
 * borrows for ⏳.
 *
 * A person a draft is about is a wikilink after the text, which makes it a
 * real link: it shows in their backlinks, and a rename updates it.
 */

export const DRAFTS_SECTION: SectionSpec = {
	heading: "## Drafts",
	matches: /^##\s+Drafts\s*$/i,
	// No sub-structure of its own, but a `###` a person adds by hand should
	// stay inside rather than end the list.
	closes: /^#{1,2}\s/,
};

/**
 * The same checklist in a plan's own note, where it shares the body with the
 * plan's `## Notes`. Like every generated section there it sits above that
 * heading, and is only looked for above it (SectionSpec.above) — otherwise a
 * first draft is appended after the Notes, which run to the end of the file,
 * and the checklist reads as part of them: shown in the Notes box, and gone
 * the next time the notes are saved.
 *
 * The dashboard note has no Notes section, so it keeps DRAFTS_SECTION, and
 * finds its checklist wherever it sits.
 */
export const PAGE_DRAFTS_SECTION: SectionSpec = {
	...DRAFTS_SECTION,
	above: NOTES_HEADING,
};

/** One draft in the checklist. */
export interface LedgerDraft {
	text: string;
	/**
	 * The link text of the person it's about, as written inside `[[ ]]` —
	 * "George Orwell", or "George Orwell|George" if an alias was typed.
	 * Resolving it to a note is the caller's job; this stays pure.
	 */
	person?: string;
	/**
	 * A day it's pinned to — a plan's own drafts only, where it seats the
	 * thought on the itinerary rather than leaving it to sort later.
	 * Dashboard and person drafts never carry one.
	 */
	date?: string;
	/** YYYY-MM-DD; "" when the line has no ➕ marker. */
	created: string;
	done: boolean;
	/** YYYY-MM-DD it was ticked off, when the line says so. */
	doneDate?: string;
	/** Added by Claude — see utils/generated. */
	generated?: boolean;
}

/** `- [ ] text` / `- [x] text`, with `*` tolerated as the bullet marker. */
const TASK = /^[-*]\s+\[([ xX])\]\s*(.*)$/;

const DAY = "(\\d{4}-\\d{2}-\\d{2})";
/** Trailing markers, each anchored to end-of-line and shaped like a real
 * date, so a draft whose text merely mentions the emoji isn't mistaken. */
const CREATED = new RegExp(`\\s*➕\\s*${DAY}\\s*$`);
const DONE = new RegExp(`\\s*✅\\s*${DAY}\\s*$`);
/** The day a plan's own draft is pinned to — see LedgerDraft.date. */
const PINNED_DAY = new RegExp(`\\s*📅\\s*${DAY}\\s*$`);
const GENERATED = new RegExp(`\\s*${GENERATED_MARKER}\\s*$`, "u");
/**
 * A wikilink at the very end of the text. It has to start at the *last*
 * `[[` — a lazy match from the first would swallow everything between two
 * links — and it may contain a lone `[` or `]`, which a name like
 * "Sci-Fi [Book Club]" does.
 */
const PERSON = /\s*\[\[((?:(?!\[\[).)+?)\]\]\s*$/;

export function isDraftLine(line: string): boolean {
	return TASK.test(line.trim());
}

/** One task bullet → a draft; null for anything that isn't one, or is empty. */
export function parseDraftLine(line: string): LedgerDraft | null {
	const match = TASK.exec(line.trim());
	if (!match) return null;
	const done = match[1].toLowerCase() === "x";
	let text = match[2].trim();

	let created = "";
	let doneDate: string | undefined;
	let generated = false;
	let date: string | undefined;
	// The markers come off in whatever order they sit — the writer's order
	// is fixed, but a hand- or Claude-typed line may differ.
	for (;;) {
		const d = doneDate === undefined ? DONE.exec(text) : null;
		if (d) {
			doneDate = d[1];
			text = text.slice(0, d.index).trim();
			continue;
		}
		const c = created === "" ? CREATED.exec(text) : null;
		if (c) {
			created = c[1];
			text = text.slice(0, c.index).trim();
			continue;
		}
		const g = generated ? null : GENERATED.exec(text);
		if (g) {
			generated = true;
			text = text.slice(0, g.index).trim();
			continue;
		}
		const p = date === undefined ? PINNED_DAY.exec(text) : null;
		if (p) {
			date = p[1];
			text = text.slice(0, p.index).trim();
			continue;
		}
		break;
	}

	let person: string | undefined;
	const link = PERSON.exec(text);
	// Only when something is left once the link is taken off. A line that is
	// nothing but "[[George]]" is a draft *of* that link, not one about
	// George with no words — dropping the text would lose it.
	if (link && text.slice(0, link.index).trim() !== "") {
		person = link[1];
		text = text.slice(0, link.index).trim();
	}
	if (!text) return null;

	return {
		text,
		...(person && { person }),
		...(date && { date }),
		created,
		done,
		...(doneDate && { doneDate }),
		...(generated && { generated: true }),
	};
}

export function serializeDraftLine(draft: LedgerDraft): string {
	const box = draft.done ? "[x]" : "[ ]";
	// One line: a newline typed into the capture box (Shift+Enter) would
	// otherwise end the list item halfway through the thought.
	const text = draft.text.replace(/\s*\n\s*/g, " ").trim();
	const person = draft.person ? ` [[${draft.person}]]` : "";
	const date = draft.date ? ` 📅 ${draft.date}` : "";
	const flag = isGenerated(draft.generated) ? ` ${GENERATED_MARKER}` : "";
	const created = draft.created ? ` ➕ ${draft.created}` : "";
	const done = draft.done && draft.doneDate ? ` ✅ ${draft.doneDate}` : "";
	return `- ${box} ${text}${person}${date}${flag}${created}${done}`;
}

/**
 * The section's drafts in file order, or null when there's no `## Drafts`.
 * A plan's own note passes PAGE_DRAFTS_SECTION.
 */
export function parseDraftsSection(
	body: string,
	spec: SectionSpec = DRAFTS_SECTION
): LedgerDraft[] | null {
	const lines = readSection(body, spec);
	if (lines === null) return null;
	const drafts: LedgerDraft[] = [];
	for (const line of lines) {
		const draft = parseDraftLine(line);
		if (draft) drafts.push(draft);
	}
	return drafts;
}

/** A checklist has no blank lines between its items. */
export function renderDraftLines(drafts: readonly LedgerDraft[]): string[] {
	return drafts.map(serializeDraftLine);
}

export function upsertDraftsSection(
	body: string,
	drafts: readonly LedgerDraft[],
	spec: SectionSpec = DRAFTS_SECTION
): string {
	return upsertSection(body, spec, renderDraftLines(drafts), isDraftLine);
}

/**
 * Which draft an action means, given where the list was when it was read.
 *
 * Addressed by position but checked against the text: the file can change
 * between a click and the write (a sync, an edit in the note itself), and
 * acting on whichever draft now sits at that position would tick or rewrite
 * the wrong one. If the position no longer holds that text, the first open
 * draft that does is used instead; -1 when nothing does.
 */
export function findDraft(
	drafts: readonly LedgerDraft[],
	index: number,
	text: string
): number {
	const at = drafts[index];
	if (at && !at.done && at.text === text) return index;
	return drafts.findIndex((d) => !d.done && d.text === text);
}

/**
 * Drafts as they were kept in frontmatter, carried into the checklist.
 * Ordered by capture date so the file reads oldest-first, the way a
 * checklist that new items are appended to would have grown.
 */
export function fromLegacyDrafts(
	legacy: ReadonlyArray<{
		text: string;
		created: string;
		generated?: boolean;
		person?: string;
	}>
): LedgerDraft[] {
	return legacy
		.map((d, i) => ({ d, i }))
		.sort((a, b) => a.d.created.localeCompare(b.d.created) || a.i - b.i)
		.map(({ d }) => ({
			text: d.text,
			...(d.person && { person: d.person }),
			created: d.created,
			done: false,
			...(d.generated && { generated: true }),
		}));
}

/**
 * Add migrated drafts to a checklist that may already hold some of them.
 *
 * A move that dies between its two writes leaves the drafts in both places,
 * and the next run must not add them twice. Each incoming draft first tries
 * to match one already present (same text, person and day), consuming it so
 * that two genuinely identical drafts still come out as two.
 */
export function mergeLegacyDrafts(
	existing: readonly LedgerDraft[],
	incoming: readonly LedgerDraft[]
): LedgerDraft[] {
	const key = (d: LedgerDraft) =>
		`${d.text} ${d.person ?? ""} ${d.created}`;
	const present = new Map<string, number>();
	for (const d of existing) present.set(key(d), (present.get(key(d)) ?? 0) + 1);
	const added: LedgerDraft[] = [];
	for (const d of incoming) {
		const left = present.get(key(d)) ?? 0;
		if (left > 0) present.set(key(d), left - 1);
		else added.push(d);
	}
	return [...existing, ...added];
}
