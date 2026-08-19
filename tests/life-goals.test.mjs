import { createSuite } from "./harness.mjs";
import { parseLifeGoals, groupLifeGoals } from "./.build/callander.mjs";

/**
 * Life goals: things a friend wants to do someday. Completed ones stay in
 * the list rather than being deleted, so the parsing has to keep the flag
 * and the grouping has to keep each row pointing at its stored entry.
 */
export function run() {
	const { eq, result } = createSuite("life goals");

	// ---------- parseLifeGoals ----------
	eq("a full entry round-trips", parseLifeGoals([
		{ text: "Learn Spanish", notes: "Started Duolingo", done: true, completed: "2026-03-01" },
	]), [
		{ text: "Learn Spanish", notes: "Started Duolingo", done: true, completed: "2026-03-01" },
	]);
	// The shape someone hand-writing YAML reaches for first.
	eq("a bare string is a goal", parseLifeGoals(["Run a marathon"]), [
		{ text: "Run a marathon" },
	]);
	eq("text is trimmed", parseLifeGoals(["  Run a marathon  "]), [
		{ text: "Run a marathon" },
	]);
	eq("blank entries are dropped", parseLifeGoals(["", "  ", "Real"]), [
		{ text: "Real" },
	]);
	eq("an entry with no text is dropped", parseLifeGoals([{ notes: "orphan" }]), []);
	eq("absent is empty", parseLifeGoals(undefined), []);
	eq("a non-list is empty", parseLifeGoals("nope"), []);
	// Optional keys stay absent rather than becoming empty strings, so the
	// YAML doesn't fill with `notes: ""` on every save.
	eq("empty notes are omitted", parseLifeGoals([{ text: "A", notes: "  " }]), [
		{ text: "A" },
	]);
	eq("not-done omits the flag", parseLifeGoals([{ text: "A" }]), [{ text: "A" }]);
	eq(
		"done without a date is still done",
		parseLifeGoals([{ text: "A", done: true }]),
		[{ text: "A", done: true }]
	);
	// A completion date implies done — the two are only ever written
	// together, so a file with just the date shouldn't read as still open.
	eq(
		"a completion date implies done",
		parseLifeGoals([{ text: "A", completed: "2026-01-02" }]),
		[{ text: "A", done: true, completed: "2026-01-02" }]
	);
	eq(
		"done: false is not done",
		parseLifeGoals([{ text: "A", done: false }]),
		[{ text: "A" }]
	);

	// ---------- groupLifeGoals ----------
	const goals = parseLifeGoals([
		{ text: "Open one" },
		{ text: "Done one", done: true },
		{ text: "Open two" },
		{ text: "Done two", done: true, completed: "2026-02-02" },
	]);
	const { open, completed } = groupLifeGoals(goals);
	eq("open goals are grouped", open.map((o) => o.goal.text), [
		"Open one",
		"Open two",
	]);
	eq("completed goals are grouped", completed.map((c) => c.goal.text), [
		"Done one",
		"Done two",
	]);
	// The index is what routes an edit back to the one stored entry — a row
	// in the completed group must not edit the wrong goal.
	eq("open rows keep their stored index", open.map((o) => o.index), [0, 2]);
	eq("completed rows keep their stored index", completed.map((c) => c.index), [1, 3]);
	// Stored order is the only order anyone chose; neither group resorts.
	eq(
		"order within a group is the stored order",
		groupLifeGoals(parseLifeGoals(["B", "A", "C"])).open.map((o) => o.goal.text),
		["B", "A", "C"]
	);
	eq("nothing in, nothing out", groupLifeGoals([]), { open: [], completed: [] });

	return result();
}
