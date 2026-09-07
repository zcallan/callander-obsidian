import { createSuite } from "./harness.mjs";
import { resolveDashboardOrder } from "./.build/callander.mjs";

/** Stand-ins for the real section ids — the rules don't care what they say. */
const ALL = ["a", "b", "c", "d"];

/**
 * Turning a saved dashboard order back into a renderable list.
 *
 * The saved array is a preference, not a specification: updates add sections
 * and occasionally drop one, and a vault can hold an order written months ago.
 */
export function run() {
	const { eq, result } = createSuite("dashboard order");

	// ---------- the ordinary cases ----------
	eq("never chosen yields the default", resolveDashboardOrder([], ALL), ALL);
	eq(
		"a full saved order is kept as-is",
		resolveDashboardOrder(["d", "c", "b", "a"], ALL),
		["d", "c", "b", "a"]
	);
	eq("nothing at all, nothing out", resolveDashboardOrder([], []), []);

	// ---------- sections that no longer exist ----------
	// They'd render nothing anyway, and carrying them forward means a stale
	// order slowly filling with ghosts.
	eq(
		"an unknown id is dropped",
		resolveDashboardOrder(["b", "gone", "a"], ALL).includes("gone"),
		false
	);
	// c and d were never saved, so they slot in after b — the section they
	// ship behind — even though the saved order put a there. Nobody expressed
	// a view about c, and "after b" is the only view on record.
	eq(
		"and the rest fill in around what was saved",
		resolveDashboardOrder(["b", "gone", "a"], ALL),
		["b", "c", "d", "a"]
	);
	// A hand-edited data.json can repeat one, and a section rendered twice is
	// worse than one rendered in the wrong place.
	eq(
		"a repeated id appears once",
		resolveDashboardOrder(["b", "b", "a"], ALL).filter((x) => x === "b")
			.length,
		1
	);

	// ---------- sections the saved order never saw ----------
	// The rule that matters: a new section lands where it ships, not at the
	// bottom where nobody would find it.
	eq(
		"a new section slots in after its default predecessor",
		resolveDashboardOrder(["a", "b", "d"], ALL),
		["a", "b", "c", "d"]
	);
	// ...and that holds when the saved order has been rearranged, so "c goes
	// after b" survives b being moved.
	eq(
		"which follows the neighbour, not the index",
		resolveDashboardOrder(["d", "b", "a"], ALL),
		["d", "b", "c", "a"]
	);
	// Nothing precedes it that's already placed, so it leads.
	eq(
		"a new first section goes to the front",
		resolveDashboardOrder(["b", "c", "d"], ALL),
		["a", "b", "c", "d"]
	);
	// A run of new sections keeps its own order rather than reversing.
	eq(
		"consecutive new sections stay in their own order",
		resolveDashboardOrder(["a", "d"], ALL),
		["a", "b", "c", "d"]
	);
	// Nothing placed precedes a or b, so they lead; d anchors to c.
	eq(
		"a saved order of one still gains the rest",
		resolveDashboardOrder(["c"], ALL),
		["a", "b", "c", "d"]
	);

	// Everything comes back exactly once, whatever the input.
	const messy = resolveDashboardOrder(["d", "d", "ghost", "b"], ALL);
	eq("every section is present", [...messy].sort(), [...ALL].sort());
	eq("and none is duplicated", new Set(messy).size, messy.length);

	return result();
}
