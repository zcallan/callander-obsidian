import type { Quote } from "@/types";
import {
	readSection,
	upsertSection,
	type SectionSpec,
} from "@/utils/markdownSection";

/**
 * Quotes, stored as markdown in the note body rather than as frontmatter.
 *
 * The point of the exercise: a quote is prose a human wrote for a human, so
 * it should read as prose in any editor — not as `quotes: [{text: ...}]`.
 * Everything here is pure string work, so the round trip (parse →
 * serialize → parse) is provably lossless.
 *
 * On disk:
 *
 *     ## Quotes
 *
 *     - "But is it crispy?" — 2024
 *     - "He said: it's crispy"
 *
 * Text is escaped (see `escapeText`) so a quote containing a `"`, a colon,
 * a backslash or a newline survives intact — those are exactly the
 * characters that make a naive `Key: value` grammar fall over.
 */

const SPEC: SectionSpec = {
	heading: "## Quotes",
	matches: /^##\s+Quotes\s*$/i,
	// Quotes own no subheadings, so any heading safely closes the section.
	closes: /^#{1,6}\s/,
};

/** `- "text"`, straight or curly. A hand-typed quote (or one pasted from a
 * phone keyboard) will often carry the curly pair. */
const BULLET = /^[-*]\s+["“]/;

/** Backslash first, or it would double-escape everything after it. */
function escapeText(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\r?\n/g, "\\n");
}

/** Free text to end-of-line: only the newline and its escape need handling. */
function escapeContext(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n");
}

function unescape(value: string): string {
	let out = "";
	for (let i = 0; i < value.length; i++) {
		const ch = value[i];
		if (ch !== "\\") {
			out += ch;
			continue;
		}
		const next = value[i + 1];
		if (next === "n") out += "\n";
		else if (next === "\\") out += "\\";
		else if (next === '"') out += '"';
		// An unknown escape keeps both characters, so hand-written text
		// like C:\Users survives rather than silently losing a backslash.
		else {
			out += ch;
			continue;
		}
		i++;
	}
	return out;
}

/**
 * One bullet → a quote. Returns null when the line isn't one of ours, which
 * is what keeps a user's own prose inside the section from being eaten.
 */
export function parseQuoteLine(line: string): Quote | null {
	const trimmed = line.trim();
	if (!BULLET.test(trimmed)) return null;

	const openIndex = trimmed.search(/["“]/);
	if (openIndex === -1) return null;

	let text = "";
	let i = openIndex + 1;
	let closed = false;
	for (; i < trimmed.length; i++) {
		const ch = trimmed[i];
		if (ch === "\\") {
			// Keep escapes intact for unescape() to resolve.
			text += ch + (trimmed[i + 1] ?? "");
			i++;
			continue;
		}
		if (ch === '"' || ch === "”") {
			closed = true;
			break;
		}
		text += ch;
	}
	// An unterminated quote is malformed — leave the line alone rather than
	// swallowing the rest of it.
	if (!closed) return null;

	const rest = trimmed.slice(i + 1).trim();
	// Tolerate a hyphen as well as an em/en dash: the file is meant to be
	// hand-editable, and a hyphen is what's on the keyboard.
	const context = rest.replace(/^[—–-]\s*/, "").trim();

	const value = unescape(text).trim();
	if (!value) return null;
	return context
		? { text: value, context: unescape(context) }
		: { text: value };
}

export function serializeQuoteLine(quote: Quote): string {
	const text = `- "${escapeText(quote.text)}"`;
	return quote.context ? `${text} — ${escapeContext(quote.context)}` : text;
}

export function parseQuotesSection(body: string): Quote[] | null {
	const lines = readSection(body, SPEC);
	if (lines === null) return null;
	const quotes: Quote[] = [];
	for (const line of lines) {
		const quote = parseQuoteLine(line);
		if (quote) quotes.push(quote);
	}
	return quotes;
}

export function upsertQuotesSection(body: string, quotes: Quote[]): string {
	return upsertSection(
		body,
		SPEC,
		quotes.map(serializeQuoteLine),
		(line) => parseQuoteLine(line) !== null
	);
}

export { splitFrontmatter, joinFrontmatter } from "@/utils/markdownSection";
