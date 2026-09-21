/**
 * Markdown formatting for a plain textarea — the bold / italic / highlight
 * / link that the Notes editor's toolbar and shortcuts apply.
 *
 * Each returns a splice — which range to replace, with what, and where the
 * selection ends up — rather than the finished text. The editor applies it
 * as one native text edit, which keeps Cmd+Z working; assigning a whole new
 * value to the textarea would wipe its undo history on every keystroke.
 */

export interface TextSplice {
	/** The range of the original text to replace. */
	from: number;
	to: number;
	/** What goes in its place. */
	insert: string;
	/** The selection afterwards, in the new text's coordinates. */
	selectFrom: number;
	selectTo: number;
}

/** The text with a splice applied — what the editor ends up holding. */
export function applySplice(text: string, splice: TextSplice): string {
	return text.slice(0, splice.from) + splice.insert + text.slice(splice.to);
}

/** How many `ch` run back from `index` (exclusive). */
function runBefore(text: string, index: number, ch: string): number {
	let n = 0;
	while (index - n - 1 >= 0 && text[index - n - 1] === ch) n++;
	return n;
}

/** How many `ch` run forward from `index`. */
function runAfter(text: string, index: number, ch: string): number {
	let n = 0;
	while (index + n < text.length && text[index + n] === ch) n++;
	return n;
}

/**
 * Whether a run of stars counts as this marker. `*` and `**` share a
 * character, so a bare "is there a star there" test would read the inner
 * half of `**bold**` as italic and strip it — turning bold into italic
 * instead of adding italic to it. Counting the run settles it: bold needs
 * two or more (`***` is bold and italic both), italic an odd number.
 */
function starRunMatches(run: number, marker: string): boolean {
	return marker === "**" ? run >= 2 : run % 2 === 1;
}

function isStar(marker: string): boolean {
	return marker === "*" || marker === "**";
}

/** The marker sits just outside the selection, both sides. */
function wrappedOutside(
	text: string,
	start: number,
	end: number,
	marker: string
): boolean {
	if (isStar(marker)) {
		return (
			starRunMatches(runBefore(text, start, "*"), marker) &&
			starRunMatches(runAfter(text, end, "*"), marker)
		);
	}
	const n = marker.length;
	return (
		start >= n &&
		text.slice(start - n, start) === marker &&
		text.slice(end, end + n) === marker
	);
}

/** The selection itself begins and ends with the marker. */
function wrappedInside(selected: string, marker: string): boolean {
	if (selected.length < marker.length * 2) return false;
	if (isStar(marker)) {
		return (
			starRunMatches(runAfter(selected, 0, "*"), marker) &&
			starRunMatches(runBefore(selected, selected.length, "*"), marker)
		);
	}
	return selected.startsWith(marker) && selected.endsWith(marker);
}

/**
 * The selection without whitespace at its edges. A double-click often picks
 * up the space after a word, and `**word **` isn't bold in markdown: a
 * closing marker can't follow a space. Nothing but whitespace stays as is.
 */
function trimSelection(
	text: string,
	start: number,
	end: number
): [number, number] {
	let a = start;
	let b = end;
	while (a < b && /\s/.test(text[a])) a++;
	while (b > a && /\s/.test(text[b - 1])) b--;
	return a < b ? [a, b] : [start, end];
}

/**
 * Wrap the selection in `marker`, or unwrap it if it's already wrapped —
 * the same toggle Obsidian's own editor gives Cmd+B.
 *
 * With nothing selected it inserts an empty pair with the caret between,
 * and pressing it again right away takes the pair back out.
 */
export function toggleWrap(
	text: string,
	start: number,
	end: number,
	marker: string
): TextSplice {
	const [a, b] = trimSelection(text, start, end);
	const n = marker.length;
	const selected = text.slice(a, b);

	if (wrappedOutside(text, a, b, marker)) {
		return {
			from: a - n,
			to: b + n,
			insert: selected,
			selectFrom: a - n,
			selectTo: b - n,
		};
	}
	if (wrappedInside(selected, marker)) {
		const inner = selected.slice(n, selected.length - n);
		return {
			from: a,
			to: b,
			insert: inner,
			selectFrom: a,
			selectTo: a + inner.length,
		};
	}
	return {
		from: a,
		to: b,
		insert: `${marker}${selected}${marker}`,
		selectFrom: a + n,
		selectTo: b + n,
	};
}

/**
 * Turn the selection into a markdown link, caret left where you'd type
 * next: in the `()` for the address when the selection is the text, in the
 * `[]` for the text when the selection is itself an address, and in the
 * `[]` with nothing selected.
 */
export function linkSplice(text: string, start: number, end: number): TextSplice {
	const [a, b] = trimSelection(text, start, end);
	const selected = text.slice(a, b);
	if (/^https?:\/\/\S+$/.test(selected)) {
		return {
			from: a,
			to: b,
			insert: `[](${selected})`,
			selectFrom: a + 1,
			selectTo: a + 1,
		};
	}
	const insert = `[${selected}]()`;
	const caret = selected ? a + insert.length - 1 : a + 1;
	return { from: a, to: b, insert, selectFrom: caret, selectTo: caret };
}
