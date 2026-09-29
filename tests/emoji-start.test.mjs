import { createSuite } from "./harness.mjs";
import { splitLeadingEmoji, startsWithEmoji } from "./.build/callander.mjs";

/**
 * startsWithEmoji decides whether a plan row gets its type emoji prepended.
 * It recognises every shape splitLeadingEmoji does, so a row led by a flag
 * or a keycap isn't given a second emoji (UB-B10).
 */
export function run() {
	const { eq, result } = createSuite("emoji at the start");

	eq("a pictograph, after any space", ["🎉 party", "  ☕ coffee"].map(startsWithEmoji), [true, true]);
	eq("plain text and inner emoji don't", ["party 🎉", "3 cats", ""].map(startsWithEmoji), [false, false, false]);
	eq("a flag or keycap counts too", ["🇯🇵 Tokyo", "1️⃣ first"].map(startsWithEmoji), [true, true]);
	eq("…as splitLeadingEmoji sees them", ["🇯🇵 Tokyo", "1️⃣ first"].map((t) => splitLeadingEmoji(t)?.emoji), ["🇯🇵", "1️⃣"]);

	return result();
}
