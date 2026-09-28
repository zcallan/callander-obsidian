import { createSuite } from "./harness.mjs";
import {
	notesFromBody,
	parseNotesSection,
	upsertNotesSection,
	adoptNotes,
	splitLooseProse,
	normalizeNotes,
	joinNotes,
	foldFrontmatterNotes,
	parseIdeasSection,
	upsertIdeasSection,
	parseQuotesSection,
	upsertQuotesSection,
	PAGE_DRAFTS_SECTION,
	parseDraftsSection,
	upsertDraftsSection,
	rescueDraftsFromNotes,
} from "./.build/callander.mjs";

/** The three generated sections, exactly as their writers lay them out. */
const IDEAS = "## Ideas\n\n### 🎁 Gift\n\n- [ ] Tea caddy\n\n### 🥾 Activity\n\n- [x] Climbing";
const QUOTES = '## Quotes\n\n- "But is it crispy?" — 2024';
const EVENTS = "## Events\n\n- [[2026-09-11 Dinner]]\n- [[2026-10-02 Gig]]";
const GENERATED = `${IDEAS}\n\n${QUOTES}\n\n${EVENTS}\n`;

/**
 * A page's Notes live under `## Notes`, the last section of its body. These
 * pin down where a save puts them, that headings typed inside them stay
 * theirs, how prose from before the section existed is adopted — and, most
 * of all, that Notes and the generated sections can never swallow each other.
 */
export function run() {
	const { eq, ok, result } = createSuite("notes markdown");

	// ---------- reading ----------
	eq("an empty body has no section", parseNotesSection(""), null);
	eq("…and shows no notes", notesFromBody(""), "");
	eq(
		"prose outside the section isn't notes",
		parseNotesSection(`Stray prose.\n\n${GENERATED}`),
		null
	);
	eq(
		"the section's content, edges trimmed",
		notesFromBody(`${GENERATED}\n## Notes\n\nMet at uni.\n\nLoves **climbing**.\n`),
		"Met at uni.\n\nLoves **climbing**."
	);
	eq(
		"an empty section is present but blank",
		parseNotesSection(`${GENERATED}\n## Notes\n`),
		""
	);
	eq(
		"headings inside the notes stay part of them",
		notesFromBody("## Notes\n\nTop.\n\n## Background\n\nGrew up in Perth.\n\n# Big\n\nEnd.\n"),
		"Top.\n\n## Background\n\nGrew up in Perth.\n\n# Big\n\nEnd."
	);
	eq(
		"runs of blank lines fold to one",
		notesFromBody("## Notes\n\nOne.\n\n\n\nTwo.\n"),
		"One.\n\nTwo."
	);
	eq(
		"blank lines inside a code fence are kept",
		notesFromBody("## Notes\n\n```\na\n\n\nb\n```\n"),
		"```\na\n\n\nb\n```"
	);
	eq(
		"indentation and trailing double spaces are kept",
		notesFromBody("## Notes\n\n    indented code\nline  \nnext\n"),
		"    indented code\nline  \nnext"
	);

	// ---------- the generated sections stay above Notes ----------
	{
		const body = `${EVENTS}\n\n## Notes\n\n## Ideas\n\nfor the party\n\n## Quotes\n\n- "not a real quote" — 2020\n`;
		eq(
			"an `## Ideas` typed in the notes isn't the Ideas section",
			parseIdeasSection(body),
			null
		);
		eq(
			"nor is an `## Quotes` typed there the Quotes section",
			parseQuotesSection(body),
			null
		);
		const withIdeas = upsertIdeasSection(body, [
			{ category: "gift", text: "Tea caddy", done: false },
		]);
		ok(
			"a new Ideas section is added above Notes, not after it",
			withIdeas.indexOf("## Ideas\n\n### ") < withIdeas.indexOf("## Notes")
		);
		eq(
			"…and the notes, typed heading and all, are untouched",
			notesFromBody(withIdeas),
			notesFromBody(body)
		);
		eq(
			"…and exactly one blank line on each side",
			withIdeas.includes("\n\n\n"),
			false
		);
		const withQuotes = upsertQuotesSection(body, [
			{ text: "But is it crispy?", context: "2024" },
		]);
		ok(
			"a new Quotes section is added above Notes too",
			withQuotes.indexOf("But is it crispy") < withQuotes.indexOf("## Notes")
		);
	}
	{
		const body = `${QUOTES}\n\n## Notes\n\nNotes.\n`;
		const emptied = upsertQuotesSection(body, []);
		eq(
			"removing the last generated section leaves just the notes",
			emptied,
			"## Notes\n\nNotes.\n"
		);
	}

	// ---------- writing ----------
	eq(
		"notes into an empty body",
		upsertNotesSection("", "Hello."),
		"## Notes\n\nHello.\n"
	);
	eq("no notes, no body", upsertNotesSection("", ""), "");
	eq(
		"a new section goes after every generated one",
		upsertNotesSection(GENERATED, "Met at uni."),
		`${GENERATED}\n## Notes\n\nMet at uni.\n`
	);
	eq(
		"emptied notes remove the section",
		upsertNotesSection(`${GENERATED}\n## Notes\n\nOld note.\n`, ""),
		GENERATED
	);
	{
		const before = `${GENERATED}\n## Notes\n\nOld.\n\n## Sub\n\nOld too.\n`;
		const after = upsertNotesSection(before, "New.\n\nWith **bold**.");
		eq(
			"a save replaces the whole section, typed headings included",
			after,
			`${GENERATED}\n## Notes\n\nNew.\n\nWith **bold**.\n`
		);
		eq(
			"…leaving the generated sections byte for byte",
			after.slice(0, GENERATED.length),
			GENERATED
		);
	}
	{
		const body = `${GENERATED}\n## Notes\n\nOne.\n\n## Ideas\n\nnot really\n`;
		const once = upsertNotesSection(body, notesFromBody(body));
		eq("saving what's there is a no-op", once, body);
	}
	{
		const notes = "## Ideas\n\nfor the party\n\n## Events\n\n- [[Made up]]";
		const written = upsertNotesSection(GENERATED, notes);
		eq("notes that look like sections read back whole", notesFromBody(written), notes);
		eq(
			"…and the real Ideas section is still the real one",
			JSON.stringify(parseIdeasSection(written)),
			JSON.stringify(parseIdeasSection(GENERATED))
		);
	}

	// ---------- adopting prose from before the section ----------
	{
		const { prose, rest } = splitLooseProse(
			`Top note.\n\n${IDEAS}\n\n${EVENTS}\nTyped under events.\n\n## Background\n\nPerth.\n`
		);
		eq(
			"loose prose is everything the plugin didn't generate",
			prose,
			"Top note.\n\nTyped under events.\n\n## Background\n\nPerth."
		);
		eq("…and the rest is the generated sections", rest, `${IDEAS}\n\n${EVENTS}\n`);
	}
	eq(
		"a body of only generated sections has nothing to adopt",
		adoptNotes(GENERATED, ""),
		GENERATED
	);
	eq(
		"prose moves under a Notes heading at the end",
		adoptNotes(`Met at uni.\n\n${GENERATED}`, ""),
		`${GENERATED}\n## Notes\n\nMet at uni.\n`
	);
	eq(
		"frontmatter notes lead the adopted prose",
		notesFromBody(adoptNotes(`Body prose.\n\n${GENERATED}`, "From fm.")),
		"From fm.\n\nBody prose."
	);
	eq(
		"frontmatter notes alone make the section",
		adoptNotes("", "From fm."),
		"## Notes\n\nFrom fm.\n"
	);
	{
		const body = `${GENERATED}\n## Notes\n\nKept.\n`;
		eq("an existing section is left alone", adoptNotes(body, ""), body);
		eq(
			"prose outside an existing section isn't adopted again",
			adoptNotes(`Stray.\n\n${body}`, ""),
			`Stray.\n\n${body}`
		);
		eq(
			"frontmatter notes fold into an existing section",
			notesFromBody(adoptNotes(body, "From fm.")),
			"From fm.\n\nKept."
		);
	}
	{
		const once = adoptNotes(`Prose.\n\n${GENERATED}`, "From fm.");
		eq(
			"adopting twice is a no-op (a crash before the key cleared)",
			adoptNotes(once, "From fm."),
			once
		);
	}

	// ---------- helpers ----------
	eq("windows line endings become \\n", normalizeNotes("a\r\nb\r\n"), "a\nb");
	eq("blank edges are trimmed", normalizeNotes("\n\n  \nHello\n\n"), "Hello");
	eq("joined notes are separate paragraphs", joinNotes("One.", "", "Two."), "One.\n\nTwo.");

	eq("no frontmatter notes, body wins", foldFrontmatterNotes("", "Body."), "Body.");
	eq("frontmatter into an empty body", foldFrontmatterNotes("From fm.", ""), "From fm.");
	eq(
		"frontmatter goes ahead of the body",
		foldFrontmatterNotes("From fm.", "Already in body."),
		"From fm.\n\nAlready in body."
	);
	eq(
		"already carried over, not duplicated",
		foldFrontmatterNotes("From fm.", "From fm.\n\nAlready in body."),
		"From fm.\n\nAlready in body."
	);
	eq(
		"exactly equal, not duplicated",
		foldFrontmatterNotes("From fm.", "From fm."),
		"From fm."
	);
	eq(
		"a word-prefix only counts on a word boundary",
		foldFrontmatterNotes("hi", "high tide at 6"),
		"hi\n\nhigh tide at 6"
	);
	eq(
		"whitespace-only frontmatter is nothing",
		foldFrontmatterNotes("   \n ", "Body."),
		"Body."
	);

	// ---------- a plan's drafts beside its notes ----------
	// A plan keeps its own `## Drafts` checklist in the same body as its
	// Notes. Before PAGE_DRAFTS_SECTION the checklist could land after the
	// Notes — which run to the end of the file — and be read, and then saved
	// away, as notes.
	{
		const draft = { text: "Book flights", created: "2026-09-01", done: false };
		const LINE = "- [ ] Book flights ➕ 2026-09-01";

		const added = upsertDraftsSection(
			"## Notes\n\nBring sunscreen\n",
			[draft],
			PAGE_DRAFTS_SECTION
		);
		eq(
			"a plan's first draft goes above its notes",
			added,
			`## Drafts\n\n${LINE}\n\n## Notes\n\nBring sunscreen\n`
		);
		eq("...so the notes don't read the checklist", parseNotesSection(added), "Bring sunscreen");
		eq(
			"...and saving the notes keeps the drafts",
			parseDraftsSection(
				upsertNotesSection(added, "Bring sunscreen and hats"),
				PAGE_DRAFTS_SECTION
			),
			[draft]
		);

		const draftsOnly = `## Drafts\n\n${LINE}\n`;
		eq(
			"adopting notes doesn't take a plan's drafts for loose prose",
			adoptNotes(draftsOnly, ""),
			draftsOnly
		);
		eq(
			"...and an older frontmatter note lands below them",
			adoptNotes(draftsOnly, "From fm."),
			`## Drafts\n\n${LINE}\n\n## Notes\n\nFrom fm.\n`
		);

		const dashboardish = `## Notes\n\nx\n\n## Drafts\n\n${LINE}\n`;
		eq(
			"the dashboard's spec still finds a checklist below a Notes heading",
			parseDraftsSection(dashboardish),
			[draft]
		);
		eq(
			"...while a plan's only looks above it",
			parseDraftsSection(dashboardish, PAGE_DRAFTS_SECTION),
			null
		);

		// ---------- rescuing drafts an older release left inside the notes ----------
		const appended = `## Notes\n\nBring sunscreen\n\n## Drafts\n\n${LINE}\n`;
		eq(
			"a checklist appended after the notes moves back above them",
			rescueDraftsFromNotes(appended),
			`## Drafts\n\n${LINE}\n\n## Notes\n\nBring sunscreen\n`
		);
		eq(
			"rescuing twice changes nothing more",
			rescueDraftsFromNotes(rescueDraftsFromNotes(appended)),
			rescueDraftsFromNotes(appended)
		);
		eq(
			"a checklist adopted as notes comes back out, and the empty notes go",
			rescueDraftsFromNotes(`## Notes\n\n## Drafts\n\n${LINE}\n`),
			`## Drafts\n\n${LINE}\n`
		);
		const healthy = `## Drafts\n\n${LINE}\n\n## Notes\n\nBring sunscreen\n`;
		eq("a healthy plan is left byte for byte", rescueDraftsFromNotes(healthy), healthy);
		eq(
			"no Notes heading, nothing to rescue",
			rescueDraftsFromNotes(draftsOnly),
			draftsOnly
		);
		const ownHeading = "## Notes\n\n## Drafts\n\nSpeech outline, second pass\n";
		eq(
			"a Drafts heading of the person's own, with no tasks under it, stays theirs",
			rescueDraftsFromNotes(ownHeading),
			ownHeading
		);
		eq(
			"prose written under the stray heading stays in the notes",
			parseNotesSection(
				rescueDraftsFromNotes(
					`## Notes\n\nBring sunscreen\n\n## Drafts\n\n${LINE}\nAnd hats\n`
				)
			),
			"Bring sunscreen\n\nAnd hats"
		);
		const both =
			"## Drafts\n\n- [ ] Pack ➕ 2026-08-30\n\n## Notes\n\nBring sunscreen\n\n" +
			`## Drafts\n\n${LINE}\n- [ ] Pack ➕ 2026-08-30\n`;
		eq(
			"rescued drafts join the real section without doubling one already there",
			parseDraftsSection(rescueDraftsFromNotes(both), PAGE_DRAFTS_SECTION)?.map(
				(d) => d.text
			),
			["Pack", "Book flights"]
		);
		eq(
			"...and none are left behind in the notes",
			parseNotesSection(rescueDraftsFromNotes(both)),
			"Bring sunscreen"
		);
	}

	return result();
}
