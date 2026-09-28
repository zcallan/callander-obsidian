import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSuite } from "./harness.mjs";
import {
	parseDraftsSection,
	parseIdeasSection,
	parseNotesSection,
	parseQuotesSection,
	splitFrontmatter,
	upsertDraftsSection,
	upsertIdeasSection,
	upsertNotesSection,
	upsertQuotesSection,
} from "./.build/callander.mjs";

/** Each body section a person's note can hold, as the plugin reads and writes it. */
const SECTIONS = [
	["ideas", parseIdeasSection, upsertIdeasSection],
	["quotes", parseQuotesSection, upsertQuotesSection],
	["notes", parseNotesSection, upsertNotesSection],
];

/**
 * The example vault is what the README's screenshots are taken from and
 * what people open to see Callander working, so it has to be written in the
 * shape the plugin actually stores things in. An older shape still loads —
 * but only by firing a migration on first open, and Obsidian would rewrite
 * the files the moment anyone looked.
 *
 * Ideas, quotes, notes and drafts moved out of frontmatter into markdown
 * sections; this fails if the seed (tools/screenshots/make-seed.mjs) or a
 * hand edit puts any of them back.
 */
export function run() {
	const { eq, ok, result } = createSuite("example vault storage");

	const here = path.dirname(fileURLToPath(import.meta.url));
	const friends = path.resolve(here, "..", "examples", "example-vault", "Friends");
	const read = (rel) => readFileSync(path.join(friends, rel), "utf8");
	const LEGACY = /^(ideas|giftIdeas|quotes|notes|drafts)\s*:/m;

	const people = readdirSync(path.join(friends, "People")).filter((f) => f.endsWith(".md"));
	ok("the example vault has people to check", people.length > 0);

	let withSections = 0;
	for (const file of people) {
		const { frontmatter, body } = splitFrontmatter(read(`People/${file}`));
		eq(`${file}: nothing kept in frontmatter that lives in the body`, LEGACY.test(frontmatter ?? ""), false);
		// Whatever sections it has must come through a save unchanged. A line
		// the reader can't make sense of would be dropped from the rewrite,
		// and this is where that shows.
		for (const [kind, parse, upsert] of SECTIONS) {
			const found = parse(body);
			if (found === null) continue;
			withSections++;
			eq(`${file}: its ${kind} come through a save unchanged`, upsert(body, found), body);
		}
	}
	ok("at least some notes actually use the body sections", withSections > 0);

	// The dashboard note: drafts are a checklist, and each one about someone
	// links to a note that exists.
	const dash = splitFrontmatter(read("Dashboard.md"));
	eq("the dashboard keeps no drafts in frontmatter", LEGACY.test(dash.frontmatter ?? ""), false);
	const drafts = parseDraftsSection(dash.body);
	ok("it has a Drafts checklist", drafts !== null && drafts.length > 0);
	eq(
		"…which comes through a save unchanged",
		upsertDraftsSection(dash.body, drafts ?? []),
		dash.body
	);
	for (const draft of drafts ?? []) {
		if (!draft.person) continue;
		const name = draft.person.split("|")[0].trim();
		ok(
			`a draft about ${name} links to a real person`,
			existsSync(path.join(friends, "People", `${name}.md`))
		);
	}

	return result();
}
