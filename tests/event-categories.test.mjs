import { createSuite } from "./harness.mjs";
import {
	shownByCategory,
	setCategoryShown,
	categoryShown,
	categoriesIn,
	filterableCategories,
	hasCategory,
	visibleCategoryCount,
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

	// ---------- the Filters panel's Category row ----------
	eq("an event has a category it's filed under", hasCategory(["Patriots", "NFL"], "NFL"), true);
	eq("...compared without case", hasCategory(["Patriots"], "patriots"), true);
	eq("...and not one it isn't", hasCategory(["Patriots"], "Sox"), false);
	eq("an event with none matches nothing", hasCategory([], "Patriots"), false);
	eq(
		"the roster is each category once, alphabetised",
		categoriesIn([["Sox", "Patriots"], ["Bruins"], []]),
		["Bruins", "Patriots", "Sox"]
	);
	eq(
		"...merging case, under the first spelling seen",
		categoriesIn([["Patriots"], ["patriots", "PATRIOTS"]]),
		["Patriots"]
	);
	eq("no events, no categories", categoriesIn([]), []);

	// A category unticked in the drawer isn't offered to filter by.
	const lists = [["Patriots", "NFL"], ["Sox"], []];
	eq(
		"nothing hidden leaves every category on offer",
		filterableCategories(lists, []),
		["NFL", "Patriots", "Sox"]
	);
	eq(
		"a hidden category drops out of the row",
		filterableCategories(lists, ["Sox"]),
		["NFL", "Patriots"]
	);
	eq(
		"...whatever its case",
		filterableCategories(lists, ["patriots"]),
		["NFL", "Sox"]
	);
	eq(
		"...several at once",
		filterableCategories(lists, ["Sox", "NFL"]),
		["Patriots"]
	);
	eq(
		"ticking it back on restores it",
		filterableCategories(lists, setCategoryShown(["Sox"], "Sox", true)),
		["NFL", "Patriots", "Sox"]
	);
	eq(
		"everything hidden leaves no row at all",
		filterableCategories(lists, ["Patriots", "NFL", "Sox"]),
		[]
	);

	// ---------- folding a long drawer list behind "Show N more" ----------
	eq("five or fewer all show", visibleCategoryCount(5), 5);
	eq("…and so does one", visibleCategoryCount(1), 1);
	eq("six shows four, leaving two behind the disclosure", visibleCategoryCount(6), 4);
	eq("seven shows five, leaving two", visibleCategoryCount(7), 5);
	eq("many shows five", visibleCategoryCount(20), 5);
	eq("nothing to show, nothing shown", visibleCategoryCount(0), 0);

	return result();
}
