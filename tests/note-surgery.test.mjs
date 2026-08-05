import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createSuite } from "./harness.mjs";
import {
	parseIdeasSection,
	upsertIdeasSection,
	parseQuotesSection,
	upsertQuotesSection,
	splitFrontmatter,
	joinFrontmatter,
} from "./.build/callander.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "fixtures", "notes");

/**
 * Every write to a note is surgery on a file the user also owns. These run
 * the full add → read-back → restore cycle over a set of real files on
 * disk and demand the result be byte-identical to what we started with.
 *
 * This is the shape that caught two bugs the hand-written unit tests
 * missed: a stray "\n" left behind on an empty body, and a trailing
 * newline being invented on a file that had none.
 *
 * Fixtures are checked into the repo, so this never reads a real vault.
 */
export function run() {
	const { eq, result } = createSuite("note surgery (fixtures)");

	const probeIdeas = [
		{ category: "gift", text: 'A "nice" ricer: for mash', done: false },
		{ category: "place", text: "#2 Beacon St", done: true, resurface: "2026-03" },
	];
	const probeQuotes = [{ text: 'He said: "it\'s crispy"', context: "2024 — maybe" }];

	const files = readdirSync(FIXTURES).filter((f) => f.endsWith(".md")).sort();
	eq("fixtures were found", files.length > 0, true);

	for (const file of files) {
		const content = readFileSync(path.join(FIXTURES, file), "utf8");
		const { frontmatter, body } = splitFrontmatter(content);

		// Splitting then rejoining is what every body write does first —
		// any loss here is silent data loss.
		eq(`${file}: split/join is byte-identical`, joinFrontmatter(frontmatter, body), content);

		const existingIdeas = parseIdeasSection(body) ?? [];
		const existingQuotes = parseQuotesSection(body) ?? [];

		// Writing must not disturb frontmatter at all.
		const withIdeas = joinFrontmatter(
			frontmatter,
			upsertIdeasSection(body, [...existingIdeas, ...probeIdeas])
		);
		eq(
			`${file}: frontmatter untouched by an ideas write`,
			splitFrontmatter(withIdeas).frontmatter,
			frontmatter
		);
		// Compared as a multiset: writing regroups ideas under their category
		// headings by design, so the on-disk order is the grouped order
		// rather than the order they were handed over in.
		const sorted = (list) =>
			[...list].map((i) => JSON.stringify(i)).sort();
		eq(
			`${file}: ideas read back intact`,
			sorted(parseIdeasSection(splitFrontmatter(withIdeas).body)),
			sorted([...existingIdeas, ...probeIdeas])
		);

		// The two sections must coexist without eating each other.
		const bothBody = upsertQuotesSection(splitFrontmatter(withIdeas).body, [
			...existingQuotes,
			...probeQuotes,
		]);
		eq(
			`${file}: ideas survive a quotes write`,
			sorted(parseIdeasSection(bothBody)),
			sorted([...existingIdeas, ...probeIdeas])
		);
		eq(`${file}: quotes survive alongside ideas`, parseQuotesSection(bothBody), [
			...existingQuotes,
			...probeQuotes,
		]);

		// Restoring the original lists must return the file byte for byte.
		const restored = joinFrontmatter(
			frontmatter,
			upsertQuotesSection(
				upsertIdeasSection(bothBody, existingIdeas),
				existingQuotes
			)
		);
		eq(`${file}: round trip restores the original file`, restored, content);

		// Saving repeatedly must not drift (no blank-line creep).
		const a = upsertIdeasSection(bothBody, parseIdeasSection(bothBody));
		const b = upsertIdeasSection(a, parseIdeasSection(a));
		eq(`${file}: repeated saves are stable`, a, b);
	}

	// Prose the plugin doesn't own must survive a full cycle.
	const prose = readFileSync(path.join(FIXTURES, "person-with-prose.md"), "utf8");
	const stripped = upsertQuotesSection(splitFrontmatter(prose).body, []);
	eq(
		"unowned heading survives clearing our section",
		stripped.includes("## Some Other Heading"),
		true
	);
	eq(
		"unowned prose survives clearing our section",
		stripped.includes("Prose the plugin does not own"),
		true
	);
	eq(
		"our own in-section prose survives too",
		stripped.includes("Worth remembering how she phrases things."),
		true
	);

	return result();
}
