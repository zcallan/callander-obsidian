import { createSuite } from "./harness.mjs";
import {
	parseLinkField,
	formatLinkField,
	linkTarget,
	linkLabel,
	asWikilink,
	replaceEntryAt,
} from "./.build/callander.mjs";

/**
 * The fields that name other notes — parents, siblings, friends, related
 * files. Entries are stored as a list so each is a whole-value link that
 * Obsidian will actually index; the edit box shows them on one
 * comma-separated line, so parse and format have to round-trip exactly.
 */
export function run() {
	const { eq, result } = createSuite("link field");

	// ---------- parseLinkField ----------
	eq("a list passes through", parseLinkField(["[[Alice]]", "Bob"]), [
		"[[Alice]]",
		"Bob",
	]);
	eq("blank entries are dropped", parseLinkField(["[[Alice]]", "", "  "]), [
		"[[Alice]]",
	]);
	eq("entries are trimmed", parseLinkField([" [[Alice]] ", " Bob "]), [
		"[[Alice]]",
		"Bob",
	]);
	// A vault written before this existed holds a plain string, and so does
	// anything hand-edited in YAML. Splitting on commas is how the read view
	// has always joined these, so the two stay consistent.
	eq(
		"a legacy string splits on commas",
		parseLinkField("Denise, Bob"),
		["Denise", "Bob"]
	);
	eq("a single string is one entry", parseLinkField("Denise"), ["Denise"]);
	eq("empty string is no entries", parseLinkField(""), []);
	eq("undefined is no entries", parseLinkField(undefined), []);
	eq("null is no entries", parseLinkField(null), []);
	// The case that a naive `.split(",")` gets wrong: a note whose own name
	// contains a comma would be torn into two broken entries.
	eq(
		"a comma inside brackets does not split",
		parseLinkField("[[Smith, John]], Bob"),
		["[[Smith, John]]", "Bob"]
	);
	eq(
		"several bracketed entries with inner commas",
		parseLinkField("[[A, B]], [[C, D]]"),
		["[[A, B]]", "[[C, D]]"]
	);
	eq("a number coerces rather than vanishing", parseLinkField(42), ["42"]);
	// Hand-edited YAML can put a map or a nested list here. Coercing one
	// would write "[object Object]" into the field and save it back on the
	// next edit, so it's dropped instead.
	eq("an object is dropped, not stringified", parseLinkField({ a: 1 }), []);
	eq(
		"an object inside a list is dropped, siblings kept",
		parseLinkField(["[[Alice]]", { a: 1 }, "Bob"]),
		["[[Alice]]", "Bob"]
	);
	eq("a nested list is dropped", parseLinkField([["a"], "Bob"]), ["Bob"]);

	// ---------- formatLinkField ----------
	eq(
		"a list renders as one line",
		formatLinkField(["[[Alice]]", "Bob"]),
		"[[Alice]], Bob"
	);
	eq("empty renders as empty", formatLinkField([]), "");
	// Round-trip: what the box shows, typed straight back, must store the
	// same list — otherwise every open-and-save would drift.
	const cases = [
		["[[Alice]]", "Bob"],
		["[[Smith, John]]", "Bob"],
		["Just text"],
		[],
	];
	eq(
		"format and parse round-trip",
		cases.map((c) => parseLinkField(formatLinkField(c))),
		cases
	);

	// ---------- linkTarget ----------
	eq("a link yields its target", linkTarget("[[Alice]]"), "Alice");
	eq("whitespace around a link is fine", linkTarget("  [[Alice]]  "), "Alice");
	// The alias form points at the left half; the right half is only a label.
	eq("an alias link targets the note", linkTarget("[[Note|shown]]"), "Note");
	eq("plain text is not a link", linkTarget("Bob"), null);
	eq("a half-typed link is not a link", linkTarget("[[Alice"), null);
	eq("empty brackets are not a link", linkTarget("[[]]"), null);
	// Only a whole-value link counts — an embedded one is exactly what
	// Obsidian refuses to index, so it must not render as a link either.
	eq(
		"a link inside a sentence is not a link",
		linkTarget("met at [[Alice]]'s"),
		null
	);

	// ---------- linkLabel ----------
	eq("a link reads as its target", linkLabel("[[Alice]]"), "Alice");
	eq("an alias link reads as the alias", linkLabel("[[Note|shown]]"), "shown");
	eq("plain text reads as itself", linkLabel("Bob"), "Bob");
	eq("plain text is trimmed", linkLabel("  Bob  "), "Bob");

	// ---------- asWikilink ----------
	eq("a bare name gains brackets", asWikilink("Alice"), "[[Alice]]");
	eq("an existing link is left alone", asWikilink("[[Alice]]"), "[[Alice]]");
	eq("an alias link is left alone", asWikilink("[[N|s]]"), "[[N|s]]");
	eq("blank stays blank", asWikilink("   "), "");

	// ---------- replaceEntryAt ----------
	// Picking a suggestion replaces only the entry the caret sits in.
	eq(
		"replaces the only entry",
		replaceEntryAt("Ali", 3, "[[Alice]]"),
		"[[Alice]]"
	);
	eq(
		"replaces the last entry, keeping earlier ones",
		replaceEntryAt("[[Bob]], Ali", 12, "[[Alice]]"),
		"[[Bob]], [[Alice]]"
	);
	eq(
		"replaces the first entry, keeping later ones",
		replaceEntryAt("Ali, [[Bob]]", 3, "[[Alice]]"),
		"[[Alice]], [[Bob]]"
	);
	eq(
		"replaces a middle entry",
		replaceEntryAt("[[A]], mid, [[C]]", 10, "[[Mid]]"),
		"[[A]], [[Mid]], [[C]]"
	);
	// Caret at the very start belongs to the first entry, not the last.
	eq(
		"caret at position zero targets the first entry",
		replaceEntryAt("Ali, [[Bob]]", 0, "[[Alice]]"),
		"[[Alice]], [[Bob]]"
	);
	// Completing into an empty trailing slot after a comma.
	eq(
		"fills an empty trailing entry",
		replaceEntryAt("[[Bob]], ", 9, "[[Alice]]"),
		"[[Bob]], [[Alice]]"
	);

	return result();
}
