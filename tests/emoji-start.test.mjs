import { createSuite } from "./harness.mjs";
import { splitLeadingEmoji, startsWithEmoji } from "./.build/callander.mjs";

/**
 * startsWithEmoji decides whether a plan row gets its type emoji prepended.
 * It's narrower than splitLeadingEmoji — flags and keycaps don't count — and
 * this pins that as it stands, so widening it is a visible, deliberate step.
 */
export function run() {
	const { eq, result } = createSuite("emoji at the start");

	eq("a pictograph, after any space", ["🎉 party", "  ☕ coffee"].map(startsWithEmoji), [true, true]);
	eq("plain text and inner emoji don't", ["party 🎉", "3 cats", ""].map(startsWithEmoji), [false, false, false]);
	eq("a flag or keycap doesn't, today", ["🇯🇵 Tokyo", "1️⃣ first"].map(startsWithEmoji), [false, false]);
	eq("though splitLeadingEmoji does see them", ["🇯🇵 Tokyo", "1️⃣ first"].map((t) => splitLeadingEmoji(t)?.emoji), ["🇯🇵", "1️⃣"]);

	return result();
}
