import { createSuite } from "./harness.mjs";
import { fieldText, textIfSet, toText } from "./.build/callander.mjs";

/**
 * The two rules for reading a field as text, side by side: toText keeps 0
 * and false, textIfSet reads every falsy value as unset. Merging them would
 * change what a stored 0 means, so each is pinned on the same inputs.
 */
export function run() {
	const { eq, result } = createSuite("frontmatter text");

	const inputs = [0, false, "", null, undefined, [], {}, "a", 7, true];
	eq("toText", inputs.map(toText), ["0", "false", "", "", "", "", "", "a", "7", "true"]);
	eq("textIfSet", inputs.map(textIfSet), ["", "", "", "", "", "", "", "a", "7", "true"]);

	const fm = { name: "Ann", zero: 0, list: ["a"] };
	eq("fieldText reads a key under textIfSet", ["name", "zero", "list", "missing"].map((k) => fieldText(fm, k)), ["Ann", "", "", ""]);
	eq("and nothing from a non-record", [fieldText(null, "name"), fieldText(["Ann"], "0")], ["", ""]);

	return result();
}
