/**
 * If the text opens with an emoji (incl. variation selectors, skin tones,
 * ZWJ sequences, flags and keycaps), split it off so it can stand in for
 * the type emoji.
 */
export function splitLeadingEmoji(
	text: string
): { emoji: string; rest: string } | null {
	const trimmed = text.trimStart();
	// Three shapes, in order: a flag (a pair of regional-indicator letters \u2014
	// \uD83C\uDDFA\uD83C\uDDF8 is "U"+"S", which Unicode does NOT class as pictographic); a keycap
	// (starts with an ASCII digit/#/*); or a base pictographic plus any
	// joiners, variation selectors and skin tones that follow it.
	const match = trimmed.match(
		/^(\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic}|[\uFE00-\uFE0F]|[\u{1F3FB}-\u{1F3FF}])*)/u
	);
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
