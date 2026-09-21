import { createSuite } from "./harness.mjs";
import {
	shownByCategory,
	setCategoryShown,
	categoryShown,
} from "./.build/callander.mjs";

/** The calendars' category filter: what shows, and how a tick is stored. */
export function run() {
	const { eq, result } = createSuite("event categories");

	eq("an event with no category always shows", shownByCategory([], ["Patriots"]), true);
	eq("a ticked category shows", shownByCategory(["Patriots"], []), true);
	eq("an unticked one hides", shownByCategory(["Patriots"], ["Patriots"]), false);
	eq("…without regard to case", shownByCategory(["patriots"], ["Patriots"]), false);
	eq(
		"an event in two categories shows while either is ticked",
		shownByCategory(["Patriots", "Sports"], ["Patriots"]),
		true
	);
	eq(
		"…and hides only when both are unticked",
		shownByCategory(["Patriots", "Sports"], ["Patriots", "sports"]),
		false
	);

	eq("unticking adds it to the hidden list", setCategoryShown([], "Patriots", false), ["Patriots"]);
	eq("ticking takes it off, any case", setCategoryShown(["patriots", "Sox"], "Patriots", true), ["Sox"]);
	eq("unticking twice doesn't list it twice", setCategoryShown(["Patriots"], "patriots", false), ["patriots"]);
	eq("a category nobody unticked is ticked", categoryShown(["Sox"], "Patriots"), true);
	eq("…and an unticked one isn't", categoryShown(["Sox"], "sox"), false);

	return result();
}
