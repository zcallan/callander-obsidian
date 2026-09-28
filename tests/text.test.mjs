import { createSuite } from "./harness.mjs";
import { capitalize, formatCount, pluralize, truncate } from "./.build/callander.mjs";

export function run() {
	const { eq, result } = createSuite("text");

	eq("only exactly 1 is singular", [0, 1, 2].map((n) => formatCount(n, "event")), ["0 events", "1 event", "2 events"]);
	eq("an irregular plural", [1, 2].map((n) => formatCount(n, "person", "people")), ["1 person", "2 people"]);
	eq("the word alone", [pluralize(1, "stay"), pluralize(3, "stay")], ["stay", "stays"]);

	eq("capitalises the first letter only", [capitalize("run n' chug"), capitalize(""), capitalize("éa")], ["Run n' chug", "", "Éa"]);

	eq("short text is untouched", truncate("abc", 3), "abc");
	eq("long text is cut and marked", truncate("abcd", 3), "abc…");

	return result();
}
