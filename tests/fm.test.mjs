import { createSuite } from "./harness.mjs";
import { asArray, fieldOf, isRecord, toText } from "./.build/callander.mjs";

/**
 * The narrowing helpers every frontmatter reader goes through. Small, but
 * about twenty modules rely on exactly these answers, so they're pinned
 * before anything is built on top of them.
 */
export function run() {
	const { eq, ok, result } = createSuite("frontmatter narrowing");

	// ---------- isRecord ----------
	eq("a plain object is a record", isRecord({ a: 1 }), true);
	eq("…an empty one too", isRecord({}), true);
	eq(
		"an array, null, a string and undefined aren't",
		[isRecord([1]), isRecord(null), isRecord("x"), isRecord(undefined)],
		[false, false, false, false]
	);

	// ---------- fieldOf ----------
	eq("a record's field", fieldOf({ a: 2 }, "a"), 2);
	ok("a missing field is undefined", fieldOf({ a: 2 }, "b") === undefined);
	ok(
		"any field of something that isn't a record is undefined",
		[fieldOf(null, "a"), fieldOf([7], "0"), fieldOf("abc", "length")].every(
			(v) => v === undefined
		)
	);

	// ---------- asArray ----------
	const list = [1, "a"];
	ok("an array comes back as itself, not a copy", asArray(list) === list);
	eq(
		"anything else comes back empty",
		[asArray("a"), asArray({ 0: "a" }), asArray(null), asArray(undefined)],
		[[], [], [], []]
	);

	// ---------- toText ----------
	eq("a string is its own text", toText("hi"), "hi");
	eq(
		"numbers and booleans are spelled out",
		[toText(3), toText(0), toText(true), toText(false)],
		["3", "0", "true", "false"]
	);
	eq(
		"null, undefined, objects and arrays have no text",
		[toText(null), toText(undefined), toText({}), toText(["a"])],
		["", "", "", ""]
	);
	eq("…and a Date is an object like any other", toText(new Date(0)), "");

	return result();
}
