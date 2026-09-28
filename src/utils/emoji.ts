/**
 * What counts as one emoji, in three shapes, in order: a flag (a pair of
 * regional-indicator letters — 🇺🇸 is U+1F1FA U+1F1F8, "U"+"S", which
 * Unicode does NOT class as pictographic); a keycap (an ASCII digit, # or *,
 * then U+20E3); or a pictographic base plus any joiners, variation
 * selectors and skin tones that follow it. Written once so every reader
 * below agrees on it.
 */
const EMOJI_SOURCE = String.raw`\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic}|[\uFE00-\uFE0F]|[\u{1F3FB}-\u{1F3FF}])*`;
const LEADING_EMOJI = new RegExp(`^(${EMOJI_SOURCE})`, "u");
const ANY_EMOJI = new RegExp(EMOJI_SOURCE, "gu");

/**
 * If the text opens with an emoji (incl. variation selectors, skin tones,
 * ZWJ sequences, flags and keycaps), split it off so it can stand in for
 * the type emoji.
 */
export function splitLeadingEmoji(
	text: string
): { emoji: string; rest: string } | null {
	const trimmed = text.trimStart();
	const match = trimmed.match(LEADING_EMOJI);
	if (!match) return null;
	const emoji = match[1];
	return { emoji, rest: trimmed.slice(emoji.length).trimStart() };
}

/**
 * The text with any leading emoji removed — what a name should be
 * alphabetised on, since the emoji is decoration the reader looks past.
 * Falls back to the trimmed original when there's no emoji, and to the
 * original when stripping would leave nothing (an emoji-only name still
 * needs something to sort by).
 */
export function nameWithoutLeadingEmoji(text: string): string {
	const lead = splitLeadingEmoji(text);
	if (!lead) return text.trim();
	return lead.rest || text.trim();
}

/**
 * Every emoji removed, not just a leading one.
 *
 * Uses the same EMOJI_SOURCE as splitLeadingEmoji, so the two can't
 * disagree about what an emoji is. The keycap needs its U+20E3 to match,
 * which is what keeps a bare digit safe.
 *
 * Runs of spaces left behind are collapsed, and a space stranded at the end
 * of a line goes with them — both are artifacts of the removal. Newlines
 * survive, and so does a line's own leading indent, which may be the
 * caller's. Text that is nothing but emoji comes back
 * unchanged rather than empty — the same fallback nameWithoutLeadingEmoji
 * makes, and for the same reason: a row still needs something to show.
 */
export function stripEmoji(text: string): string {
	const stripped = text
		.replace(ANY_EMOJI, "")
		.replace(/ {2,}/g, " ")
		// The space an emoji leaves behind at a line's end.
		.replace(/ +\n/g, "\n")
		.trim();
	return stripped || text.trim();
}

/**
 * True when the text leads with a pictograph. Narrower than
 * splitLeadingEmoji — a flag or keycap doesn't count — which is how it has
 * always behaved; widening it would change which rows get a type emoji.
 */
export function startsWithEmoji(text: string): boolean {
	return /^\p{Extended_Pictographic}/u.test(text.trim());
}
