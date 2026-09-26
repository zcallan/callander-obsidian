import { createSuite } from "./harness.mjs";
import {
	findDraft,
	fromLegacyDrafts,
	mergeLegacyDrafts,
	parseDraftLine,
	parseDraftsSection,
	serializeDraftLine,
	upsertDraftsSection,
} from "./.build/callander.mjs";

/**
 * Drafts as a checklist in the dashboard note. What matters is that a line
 * survives a round trip unchanged, that the person's wikilink is read off
 * the right end, and that ticking one off keeps it — the point of moving
 * out of frontmatter was a record of what was captured.
 */
export function run() {
	const { eq, ok, result } = createSuite("drafts markdown");

	const draft = (over = {}) => ({
		text: "Ask about the allotment",
		created: "2026-09-15",
		done: false,
		...over,
	});

	// ---------- reading a line ----------
	eq("a plain draft", parseDraftLine("- [ ] Book the dentist"), {
		text: "Book the dentist",
		created: "",
		done: false,
	});
	eq(
		"created and done dates come off the end",
		parseDraftLine("- [x] Book the dentist ➕ 2026-09-10 ✅ 2026-09-21"),
		{ text: "Book the dentist", created: "2026-09-10", done: true, doneDate: "2026-09-21" }
	);
	eq(
		"...in either order",
		parseDraftLine("- [x] Book the dentist ✅ 2026-09-21 ➕ 2026-09-10"),
		{ text: "Book the dentist", created: "2026-09-10", done: true, doneDate: "2026-09-21" }
	);
	eq(
		"a person is the wikilink after the text",
		parseDraftLine("- [ ] Ask about the allotment [[George Orwell]] ➕ 2026-09-15"),
		{ text: "Ask about the allotment", person: "George Orwell", created: "2026-09-15", done: false }
	);
	eq(
		"a plan's own draft carries a pinned day",
		parseDraftLine("- [ ] Book the ferry 📅 2026-10-12 ➕ 2026-09-15"),
		{ text: "Book the ferry", date: "2026-10-12", created: "2026-09-15", done: false }
	);
	eq(
		"an alias is kept as typed",
		parseDraftLine("- [ ] Call [[George Orwell|George]]").person,
		"George Orwell|George"
	);
	eq(
		"Claude's marker is read wherever it sits",
		parseDraftLine("- [ ] Try the bakery 🤖 ➕ 2026-09-15").generated,
		true
	);
	eq("* works as a bullet", parseDraftLine("* [ ] Something")?.text, "Something");
	eq("a capital X is done", parseDraftLine("- [X] Something")?.done, true);

	// The link belongs to the person only at the very end. A link in the
	// middle of a sentence is just part of what was written.
	eq(
		"a link mid-sentence stays in the text",
		parseDraftLine("- [ ] See [[Maine]] trip notes"),
		{ text: "See [[Maine]] trip notes", created: "", done: false }
	);
	eq(
		"the LAST link is the person, not a span across two",
		parseDraftLine("- [ ] Compare [[Maine]] with [[Sally Rooney]]"),
		{ text: "Compare [[Maine]] with", person: "Sally Rooney", created: "", done: false }
	);
	eq(
		"a name with brackets in it still reads as one link",
		parseDraftLine("- [ ] Plan the night [[Sci-Fi [Book Club]]]").person,
		"Sci-Fi [Book Club]"
	);
	// A draft that's only a link is *of* that link — pulling it off as the
	// person would leave no text.
	eq(
		"a line that is only a link keeps it as text",
		parseDraftLine("- [ ] [[George Orwell]]"),
		{ text: "[[George Orwell]]", created: "", done: false }
	);
	eq(
		"an emoji in the middle of the text isn't a marker",
		parseDraftLine("- [ ] Try the ✅ approach later")?.text,
		"Try the ✅ approach later"
	);
	eq(
		"a marker that isn't a date isn't one",
		parseDraftLine("- [ ] Book it ➕ soon")?.text,
		"Book it ➕ soon"
	);
	eq("an empty checkbox is nothing", parseDraftLine("- [ ]"), null);
	eq("prose isn't a draft", parseDraftLine("Some note I wrote"), null);
	eq("a plain bullet isn't a draft", parseDraftLine("- just a bullet"), null);

	// ---------- writing a line ----------
	eq(
		"a draft's full line",
		serializeDraftLine(draft({ person: "George Orwell", generated: true })),
		"- [ ] Ask about the allotment [[George Orwell]] 🤖 ➕ 2026-09-15"
	);
	eq(
		"a done draft keeps its dates",
		serializeDraftLine(draft({ done: true, doneDate: "2026-09-21" })),
		"- [x] Ask about the allotment ➕ 2026-09-15 ✅ 2026-09-21"
	);
	eq(
		"no created date, no marker",
		serializeDraftLine(draft({ created: "" })),
		"- [ ] Ask about the allotment"
	);
	eq(
		"a newline can't split the line",
		serializeDraftLine(draft({ text: "First\nSecond  \n  third" })),
		"- [ ] First Second third ➕ 2026-09-15"
	);
	for (const d of [
		draft(),
		draft({ person: "George Orwell" }),
		draft({ person: "Sci-Fi [Book Club]", generated: true }),
		draft({ done: true, doneDate: "2026-09-21", person: "A B" }),
		draft({ created: "", text: "no date at all" }),
		draft({ date: "2026-10-12" }),
		draft({ date: "2026-10-12", done: true, doneDate: "2026-10-05" }),
	]) {
		// Compared by content, not key order.
		const canon = (o) => JSON.stringify(Object.entries(o).sort());
		eq(
			`round trip: ${serializeDraftLine(d)}`,
			canon(parseDraftLine(serializeDraftLine(d))),
			canon(d)
		);
	}

	// ---------- the section ----------
	eq("no heading, no section", parseDraftsSection("Just prose\n"), null);
	eq(
		"drafts under the heading, in order",
		parseDraftsSection("## Drafts\n\n- [ ] one\n- [x] two ✅ 2026-09-01\n")?.map((d) => [d.text, d.done]),
		[["one", false], ["two", true]]
	);
	eq(
		"prose between them is skipped, not misread",
		parseDraftsSection("## Drafts\n\nSome note.\n- [ ] one\n")?.length,
		1
	);
	eq(
		"the next heading ends it",
		parseDraftsSection("## Drafts\n\n- [ ] one\n\n## Other\n\n- [ ] not mine\n")?.length,
		1
	);
	eq("a ### inside stays inside", parseDraftsSection("## Drafts\n\n### Later\n\n- [ ] one\n")?.length, 1);
	ok(
		"the heading is matched without case",
		parseDraftsSection("## drafts\n\n- [ ] one\n")?.length === 1
	);

	// Writing into a note leaves everything else exactly as it was.
	{
		const body = "Intro prose.\n\n## Other\n\nkept\n";
		const written = upsertDraftsSection(body, [draft()]);
		ok("adds the section", written.includes("## Drafts\n\n- [ ] Ask about the allotment ➕ 2026-09-15"));
		ok("leaves the rest alone", written.startsWith("Intro prose.") && written.includes("## Other\n\nkept"));
		eq("and reads back", parseDraftsSection(written)?.map((d) => d.text), ["Ask about the allotment"]);
	}
	{
		const body = "## Drafts\n\nMy own note.\n\n- [ ] old\n\n## Other\n\nkept\n";
		const written = upsertDraftsSection(body, [draft({ text: "new" })]);
		ok("prose inside the section is kept", written.includes("My own note."));
		ok("the section after it is untouched", written.includes("## Other\n\nkept"));
		eq("only its own lines were replaced", parseDraftsSection(written)?.map((d) => d.text), ["new"]);
	}
	eq(
		"ticking one off changes only that line",
		upsertDraftsSection(
			"## Drafts\n\n- [ ] one ➕ 2026-09-01\n- [ ] two ➕ 2026-09-02\n",
			[draft({ text: "one", created: "2026-09-01" }), draft({ text: "two", created: "2026-09-02", done: true, doneDate: "2026-09-21" })]
		),
		"## Drafts\n\n- [ ] one ➕ 2026-09-01\n- [x] two ➕ 2026-09-02 ✅ 2026-09-21\n"
	);

	// ---------- addressing a draft ----------
	{
		const list = [draft({ text: "a" }), draft({ text: "b" }), draft({ text: "c" })];
		eq("by position when the text agrees", findDraft(list, 1, "b"), 1);
		// Someone deleted the first line since the list was read: what was
		// at 2 is now at 1, and acting on position 2 would hit the wrong one.
		eq("...and by text when the list has moved", findDraft(list.slice(1), 2, "c"), 1);
		eq("a draft that's gone is nothing", findDraft(list, 0, "zzz"), -1);
		eq(
			"a ticked-off one isn't a target",
			findDraft([draft({ text: "a", done: true }), draft({ text: "a" })], 0, "a"),
			1
		);
	}

	// ---------- carrying old frontmatter drafts across ----------
	eq(
		"legacy drafts come out oldest first",
		fromLegacyDrafts([
			{ text: "new", created: "2026-09-10" },
			{ text: "old", created: "2026-09-01" },
			{ text: "undated", created: "" },
		]).map((d) => d.text),
		["undated", "old", "new"]
	);
	eq(
		"...unticked, with the flag and person carried",
		fromLegacyDrafts([{ text: "x", created: "2026-09-01", generated: true, person: "A" }])[0],
		{ text: "x", person: "A", created: "2026-09-01", done: false, generated: true }
	);
	{
		// A move that died between its writes leaves them in both places;
		// running it again must not double them.
		const have = [draft({ text: "x", created: "2026-09-01" })];
		eq(
			"an already-moved draft isn't added again",
			mergeLegacyDrafts(have, [draft({ text: "x", created: "2026-09-01" })]).length,
			1
		);
		eq(
			"...but a different one is",
			mergeLegacyDrafts(have, [draft({ text: "y", created: "2026-09-01" })]).length,
			2
		);
		eq(
			"two genuinely identical drafts stay two",
			mergeLegacyDrafts([], [draft({ text: "x" }), draft({ text: "x" })]).length,
			2
		);
		eq(
			"one already present absorbs only one of two identical",
			mergeLegacyDrafts([draft({ text: "x" })], [draft({ text: "x" }), draft({ text: "x" })]).length,
			2
		);
		eq(
			"the same text about someone else is a different draft",
			mergeLegacyDrafts([draft({ text: "x" })], [draft({ text: "x", person: "A" })]).length,
			2
		);
	}

	return result();
}
