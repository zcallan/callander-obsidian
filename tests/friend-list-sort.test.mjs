import { createSuite } from "./harness.mjs";
import { sortFriends } from "./.build/callander.mjs";

/** Every order the All friends list offers, unknowns included. */
export function run() {
	const { eq, result } = createSuite("friend list sort");
	const now = new Date(2026, 7, 5, 12);
	const f = (displayName, { birthday = "", age = null, ctime = 0, mtime = 0, events = [] } = {}) => ({
		displayName, name: displayName, birthday, age, events, file: { stat: { ctime, mtime } },
	});
	const people = () => [
		f("Cy", { birthday: "1990-01-10", age: 36, ctime: 3, mtime: 1, events: [{ date: "2026-02" }] }),
		f("ann", { birthday: "12-25", ctime: 1, mtime: 3, events: [{ date: "2025" }, { date: "junk" }] }),
		f("Bo", { birthday: "2000-08", age: 26, ctime: 2, mtime: 2 }),
		f("Dee", { age: -1, ctime: 4, mtime: 4, events: [{ date: "2026-07-01" }] }),
		f("Eve"),
	];
	const order = (sort) => sortFriends(people(), sort, now).map((p) => p.displayName);

	eq("A-Z, case-insensitive", order("alphabetical"), ["ann", "Bo", "Cy", "Dee", "Eve"]);
	eq("Z-A", order("alphabeticalDesc"), ["Eve", "Dee", "Cy", "Bo", "ann"]);
	eq("newest and oldest added", [order("newest"), order("oldest")], [["Dee", "Cy", "Bo", "ann", "Eve"], ["Eve", "ann", "Bo", "Cy", "Dee"]]);
	eq("last modified", order("modified"), ["Dee", "ann", "Bo", "Cy", "Eve"]);
	eq("next birthday: a month-only one counts from the 1st, so August's has passed; none go last", order("birthday"), ["ann", "Cy", "Bo", "Dee", "Eve"]);
	eq("Jan-Dec, unknowns last", order("birthdayJanDec"), ["Cy", "Bo", "ann", "Dee", "Eve"]);
	eq("Dec-Jan, unknowns still last", order("birthdayDecJan"), ["ann", "Bo", "Cy", "Dee", "Eve"]);
	eq("last event, none last", order("lastEvent"), ["Dee", "Cy", "ann", "Bo", "Eve"]);
	eq("youngest: unknown ages last", order("youngest"), ["Dee", "Bo", "Cy", "ann", "Eve"]);
	eq("eldest: a -1 age ties with unknown, today's sentinel", order("eldest"), ["Cy", "Bo", "ann", "Dee", "Eve"]);
	return result();
}
