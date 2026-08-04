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
}

interface Span {
	start: number;
	end: number;
}

function findSpan(lines: string[], spec: SectionSpec): Span | null {
	const start = lines.findIndex((l) => spec.matches.test(l.trim()));
	if (start === -1) return null;
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		if (spec.closes.test(lines[i])) {
			end = i;
			break;
		}
	}
	return { start, end };
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
