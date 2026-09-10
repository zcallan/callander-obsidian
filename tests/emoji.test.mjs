import { createSuite } from "./harness.mjs";
import {
	nameWithoutLeadingEmoji,
	splitLeadingEmoji,
	stripEmoji,
} from "./.build/callander.mjs";

/**
 * What counts as an emoji, and what a caller gets back without them.
 *
 * The shapes that matter are the ones a regex over \p{Extended_Pictographic}
 * alone gets wrong: flags, keycaps, and anything carrying a joiner or a
 * skin tone.
 */
export function run() {
	const { eq, result } = createSuite("emoji");

	// ---------- splitLeadingEmoji ----------
	eq("a plain emoji splits off", splitLeadingEmoji("🍕 Pizza"), {
		emoji: "🍕",
		rest: "Pizza",
	});
	// A flag is a pair of regional indicators, which Unicode does not class
	// as pictographic at all.
	eq("a flag is one emoji, not two letters", splitLeadingEmoji("🇺🇸 Trip")?.emoji, "🇺🇸");
	// Skin tones and joiners belong to the emoji before them.
	eq("a skin tone rides along", splitLeadingEmoji("👍🏽 Yes")?.emoji, "👍🏽");
	eq("and so does a ZWJ sequence", splitLeadingEmoji("👨‍👩‍👧 Family")?.emoji, "👨‍👩‍👧");
	eq("text with no emoji splits nothing", splitLeadingEmoji("Pizza"), null);
	eq("nameWithoutLeadingEmoji drops it", nameWithoutLeadingEmoji("🍕 Pizza"), "Pizza");

	// ---------- stripEmoji ----------
	eq("a leading emoji goes", stripEmoji("🍕 Pizza"), "Pizza");
	// The whole point of the second helper: not just the first one.
	eq("so does one in the middle", stripEmoji("Pizza 🍕 and beer 🍺"), "Pizza and beer");
	eq("a trailing one too", stripEmoji("Pizza 🍕"), "Pizza");
	eq("flags as well", stripEmoji("Trip to 🇺🇸 soon"), "Trip to soon");
	eq("and joined sequences", stripEmoji("👨‍👩‍👧 day out"), "day out");
	// A keycap needs its U+20E3 to match, which is what keeps a bare digit
	// safe — "2 tickets" must not become "tickets".
	eq("a keycap goes", stripEmoji("1️⃣ first"), "first");
	eq("but a plain digit stays", stripEmoji("2 tickets for 4 people"), "2 tickets for 4 people");
	// Runs of spaces left behind collapse; anything else is left alone.
	eq("the gap left behind closes up", stripEmoji("Pizza 🍕 beer"), "Pizza beer");
	eq("newlines survive", stripEmoji("One 🍕\nTwo"), "One\nTwo");
	// A row still needs something to show.
	eq("an emoji-only name comes back whole", stripEmoji("🍕"), "🍕");
	eq("text with none is unchanged", stripEmoji("Just words"), "Just words");
	eq("nothing in, nothing out", stripEmoji(""), "");

	return result();
}
