import { createSuite } from "./harness.mjs";
import { summarisePeople } from "./.build/callander.mjs";

const p = (displayName, shortName = "") => ({ displayName, shortName });

/**
 * A roster squeezed onto one line of a dashboard row.
 *
 * The rules: one name reads in full, more than one shortens, and past three
 * the tail becomes a count.
 */
export function run() {
	const { eq, result } = createSuite("people summary");

	eq("nobody reads as nothing", summarisePeople([]), "");
	// One name has room to be itself, and the full name says more.
	eq("one person reads in full", summarisePeople([p("Anders Pennell")]), "Anders Pennell");
	// From two up it's the list you're reading, not any one name in it.
	eq(
		"two shorten",
		summarisePeople([p("Anders Pennell"), p("Rowan Sandberg")]),
		"Anders, Rowan"
	);
	eq(
		"three still fit",
		summarisePeople([p("Anders Pennell"), p("Rowan Sandberg"), p("Bo Zephyr")]),
		"Anders, Rowan, Bo"
	);
	// Four is where the count starts: three named, the rest counted.
	eq(
		"four become three and a count",
		summarisePeople([
			p("Anders Pennell"),
			p("Rowan Sandberg"),
			p("Bo Zephyr"),
			p("Cass Reid"),
		]),
		"Anders, Rowan, Bo, +1 more"
	);
	eq(
		"and so do more",
		summarisePeople([
			p("Anders Pennell"),
			p("Rowan Sandberg"),
			p("Bo Zephyr"),
			p("Cass Reid"),
			p("Dana Fox"),
		]),
		"Anders, Rowan, Bo, +2 more"
	);
	// The cap is the caller's — a modal has more room than a dashboard row.
	eq(
		"a caller can raise the cap",
		summarisePeople(
			[p("A One"), p("B Two"), p("C Three"), p("D Four")],
			4
		),
		"A, B, C, D"
	);

	// A contact's own short name wins over the first-name rule — which is
	// how "Anders Pennell" can read as "Pennell".
	eq(
		"an override is used as given",
		summarisePeople([p("Anders Pennell", "Pennell"), p("Rowan Sandberg")]),
		"Pennell, Rowan"
	);
	eq(
		"and still counts toward the tail",
		summarisePeople([
			p("Anders Pennell", "Pennell"),
			p("Rowan Sandberg"),
			p("Bo Zephyr"),
			p("Cass Reid"),
		]),
		"Pennell, Rowan, Bo, +1 more"
	);
	// Two people sharing a first name disambiguate rather than both reading
	// the same — the whole point of routing through shortenMemberNames.
	eq(
		"a shared first name disambiguates",
		summarisePeople([p("Rowan Sandberg"), p("Rowan Adams")]),
		"Rowan S, Rowan A"
	);
	return result();
}
