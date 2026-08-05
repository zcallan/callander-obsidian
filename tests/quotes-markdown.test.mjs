import { createSuite } from "./harness.mjs";
import {
	parseQuoteLine,
	serializeQuoteLine,
	parseQuotesSection,
	upsertQuotesSection,
	splitFrontmatter,
	joinFrontmatter,
} from "./.build/callander.mjs";

export function run() {
	const { eq, result } = createSuite("quotes markdown");

	// ---------- line level ----------
	eq("plain quote, no context", parseQuoteLine('- "But is it crispy?"'), {
		text: "But is it crispy?",
	});
	eq(
		"quote with context",
		parseQuoteLine('- "But is it crispy?" — 2024'),
		{ text: "But is it crispy?", context: "2024" }
	);
	eq(
		"hyphen separator is tolerated (hand-typed)",
		parseQuoteLine('- "Nice" - at the beach'),
		{ text: "Nice", context: "at the beach" }
	);
	eq("curly quotes are tolerated", parseQuoteLine('- “Nice” — 2024'), {
		text: "Nice",
		context: "2024",
	});
	eq("asterisk bullet is tolerated", parseQuoteLine('* "Nice"'), {
		text: "Nice",
	});
	eq("non-quote prose is ignored", parseQuoteLine("Just some notes"), null);
	eq("empty line ignored", parseQuoteLine(""), null);
	eq("unterminated quote is left alone", parseQuoteLine('- "no closing'), null);
	eq("empty quote text ignored", parseQuoteLine('- ""'), null);

	// ---------- the cases that break a naive Key: value grammar ----------
	const nasty = [
		{ text: "He said: it's crispy" },
		{ text: 'She said "wow" loudly' },
		{ text: "back\\slash and C:\\Users" },
		{ text: "line one\nline two" },
		{ text: "🍽️ Cooked for Obama & shook his hand" },
		{ text: "- looks like a bullet" },
		{ text: "## looks like a heading" },
		{ text: 'trailing quote mark "' },
		{ text: "Weird", context: "he said: 2024 — maybe" },
		{ text: "181 Beacon St #2, Boston" },
	];
	for (const q of nasty) {
		eq(
			`round-trips: ${JSON.stringify(q.text).slice(0, 34)}`,
			parseQuoteLine(serializeQuoteLine(q)),
			q
		);
	}

	// ---------- section level ----------
	eq(
		"no section -> null (not yet migrated)",
		parseQuotesSection("# Callan\n\nSome notes."),
		null
	);
	eq(
		"empty section -> empty list (migrated, no quotes)",
		parseQuotesSection("## Quotes\n"),
		[]
	);

	const body = `# Riley Sorensen

Some intro prose.

## Quotes

- "But is it crispy?" — 2024
- "He said: it's crispy"

## Other Section

Keep me.`;
	eq("parses both quotes", parseQuotesSection(body), [
		{ text: "But is it crispy?", context: "2024" },
		{ text: "He said: it's crispy" },
	]);

	// ---------- upsert preserves surrounding content ----------
	const updated = upsertQuotesSection(body, [
		{ text: "New one", context: "2026" },
	]);
	eq("upsert keeps content before", updated.includes("Some intro prose."), true);
	eq("upsert keeps the later section", updated.includes("## Other Section"), true);
	eq("upsert keeps that section's text", updated.includes("Keep me."), true);
	eq("upsert replaced the bullets", parseQuotesSection(updated), [
		{ text: "New one", context: "2026" },
	]);
	eq("no duplicate heading", (updated.match(/## Quotes/g) || []).length, 1);

	// ---------- prose inside the section survives ----------
	const withProse = `## Quotes

Context for all of these.

- "One"
- "Two"`;
	const proseKept = upsertQuotesSection(withProse, [{ text: "One" }]);
	eq(
		"prose inside section is kept",
		proseKept.includes("Context for all of these."),
		true
	);
	eq("bullets still parse after prose", parseQuotesSection(proseKept), [
		{ text: "One" },
	]);

	// ---------- creating the section when absent ----------
	const fresh = upsertQuotesSection("# Callan\n\nNotes.", [{ text: "Hi" }]);
	eq("creates section at end", parseQuotesSection(fresh), [{ text: "Hi" }]);
	eq("keeps original body when creating", fresh.includes("Notes."), true);
	eq("empty list on empty body is a no-op", upsertQuotesSection("", []), "");
	eq(
		"creates section on empty body",
		parseQuotesSection(upsertQuotesSection("", [{ text: "Hi" }])),
		[{ text: "Hi" }]
	);

	// ---------- removing the last quote ----------
	const removed = upsertQuotesSection(body, []);
	eq("removing all quotes drops the heading", removed.includes("## Quotes"), false);
	eq("...but keeps content before", removed.includes("Some intro prose."), true);
	eq("...and keeps the section after", removed.includes("## Other Section"), true);
	eq("...and its text", removed.includes("Keep me."), true);

	const removedWithProse = upsertQuotesSection(withProse, []);
	eq(
		"section with prose is NOT dropped",
		removedWithProse.includes("## Quotes"),
		true
	);
	eq(
		"...and the prose survives",
		removedWithProse.includes("Context for all of these."),
		true
	);

	// ---------- idempotency ----------
	const once = upsertQuotesSection(body, parseQuotesSection(body));
	const twice = upsertQuotesSection(once, parseQuotesSection(once));
	eq("upsert is idempotent", once, twice);
	eq("...and lossless", parseQuotesSection(twice), parseQuotesSection(body));

	// ---------- frontmatter split ----------
	const file = `---\nname: Riley\nquotes:\n  - text: Hi\n---\n# Riley\n\nBody here.`;
	const split = splitFrontmatter(file);
	eq("frontmatter extracted", split.frontmatter, "name: Riley\nquotes:\n  - text: Hi");
	eq("body extracted", split.body, "# Riley\n\nBody here.");
	eq("rejoins losslessly", joinFrontmatter(split.frontmatter, split.body), file);

	const noFm = splitFrontmatter("# Riley\n\nNo frontmatter.");
	eq("no frontmatter -> null", noFm.frontmatter, null);
	eq("no frontmatter -> whole content is body", noFm.body, "# Riley\n\nNo frontmatter.");

	// A `---` further down is a horizontal rule, not frontmatter.
	const hr = splitFrontmatter("# Riley\n\n---\n\nAfter the rule.");
	eq("mid-file --- is not treated as frontmatter", hr.frontmatter, null);
	eq(
		"...and the rule is preserved in the body",
		hr.body,
		"# Riley\n\n---\n\nAfter the rule."
	);

	// ---------- full-file round trip ----------
	const realish = `---\nname: Riley Sorensen\nbirthday: 2000-03-28\n---\n`;
	const s = splitFrontmatter(realish);
	const rebuilt = joinFrontmatter(
		s.frontmatter,
		upsertQuotesSection(s.body, [
			{ text: "He said: it's crispy", context: "2024" },
		])
	);
	eq(
		"frontmatter survives a body write",
		splitFrontmatter(rebuilt).frontmatter,
		"name: Riley Sorensen\nbirthday: 2000-03-28"
	);
	eq(
		"quote readable from rebuilt file",
		parseQuotesSection(splitFrontmatter(rebuilt).body),
		[{ text: "He said: it's crispy", context: "2024" }]
	);

	return result();
}
