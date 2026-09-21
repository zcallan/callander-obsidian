import { createSuite } from "./harness.mjs";
import { toggleWrap, linkSplice, applySplice } from "./.build/callander.mjs";

/**
 * Apply a formatting action to `text` with the selection marked by `[` and
 * `]` (or a lone `|` for a caret), and return the result in the same
 * notation — so each case reads as before → after.
 */
function run_(fn, marked, marker) {
	let start;
	let end;
	let text;
	if (marked.includes("|")) {
		start = end = marked.indexOf("|");
		text = marked.replace("|", "");
	} else {
		start = marked.indexOf("[");
		end = marked.indexOf("]") - 1;
		text = marked.replace("[", "").replace("]", "");
	}
	const splice = marker === undefined ? fn(text, start, end) : fn(text, start, end, marker);
	const out = applySplice(text, splice);
	const { selectFrom: a, selectTo: b } = splice;
	return a === b
		? `${out.slice(0, a)}|${out.slice(a)}`
		: `${out.slice(0, a)}[${out.slice(a, b)}]${out.slice(b)}`;
}
const wrap = (marked, marker) => run_(toggleWrap, marked, marker);
const link = (marked) => run_(linkSplice, marked);

/**
 * The bold / italic / highlight / link the Notes editor applies. Each
 * mirrors what Obsidian's own editor does with the same keys, so moving
 * between the two doesn't ask for different habits.
 */
export function run() {
	const { eq, result } = createSuite("text format");

	// ---------- wrapping ----------
	eq("bold wraps the selection", wrap("a [word] b", "**"), "a **[word]** b");
	eq("italic wraps the selection", wrap("a [word] b", "*"), "a *[word]* b");
	eq("highlight wraps the selection", wrap("a [word] b", "=="), "a ==[word]== b");
	eq("nothing selected inserts a pair", wrap("a | b", "**"), "a **|** b");

	// ---------- toggling back off ----------
	eq("bold toggles off from inside", wrap("a **[word]** b", "**"), "a [word] b");
	eq("bold toggles off when the markers are selected", wrap("a [**word**] b", "**"), "a [word] b");
	eq("an empty pair toggles away", wrap("a **|** b", "**"), "a | b");
	eq("highlight toggles off", wrap("==[word]==", "=="), "[word]");
	// The pair itself selected, with nothing between — the same toggle as
	// pressing it again with the caret inside.
	eq("a selected empty pair toggles away", wrap("a [****] b", "**"), "a | b");

	// ---------- bold and italic share a character ----------
	// Italic on bold text adds italic — it mustn't read bold's inner star as
	// italic and strip it, which would turn bold into italic.
	eq("italic on bold makes bold italic", wrap("**[word]**", "*"), "***[word]***");
	eq("bold on italic makes bold italic", wrap("*[word]*", "**"), "***[word]***");
	eq("bold off bold-italic leaves italic", wrap("***[word]***", "**"), "*[word]*");
	eq("italic off bold-italic leaves bold", wrap("***[word]***", "*"), "**[word]**");
	eq("italic on selected bold makes bold italic", wrap("[**word**]", "*"), "*[**word**]*");
	eq("bold off selected bold-italic leaves italic", wrap("[***word***]", "**"), "[*word*]");
	eq("bold then italic on nothing nests", wrap("**|**", "*"), "***|***");
	// A lone bullet star isn't a marker.
	eq("a list bullet isn't mistaken for italic", wrap("* [item]", "*"), "* *[item]*");

	// ---------- whitespace at the edges ----------
	// Double-clicking a word often takes the space after it, and "**word **"
	// isn't bold in markdown: a closing marker can't follow a space.
	eq("a trailing space is left outside", wrap("a [word ]b", "**"), "a **[word]** b");
	eq("a leading space is left outside", wrap("a[ word] b", "**"), "a **[word]** b");

	// ---------- links ----------
	eq("a selection becomes the link text, caret in the address", link("see [the docs] now"), "see [the docs](|) now");
	eq("nothing selected, caret in the text", link("see | now"), "see [|]() now");
	eq("a selected address goes in the parens, caret in the text", link("[https://example.com]"), "[|](https://example.com)");
	eq("a selected address with a trailing space", link("[https://example.com ]"), "[|](https://example.com) ");

	// ---------- applySplice ----------
	eq(
		"a splice replaces its range",
		applySplice("abcdef", { from: 1, to: 3, insert: "XY", selectFrom: 0, selectTo: 0 }),
		"aXYdef"
	);

	return result();
}
