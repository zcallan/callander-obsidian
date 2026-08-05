import { createSuite } from "./harness.mjs";
import { buildPlanShareText, formatPlanDateRange } from "./.build/callander.mjs";

/**
 * "Copy as text" produces a message you paste to friends, so the failure
 * mode is social rather than technical: a full name where a first name
 * belongs, "Me" in a message someone else reads, or a raw YAML shape
 * leaking through as "[object Object]".
 */
export function run() {
	const { eq, ok, result } = createSuite("plan share text");

	const opts = {
		yourName: "Callan",
		members: ["Riley Sorensen", "Laura Morton"],
		unconfirmed: ["Harry Mayer"],
	};

	// ---------- date ranges ----------
	// Months are always three letters. en-AU's `month: "short"` leaves
	// June/July/Sept longer, so these guard against that leaking back in —
	// a trip must never read "Thu 30 July - Sun 2 Aug".
	eq(
		"collapses to one date when there's no range",
		formatPlanDateRange("2026-07-30", undefined),
		"Thu 30 Jul"
	);
	eq(
		"renders a range",
		formatPlanDateRange("2026-07-30", "2026-08-02"),
		"Thu 30 Jul - Sun 2 Aug"
	);
	eq(
		"June is shortened, not left long",
		formatPlanDateRange("2026-06-01", undefined),
		"Mon 1 Jun"
	);
	eq(
		"September is shortened, not left as Sept",
		formatPlanDateRange("2026-09-01", undefined),
		"Tue 1 Sep"
	);
	eq(
		"a month pair the locale already abbreviates is unchanged",
		formatPlanDateRange("2026-03-30", "2026-04-02"),
		"Mon 30 Mar - Thu 2 Apr"
	);
	eq(
		"same start and end collapses",
		formatPlanDateRange("2026-07-30", "2026-07-30"),
		"Thu 30 Jul"
	);
	eq("no date -> empty", formatPlanDateRange(undefined, undefined), "");

	// ---------- names ----------
	{
		const out = buildPlanShareText(
			{
				name: "Ridge trip",
				date: "2026-07-30",
				items: [
					{
						text: "Lobster roll",
						category: "restaurant",
						date: "2026-07-30",
						time: "19:00",
						people: "Callan, Riley Sorensen, Laura Morton",
					},
				],
			},
			opts
		);
		ok("includes the plan name", out.includes("Ridge trip"));
		ok("per-item people are shortened to first names", out.includes("Callan, Riley, Laura"));
		ok(
			"never says 'Me' — this is for other people to read",
			!/\bMe\b/.test(out)
		);
		ok("your name still appears", out.includes("Callan"));
	}

	// Two people sharing a first name must stay distinguishable, and
	// consistently so across the header and the item lines.
	{
		const out = buildPlanShareText(
			{
				name: "Trip",
				items: [
					{
						text: "Dinner",
						category: "restaurant",
						date: "2026-07-30",
						people: "Riley Sorensen",
					},
				],
			},
			{
				yourName: "Callan",
				members: ["Riley Sorensen", "Riley Baker"],
				unconfirmed: [],
			}
		);
		ok("duplicate first names disambiguate", out.includes("Riley S"));
		ok("...and the other one too", out.includes("Riley B"));
	}

	// ---------- hostile frontmatter shapes ----------
	{
		// `name` and `location` come from user-editable YAML, so they can be
		// any shape at all.
		const out = buildPlanShareText(
			{ name: { unexpected: "map" }, location: ["a", "list"] },
			{ yourName: "", members: [], unconfirmed: [] }
		);
		ok("a map name never renders as [object Object]", !out.includes("[object Object]"));
		ok("a list location never renders as [object Object]", !out.includes("[object Object]"));
	}

	// ---------- undated sections still appear ----------
	{
		const out = buildPlanShareText(
			{
				name: "Trip",
				travel: [{ text: "Ferry", type: "boat", people: "Riley Sorensen" }],
				accommodation: [{ text: "Cabin", stay: "camping", nights: 3 }],
				items: [
					{ text: "Museum", category: "activity", priority: "must" },
					{ text: "Maybe a swim", category: "activity" },
				],
				bring: [{ text: "Towels", done: false }],
			},
			opts
		);
		ok("undated travel is listed", out.includes("Ferry"));
		ok("undated travel people are shortened", out.includes("Riley"));
		ok("undated stays are listed", out.includes("Cabin"));
		ok("must-do ideas are listed", out.includes("Museum"));
		ok("maybes are marked", out.includes("(if there's time)"));
		ok("bring list is included", out.includes("Towels"));
	}

	return result();
}
