/**
 * Reading and rewriting one `## Section` of a note's body.
 *
 * Shared by every field that lives in markdown rather than frontmatter, so
 * the file surgery — preserving frontmatter, preserving the user's own
 * prose, preserving trailing whitespace — is written and tested once.
 */

export interface SectionSpec {
	/** The heading to write when creating the section, e.g. "## Quotes". */
	heading: string;
	/** Matches the section's own heading line. */
	matches: RegExp;
	/**
	 * A heading that ends the section. Sections with no sub-structure use
	 * any heading; ones that own `###` subheadings (Ideas) must only be
	 * closed by `#`/`##`, or their own groups would truncate them.
	 */
	closes: RegExp;
	/**
	 * A heading the section always sits above. It's only looked for before
	 * that heading, and added just before it when missing. The generated
	 * sections all sit above `## Notes`, which runs to the end of the file:
	 * anything after it is the person's own writing, even a line that
	 * happens to read `## Ideas`.
	 */
	above?: RegExp;
}

/** The Notes heading — see notesMarkdown. Here so every section can sit
 * above it without importing Notes. */
export const NOTES_HEADING = /^##\s+Notes\s*$/i;

export interface Span {
	start: number;
	end: number;
}

/**
 * Where a section sits: its heading line, and the line that ends it (or the
 * end of the note). Exported so anything else reading around these
 * sections — Notes, which is everything *outside* them — agrees with the
 * writers on exactly where each one starts and stops.
 */
export function findSpan(lines: string[], spec: SectionSpec): Span | null {
	const limit = limitOf(lines, spec);
	const start = lines
		.slice(0, limit)
		.findIndex((l) => spec.matches.test(l.trim()));
	if (start === -1) return null;
	let end = limit;
	for (let i = start + 1; i < limit; i++) {
		if (spec.closes.test(lines[i])) {
			end = i;
			break;
		}
	}
	return { start, end };
}

/** Where the section's territory ends: its `above` heading, or the end. */
function limitOf(lines: string[], spec: SectionSpec): number {
	const above = spec.above;
	if (!above) return lines.length;
	const at = lines.findIndex((l) => above.test(l.trim()));
	return at === -1 ? lines.length : at;
}

/**
 * The section's inner lines, or null when the note has no such section —
 * the signal that this note hasn't been migrated and its frontmatter is
 * still the source of truth.
 */
export function readSection(
	body: string,
	spec: SectionSpec
): string[] | null {
	const lines = body.split("\n");
	const span = findSpan(lines, spec);
	if (!span) return null;
	return lines.slice(span.start + 1, span.end);
}

/**
 * Replace the section's generated content, touching as little else as
 * possible. Anything outside the section is untouched, and non-blank lines
 * inside it that we don't own (prose the user wrote) are kept — before the
 * generated block if they came first, after it otherwise.
 *
 * Blank lines are never preserved: the generated block brings its own
 * spacing, and keeping the old ones would make every save add another.
 *
 * Empty content removes the section entirely — the body-side equivalent of
 * deleting a frontmatter key — unless the user left prose in it.
 */
export function upsertSection(
	body: string,
	spec: SectionSpec,
	content: string[],
	owns: (line: string) => boolean
): string {
	const result = upsertCore(body, spec, content, owns);
	// Preserve the note's trailing-newline state, so writing a value and
	// removing it again returns the file byte for byte rather than leaving
	// a spurious whitespace diff on every note we touch.
	if (result === "" || body === "") return result;
	return body.endsWith("\n")
		? result.endsWith("\n")
			? result
			: `${result}\n`
		: result.replace(/\n+$/, "");
}

function upsertCore(
	body: string,
	spec: SectionSpec,
	content: string[],
	owns: (line: string) => boolean
): string {
	const lines = body.split("\n");
	const span = findSpan(lines, spec);

	if (!span) {
		if (content.length === 0) return body;
		const limit = limitOf(lines, spec);
		if (limit < lines.length) {
			const before = lines.slice(0, limit);
			while (before.length > 0 && before[before.length - 1].trim() === "") {
				before.pop();
			}
			return [
				...(before.length ? [...before, ""] : []),
				spec.heading,
				"",
				...content,
				"",
				...lines.slice(limit),
			].join("\n");
		}
		const trimmed = body.replace(/\s+$/, "");
		const prefix = trimmed ? `${trimmed}\n\n` : "";
		return `${prefix}${spec.heading}\n\n${content.join("\n")}\n`;
	}

	const inner = lines.slice(span.start + 1, span.end);
	const keptBefore: string[] = [];
	const keptAfter: string[] = [];
	let seenOwned = false;
	for (const line of inner) {
		if (owns(line)) {
			seenOwned = true;
			continue;
		}
		// Blank lines are structural, not content — dropped so they can't
		// accumulate one per save.
		if (line.trim() === "") continue;
		(seenOwned ? keptAfter : keptBefore).push(line);
	}

	const hasProse = keptBefore.length > 0 || keptAfter.length > 0;
	if (content.length === 0 && !hasProse) {
		const before = lines.slice(0, span.start);
		const after = lines.slice(span.end);
		while (before.length > 0 && before[before.length - 1].trim() === "") {
			before.pop();
		}
		if (after.length === 0) {
			return before.length > 0 ? `${before.join("\n")}\n` : "";
		}
		if (before.length === 0) return after.join("\n");
		return [...before, "", ...after].join("\n").replace(/\n{3,}/g, "\n\n");
	}

	const rebuilt = [
		lines[span.start],
		"",
		...(keptBefore.length ? [...keptBefore, ""] : []),
		...content,
		...(keptAfter.length ? ["", ...keptAfter] : []),
	];

	// Blank lines inside the section were dropped above so they can't
	// accumulate — but the one separating us from whatever follows is
	// structural, so put it back. Without this, every save would creep the
	// next heading one line closer until it sat against our last bullet.
	if (span.end < lines.length) rebuilt.push("");

	return [...lines.slice(0, span.start), ...rebuilt, ...lines.slice(span.end)]
		.join("\n")
		.replace(/\n{3,}/g, "\n\n");
}

/**
 * Frontmatter and body, split apart. Only a fence that opens on the very
 * first line counts — a `---` further down is a horizontal rule, and
 * mistaking one for the other would corrupt the note.
 */
export function splitFrontmatter(content: string): {
	frontmatter: string | null;
	body: string;
} {
	// One kind of line break before anything looks: a note written on
	// Windows, or by another editor, can use CRLF, and read as having no
	// frontmatter at all. What's joined back after is LF throughout.
	if (content.includes("\r")) content = content.replace(/\r\n?/g, "\n");
	if (!content.startsWith("---\n") && content !== "---") {
		return { frontmatter: null, body: content };
	}
	const end = content.indexOf("\n---", 3);
	if (end === -1) return { frontmatter: null, body: content };
	const afterFence = content.indexOf("\n", end + 1);
	return {
		frontmatter: content.slice(4, end),
		body: afterFence === -1 ? "" : content.slice(afterFence + 1),
	};
}

/** Put a body back together with its original frontmatter block. */
export function joinFrontmatter(
	frontmatter: string | null,
	body: string
): string {
	if (frontmatter === null) return body;
	return `---\n${frontmatter}\n---\n${body}`;
}
