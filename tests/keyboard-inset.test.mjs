import { createSuite } from "./harness.mjs";
import { summonsKeyboard } from "./.build/callander.mjs";

/**
 * Which focused fields bring up the phone keyboard. Duck-typed elements,
 * the way the check reads them: tagName, type and closest(".modal").
 */
export function run() {
	const { eq, result } = createSuite("keyboard inset");
	const el = (tagName, type = "", inModal = true) => ({ tagName, type, closest: (sel) => (sel === ".modal" && inModal ? {} : null) });

	eq(
		"a modal's text fields do",
		[el("TEXTAREA"), el("INPUT", "text"), el("INPUT", "number"), el("INPUT", "")].map(summonsKeyboard),
		[true, true, true, true]
	);
	eq(
		"wheel pickers, toggles and anything else don't",
		["date", "month", "time", "checkbox", "radio", "range"].map((t) => summonsKeyboard(el("INPUT", t))).concat(summonsKeyboard(el("SELECT")), summonsKeyboard(el("DIV"))),
		[false, false, false, false, false, false, false, false]
	);
	eq("outside a modal, or nothing focused, doesn't", [summonsKeyboard(el("TEXTAREA", "", false)), summonsKeyboard(null)], [false, false]);
	return result();
}
