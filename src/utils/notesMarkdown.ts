import {
	NOTES_HEADING,
	findSpan,
	readSection,
	upsertSection,
	type SectionSpec,
} from "@/utils/markdownSection";
import { IDEAS_SECTION, isIdeaLine } from "@/utils/ideasMarkdown";
import { QUOTES_SECTION, isQuoteLine } from "@/utils/quotesMarkdown";
import { EVENTS_SECTION, ownsEventLine } from "@/utils/eventsSection";

/**
 * A page's Notes: ordinary markdown under a `## Notes` heading, the last
 * section of the note's body.
 *
 * Notes used to be a frontmatter string, which is the wrong home for the
 * thing people write the most of — a property can't hold bold or a
 * highlight, other plugins' syntax doesn't apply to it, and paragraphs sit
 * in it as one cramped line. In the body it's markdown the real editor, and
 * every other plugin, already understands.
 *
 * Last, because it's the one section with no fixed shape. The generated
 * sections above it end at the next heading; Notes runs to the end of the
 * file, so headings someone writes inside their notes stay part of them.
 * Every generated section is only looked for — and only ever added — above
 * the Notes heading (SectionSpec.above), so nothing typed in the notes, even
 * a line that reads `## Ideas`, can be mistaken for one of theirs.
 */
export const NOTES_SECTION: SectionSpec = {
	heading: "## Notes",
	matches: NOTES_HEADING,
	// Markdown headings stop at six #s, so nothing real matches this: the
	// section only ends where the file does.
	closes: /^#{7,}\s/,
};

/** Does a line open or close a code fence (``` or ~~~)? */
function isFence(line: string): boolean {
	return /^\s*(```|~~~)/.test(line);
}

/**
 * Drop blank lines at either end, and fold runs of blank lines to one —
 * except inside a code fence, where blank lines are the content. Lines
 * themselves are never touched: leading spaces are indentation, and trailing
 * double spaces are a markdown line break.
 */
function tidyLines(lines: string[]): string[] {
	const out: string[] = [];
	let inFence = false;
	for (const line of lines) {
		const blank = line.trim() === "";
		if (blank && !inFence) {
			if (out.length === 0 || out[out.length - 1].trim() === "") continue;
		}
		if (isFence(line)) inFence = !inFence;
		out.push(line);
	}
	while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
	return out;
}

/** Notes as they'd be stored: `\n` line endings, tidy blank lines. */
export function normalizeNotes(text: string): string {
	return tidyLines(text.replace(/\r\n?/g, "\n").split("\n")).join("\n");
}

/**
 * The `## Notes` section's content, or null when the note has none — the
 * signal, as for Ideas and Quotes, that it hasn't been migrated yet.
 */
export function parseNotesSection(body: string): string | null {
	const lines = readSection(body, NOTES_SECTION);
	return lines === null ? null : normalizeNotes(lines.join("\n"));
}

/** A page's notes as the view shows them. Empty when there are none. */
export function notesFromBody(body: string): string {
	return parseNotesSection(body) ?? "";
}

/**
 * The body with its Notes replaced. Rewritten in place when the section
 * exists; otherwise added at the end, after every other section. Empty notes
 * remove the section, the way an emptied Ideas list does.
 *
 * Every line of the old section is the plugin's to replace — the section is
 * the notes, with nothing else sharing it — so the new text goes in whole,
 * paragraph breaks and all.
 */
export function upsertNotesSection(body: string, notes: string): string {
	const text = normalizeNotes(notes);
	return upsertSection(
		body,
		NOTES_SECTION,
		text ? text.split("\n") : [],
		() => true
	);
}

/** Notes joined into one, each part its own paragraph; empties skipped. */
export function joinNotes(...parts: string[]): string {
	return parts
		.map(normalizeNotes)
		.filter((p) => p.length > 0)
		.join("\n\n");
}

/** Whitespace-insensitive form, for comparing notes by their words. */
function squash(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/**
 * Notes with an older value folded in ahead of them: the frontmatter
 * `notes` a page used to keep, or prose written into the body before it had
 * a Notes section.
 *
 * Idempotent, because migrations re-run on every load: when the notes
 * already start with this value, a crash landed between writing the body
 * and clearing the old copy, and folding it in again would duplicate it.
 * Only a whole-word prefix counts, so a short value ("hi") isn't mistaken as
 * already carried over by notes that merely start with "high tide".
 */
export function foldFrontmatterNotes(older: string, notes: string): string {
	const fm = squash(older);
	if (!fm) return normalizeNotes(notes);
	const current = squash(notes);
	if (current === fm || current.startsWith(`${fm} `)) {
		return normalizeNotes(notes);
	}
	return joinNotes(older, notes);
}

// ---- Adopting prose written before the section existed ----

/** The sections the plugin generates — Notes excluded, it isn't generated. */
const GENERATED: ReadonlyArray<{
	spec: SectionSpec;
	owns: (line: string) => boolean;
}> = [
	{ spec: IDEAS_SECTION, owns: isIdeaLine },
	{ spec: QUOTES_SECTION, owns: isQuoteLine },
	{ spec: EVENTS_SECTION, owns: ownsEventLine },
];

/**
 * A body's prose outside any section, and the body without it.
 *
 * Only for a note that has no Notes section yet. People already wrote in the
 * body through "Edit markdown" — at the top, after the Events list, under
 * headings of their own — and that's exactly what the Notes box should
 * show. So the first migration gathers it up and moves it under `## Notes`
 * once; after that, Notes is the section and nothing else.
 *
 * Sections are located with the same findSpan their writers use, so this
 * can't disagree with them about where one starts or stops. Inside a
 * generated section, the plugin's own lines stay put and anything else —
 * a note typed under the Events list — counts as prose.
 */
export function splitLooseProse(body: string): { prose: string; rest: string } {
	const lines = body.split("\n");
	type Kind = "prose" | "owned" | "gap";
	const kinds: Kind[] = lines.map(() => "prose");
	for (const { spec, owns } of GENERATED) {
		const span = findSpan(lines, spec);
		if (!span) continue;
		kinds[span.start] = "owned";
		for (let i = span.start + 1; i < span.end; i++) {
			const line = lines[i];
			if (line.trim() === "") kinds[i] = "gap";
			else if (owns(line)) kinds[i] = "owned";
		}
	}
	const prose = normalizeNotes(
		lines.filter((_, i) => kinds[i] !== "owned").join("\n")
	);
	const rest = tidyLines(
		lines.filter((_, i) => kinds[i] !== "prose")
	).join("\n");
	return { prose, rest: rest ? `${rest}\n` : "" };
}

/**
 * The body with its Notes brought up to date: the `## Notes` section, with
 * an older value — the frontmatter `notes` a page used to keep — folded in
 * ahead of what it holds.
 *
 * A note with no section yet gets one, made from that older value and any
 * prose written into the body before Notes had a home (splitLooseProse).
 * Idempotent, like every migration: once the section exists, only a
 * frontmatter value it doesn't already start with changes anything, and a
 * body with nothing to adopt comes back exactly as it was.
 */
export function adoptNotes(body: string, older: string): string {
	const existing = parseNotesSection(body);
	if (existing !== null) {
		const folded = foldFrontmatterNotes(older, existing);
		return folded === existing ? body : upsertNotesSection(body, folded);
	}
	const { prose, rest } = splitLooseProse(body);
	const folded = foldFrontmatterNotes(older, prose);
	return folded ? upsertNotesSection(rest, folded) : body;
}
