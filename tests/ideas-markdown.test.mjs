import { createSuite } from "./harness.mjs";
import {
	parseIdeaLine,
	serializeIdeaLine,
	parseIdeasSection,
	upsertIdeasSection,
	renderIdeaLines,
	upsertQuotesSection,
	parseQuotesSection,
} from "./.build/callander.mjs";

export function run() {
	const { eq, result } = createSuite("ideas markdown");

	// ---------- line level ----------
	eq("open task", parseIdeaLine("- [ ] Ricer", "gift"), {
		category: "gift",
		text: "Ricer",
		done: false,
	});
	eq("done task", parseIdeaLine("- [x] Ricer", "gift"), {
		category: "gift",
		text: "Ricer",
		done: true,
	});
	eq("capital X counts as done", parseIdeaLine("- [X] Ricer", "gift"), {
		category: "gift",
		text: "Ricer",
		done: true,
	});
	eq("asterisk bullet tolerated", parseIdeaLine("* [ ] Ricer", "place"), {
		category: "place",
		text: "Ricer",
		done: false,
	});
	eq(
		"resurface marker parsed",
		parseIdeaLine("- [ ] Cookbook ⏳ 2026-03", "gift"),
		{ category: "gift", text: "Cookbook", done: false, resurface: "2026-03" }
	);
	eq("full resurface date", parseIdeaLine("- [ ] X ⏳ 2026-03-01", "gift"), {
		category: "gift",
		text: "X",
		done: false,
		resurface: "2026-03-01",
	});
	eq("year-only resurface", parseIdeaLine("- [ ] X ⏳ 2026", "gift"), {
		category: "gift",
		text: "X",
		done: false,
		resurface: "2026",
	});
	eq("non-task bullet ignored", parseIdeaLine("- just a note", "gift"), null);
	eq("prose ignored", parseIdeaLine("Some prose", "gift"), null);
	eq("empty task ignored", parseIdeaLine("- [ ]   ", "gift"), null);
	// The emoji is only a marker when it trails a real date.
	eq(
		"hourglass in text is not a marker",
		parseIdeaLine("- [ ] Buy an ⏳ hourglass", "gift"),
		{ category: "gift", text: "Buy an ⏳ hourglass", done: false }
	);

	// ---------- round trips, including awkward text ----------
	const nasty = [
		{ category: "gift", text: "Ricer for mashed potatoes", done: false },
		{ category: "place", text: "Saltie Girl in Back Bay", done: true },
		{ category: "other", text: "He said: it's crispy", done: false },
		{ category: "gift", text: 'A "nice" mug', done: false },
		{ category: "conversation", text: "Ask about [the thing]", done: false },
		{ category: "activity", text: "🥾 Hike & swim", done: true },
		{ category: "gift", text: "C:\\Users backup drive", done: false },
		{ category: "place", text: "#2 Beacon St", done: false },
		{ category: "gift", text: "Cookbook", done: false, resurface: "2026-03" },
		{ category: "gift", text: "- looks like a bullet", done: false },
	];
	for (const idea of nasty) {
		eq(
			`round-trips: ${idea.text.slice(0, 30)}`,
			parseIdeaLine(serializeIdeaLine(idea), idea.category),
			idea
		);
	}

	// ---------- section level ----------
	eq("no section -> null (not migrated)", parseIdeasSection("# Callan\n\nNotes."), null);
	eq("empty section -> empty list", parseIdeasSection("## Ideas\n"), []);

	const body = `# Riley

Intro prose.

## Ideas

### 🎁 Gifts

- [ ] Ricer for mashed potatoes
- [x] Cookbook ⏳ 2026-03

### 📍 Places

- [ ] Saltie Girl in Back Bay

## Quotes

- "But is it crispy?"`;

	eq("parses all groups", parseIdeasSection(body), [
		{ category: "gift", text: "Ricer for mashed potatoes", done: false },
		{ category: "gift", text: "Cookbook", done: true, resurface: "2026-03" },
		{ category: "place", text: "Saltie Girl in Back Bay", done: false },
	]);
	eq(
		"sibling ## section is not absorbed",
		parseIdeasSection(body).some((i) => i.text.includes("crispy")),
		false
	);

	// ---------- heading tolerance ----------
	eq(
		"heading without emoji works",
		parseIdeasSection("## Ideas\n\n### Gifts\n\n- [ ] X"),
		[{ category: "gift", text: "X", done: false }]
	);
	eq(
		"heading case-insensitive",
		parseIdeasSection("## Ideas\n\n### gifts\n\n- [ ] X"),
		[{ category: "gift", text: "X", done: false }]
	);
	eq(
		"unknown group falls back to other",
		parseIdeasSection("## Ideas\n\n### Wishlist\n\n- [ ] X"),
		[{ category: "other", text: "X", done: false }]
	);
	eq(
		"task before any group heading -> other",
		parseIdeasSection("## Ideas\n\n- [ ] X"),
		[{ category: "other", text: "X", done: false }]
	);

	// ---------- grouping / ordering ----------
	const scrambled = [
		{ category: "place", text: "P1", done: false },
		{ category: "gift", text: "G1", done: false },
		{ category: "place", text: "P2", done: false },
	];
	const rendered = renderIdeaLines(scrambled).join("\n");
	eq(
		"groups are emitted in fixed category order",
		rendered.indexOf("Gifts") < rendered.indexOf("Places"),
		true
	);
	eq(
		"regrouping preserves every idea",
		parseIdeasSection(`## Ideas\n\n${rendered}`).length,
		3
	);
	eq(
		"order within a group is preserved",
		parseIdeasSection(`## Ideas\n\n${rendered}`)
			.filter((i) => i.category === "place")
			.map((i) => i.text),
		["P1", "P2"]
	);

	// ---------- upsert preserves surroundings ----------
	const updated = upsertIdeasSection(body, [
		{ category: "gift", text: "Only one", done: false },
	]);
	eq("keeps content before", updated.includes("Intro prose."), true);
	eq("keeps the Quotes section", updated.includes('- "But is it crispy?"'), true);
	eq("keeps the Quotes heading", updated.includes("## Quotes"), true);
	eq("replaced the ideas", parseIdeasSection(updated), [
		{ category: "gift", text: "Only one", done: false },
	]);
	eq("no duplicate Ideas heading", (updated.match(/## Ideas/g) || []).length, 1);
	eq("stale group heading is gone", updated.includes("Places"), false);

	// ---------- idempotency (no blank-line creep) ----------
	const once = upsertIdeasSection(body, parseIdeasSection(body));
	const twice = upsertIdeasSection(once, parseIdeasSection(once));
	eq("upsert is idempotent", once, twice);
	const thrice = upsertIdeasSection(twice, parseIdeasSection(twice));
	eq("still idempotent on a third pass", twice, thrice);
	eq("...and lossless", parseIdeasSection(thrice), parseIdeasSection(body));

	// ---------- prose inside the section survives ----------
	const withProse = `## Ideas

Ask his sister first.

### 🎁 Gifts

- [ ] X`;
	const proseKept = upsertIdeasSection(withProse, [
		{ category: "gift", text: "Y", done: false },
	]);
	eq("prose inside section kept", proseKept.includes("Ask his sister first."), true);
	eq("ideas still parse alongside prose", parseIdeasSection(proseKept), [
		{ category: "gift", text: "Y", done: false },
	]);

	// ---------- removal ----------
	const removed = upsertIdeasSection(body, []);
	eq("removing all ideas drops the heading", removed.includes("## Ideas"), false);
	eq("...keeps prose before", removed.includes("Intro prose."), true);
	eq("...keeps the Quotes section", removed.includes("## Quotes"), true);
	eq(
		"section with prose is NOT dropped",
		upsertIdeasSection(withProse, []).includes("## Ideas"),
		true
	);

	// ---------- creating from scratch ----------
	const fresh = upsertIdeasSection("# Callan\n\nNotes.", [
		{ category: "gift", text: "Hi", done: false },
	]);
	eq("creates section", parseIdeasSection(fresh), [
		{ category: "gift", text: "Hi", done: false },
	]);
	eq("keeps original body", fresh.includes("Notes."), true);
	eq("empty list on empty body is a no-op", upsertIdeasSection("", []), "");

	// ---------- coexistence with Quotes ----------
	const both = upsertIdeasSection(`## Quotes\n\n- "Hi"\n`, [
		{ category: "gift", text: "G", done: false },
	]);
	eq("Ideas added alongside Quotes", parseIdeasSection(both), [
		{ category: "gift", text: "G", done: false },
	]);
	eq("Quotes untouched by an Ideas write", both.includes('- "Hi"'), true);
	eq("Quotes still parse alongside Ideas", parseQuotesSection(both), [
		{ text: "Hi" },
	]);
	eq(
		"a Quotes write leaves Ideas intact",
		parseIdeasSection(upsertQuotesSection(both, [{ text: "Hi" }, { text: "Two" }])),
		[{ category: "gift", text: "G", done: false }]
	);

	return result();
}
