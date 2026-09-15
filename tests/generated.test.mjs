import { createSuite } from "./harness.mjs";
import {
	isGenerated,
	generatedField,
	parseIdeaLine,
	serializeIdeaLine,
	parseIdeasSection,
	upsertIdeasSection,
	somedayRowParts,
	ContactOperations,
	PlanOperations,
} from "./.build/callander.mjs";

export function run() {
	const { eq, result } = createSuite("generated flag");

	// ---------- the flag itself ----------
	eq("YAML boolean", isGenerated(true), true);
	eq("hand-typed string", isGenerated("true"), true);
	eq("padded and capitalised", isGenerated(" True "), true);
	eq("false is not generated", isGenerated(false), false);
	eq("the string false is not generated", isGenerated("false"), false);
	eq("absent is not generated", isGenerated(undefined), false);

	eq("field present only when set", generatedField({ generated: true }), {
		generated: true,
	});
	eq("hand-typed entry stays clean", generatedField({ text: "x" }), {});

	// ---------- idea lines ----------
	eq("marker parsed", parseIdeaLine("- [ ] Tea caddy 🤖", "gift"), {
		category: "gift",
		text: "Tea caddy",
		done: false,
		generated: true,
	});
	eq("no marker, no flag", parseIdeaLine("- [ ] Tea caddy", "gift"), {
		category: "gift",
		text: "Tea caddy",
		done: false,
	});
	// Both trailing markers, in either order — the writer emits 🤖 first, but
	// a hand- or Claude-typed line may not.
	eq(
		"marker before resurface",
		parseIdeaLine("- [x] Cookbook 🤖 ⏳ 2026-03", "gift"),
		{
			category: "gift",
			text: "Cookbook",
			done: true,
			resurface: "2026-03",
			generated: true,
		}
	);
	eq(
		"marker after resurface",
		parseIdeaLine("- [ ] Cookbook ⏳ 2026-03 🤖", "gift"),
		{
			category: "gift",
			text: "Cookbook",
			done: false,
			resurface: "2026-03",
			generated: true,
		}
	);
	// Only a trailing robot is the marker, the same rule the hourglass follows.
	eq(
		"robot inside the text is not a marker",
		parseIdeaLine("- [ ] A 🤖 toy for Sam", "gift"),
		{ category: "gift", text: "A 🤖 toy for Sam", done: false }
	);

	eq(
		"serialized with the marker before the date",
		serializeIdeaLine({
			category: "gift",
			text: "Cookbook",
			done: false,
			resurface: "2026-03",
			generated: true,
		}),
		"- [ ] Cookbook 🤖 ⏳ 2026-03"
	);
	eq(
		"hand-typed idea serializes unchanged",
		serializeIdeaLine({ category: "gift", text: "Cookbook", done: false }),
		"- [ ] Cookbook"
	);

	// ---------- round trip through a whole section ----------
	const ideas = [
		{ category: "gift", text: "Tea caddy", done: false, generated: true },
		{ category: "gift", text: "Secateurs", done: false },
		{
			category: "place",
			text: "Saltie Girl",
			done: true,
			resurface: "2026-03",
			generated: true,
		},
	];
	eq(
		"section round-trips the flag",
		parseIdeasSection(upsertIdeasSection("", ideas)),
		ideas
	);

	// ---------- entries rebuilt from raw YAML ----------
	eq(
		"draft keeps the flag",
		ContactOperations.draftsOf({
			drafts: [
				{ text: "Ask about the allotment", created: "2026-09-15", generated: true },
				{ text: "Typed by hand", created: "2026-09-15" },
			],
		}),
		[
			{
				text: "Ask about the allotment",
				created: "2026-09-15",
				generated: true,
			},
			{ text: "Typed by hand", created: "2026-09-15" },
		]
	);
	eq(
		"plan quick idea keeps the flag",
		PlanOperations.quickIdeasOf({
			quickIdeas: [{ text: "Red's Eats", type: "restaurant", generated: true }],
		})[0].generated,
		true
	);
	eq(
		"hand-typed quick idea has no flag",
		PlanOperations.quickIdeasOf({ quickIdeas: [{ text: "Red's Eats" }] })[0]
			.generated,
		undefined
	);

	// ---------- someday rows carry it to the badge ----------
	const row = {
		name: "Kayak the Charles",
		date: "",
		seasons: [],
		days: [],
		fromDate: "",
		untilDate: "",
		types: [],
	};
	eq(
		"row parts carry the flag",
		somedayRowParts({ ...row, generated: true }, new Date("2026-09-15"))
			.generated,
		true
	);
	eq(
		"hand-typed row parts stay clean",
		somedayRowParts(row, new Date("2026-09-15")).generated,
		undefined
	);

	return result();
}
