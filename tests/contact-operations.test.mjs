import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";
import { ContactOperations } from "./.build/callander.mjs";

/**
 * Service-layer tests: the real ContactOperations against an in-memory
 * vault. This is the tier that covers "add / edit / delete a friend's
 * things and check it actually persisted" — the class of bug that has
 * historically hurt most, because a value can look right on screen and
 * still never reach the file.
 */
export async function run() {
	const { eq, ok, result } = createSuite("contact operations (fake vault)");

	// ---------- reading ideas ----------
	{
		const t = await createTestVault();
		const file = await t.addPerson("Ada Fenwick", {
			ideas: [
				{ category: "gift", text: "Ricer", done: false },
				{ category: "place", text: "Saltie Girl", done: true },
			],
		});
		eq(
			"reads ideas from frontmatter before migration",
			await t.contacts.readIdeas(file),
			[
				{ category: "gift", text: "Ricer", done: false },
				{ category: "place", text: "Saltie Girl", done: true },
			]
		);
	}

	// ---------- migration frontmatter -> body ----------
	{
		const t = await createTestVault();
		const file = await t.addPerson("Ada Fenwick", {
			birthday: "1994-07-26",
			ideas: [{ category: "gift", text: "Ricer", done: false }],
		});

		await t.contacts.migrateIdeasToBody(file);

		eq(
			"ideas key removed from frontmatter",
			"ideas" in t.frontmatterOf(file),
			false
		);
		ok("body gained an Ideas section", t.bodyOf(file).includes("## Ideas"));
		ok("body carries the idea text", t.bodyOf(file).includes("- [ ] Ricer"));
		eq(
			"other frontmatter is untouched",
			t.frontmatterOf(file).birthday,
			"1994-07-26"
		);
		eq("ideas still readable after migration", await t.contacts.readIdeas(file), [
			{ category: "gift", text: "Ricer", done: false },
		]);

		// Running it again must be a no-op, not a duplication.
		const before = t.read(file);
		await t.contacts.migrateIdeasToBody(file);
		eq("migration is idempotent", t.read(file), before);
	}

	// ---------- legacy giftIdeas fold in ----------
	{
		const t = await createTestVault();
		const file = await t.addPerson("Bo Nakamura", {
			giftIdeas: [{ text: "Old gift", done: false }],
		});
		await t.contacts.migrateIdeasToBody(file);
		eq(
			"legacy giftIdeas migrate as gift-category ideas",
			await t.contacts.readIdeas(file),
			[{ category: "gift", text: "Old gift", done: false }]
		);
		eq(
			"legacy key is cleared",
			"giftIdeas" in t.frontmatterOf(file),
			false
		);
	}

	// ---------- crash recovery: body written, key not yet cleared ----------
	{
		const t = await createTestVault();
		const file = await t.addPerson(
			"Cleo Vance",
			{ ideas: [{ category: "gift", text: "Ricer", done: false }] },
			"## Ideas\n\n### 🎁 Gifts\n\n- [ ] Ricer\n"
		);
		await t.contacts.migrateIdeasToBody(file);
		eq(
			"stale frontmatter key is cleared when the body already has it",
			"ideas" in t.frontmatterOf(file),
			false
		);
		eq(
			"and the idea is not duplicated",
			await t.contacts.readIdeas(file),
			[{ category: "gift", text: "Ricer", done: false }]
		);
	}

	// ---------- adding ----------
	{
		const t = await createTestVault();
		const file = await t.addPerson("Dev Okonkwo", {});
		await t.contacts.addIdea(file, "gift", "A nice mug");
		eq("addIdea persists to the body", await t.contacts.readIdeas(file), [
			{ category: "gift", text: "A nice mug", done: false },
		]);
		ok(
			"addIdea does not leave a frontmatter ideas key",
			!("ideas" in t.frontmatterOf(file))
		);

		await t.contacts.addIdea(file, "place", "Saltie Girl");
		eq(
			"a second idea appends rather than replaces",
			(await t.contacts.readIdeas(file)).map((i) => i.text),
			["A nice mug", "Saltie Girl"]
		);
	}

	// ---------- editing ----------
	{
		const t = await createTestVault();
		const file = await t.addPerson("Eze Bright", {});
		await t.contacts.addIdea(file, "gift", "Ricer");

		const ideas = await t.contacts.readIdeas(file);
		ideas[0] = { ...ideas[0], done: true, resurface: "2026-03" };
		await t.contacts.writeIdeas(file, ideas);

		eq("edits persist", await t.contacts.readIdeas(file), [
			{ category: "gift", text: "Ricer", done: true, resurface: "2026-03" },
		]);
		ok("done state written as a checked task", t.bodyOf(file).includes("- [x] Ricer"));
	}

	// ---------- deleting ----------
	{
		const t = await createTestVault();
		const file = await t.addPerson("Ada Fenwick", {});
		await t.contacts.addIdea(file, "gift", "Keep me");
		await t.contacts.addIdea(file, "gift", "Delete me");

		const ideas = await t.contacts.readIdeas(file);
		await t.contacts.writeIdeas(
			file,
			ideas.filter((i) => i.text !== "Delete me")
		);

		eq(
			"deletion persists to disk, not just in memory",
			(await t.contacts.readIdeas(file)).map((i) => i.text),
			["Keep me"]
		);

		// Deleting the last one must clear the section, not leave an empty
		// heading — the body-side equivalent of removing a frontmatter key.
		await t.contacts.writeIdeas(file, []);
		eq("deleting the last idea empties the list", await t.contacts.readIdeas(file), []);
		ok(
			"and removes the now-empty heading",
			!t.bodyOf(file).includes("## Ideas")
		);
	}

	// ---------- drafts round trip through frontmatter ----------
	{
		const t = await createTestVault();
		const file = await t.addPerson("Bo Nakamura", {});
		await t.contacts.addDraft(file, "Something half-formed");
		eq(
			"draft is written",
			t.frontmatterOf(file).drafts.map((d) => d.text),
			["Something half-formed"]
		);

		await t.contacts.addDraft(file, "Another");
		await t.contacts.removeDraft(file, 0);
		eq(
			"removing a draft persists",
			t.frontmatterOf(file).drafts.map((d) => d.text),
			["Another"]
		);

		// Removing the last one must delete the key outright — assigning an
		// empty array would leave `drafts: []` behind forever.
		await t.contacts.removeDraft(file, 0);
		eq(
			"removing the last draft deletes the key",
			"drafts" in t.frontmatterOf(file),
			false
		);
	}

	// ---------- merging two friends ----------
	{
		const t = await createTestVault();
		const keep = await t.addPerson(
			"Ada Fenwick",
			{ birthday: "1994-07-26" },
			'## Quotes\n\n- "Keep quote"\n\n## Ideas\n\n### 🎁 Gifts\n\n- [ ] Keep idea\n'
		);
		const dupe = await t.addPerson(
			"Ada F",
			{ hometown: "Carver" },
			'## Quotes\n\n- "Dupe quote"\n\n## Ideas\n\n### 📍 Places\n\n- [ ] Dupe idea\n\n## Notes Of Mine\n\nUser prose.\n'
		);

		await t.contacts.mergeFriends(keep, dupe);
		const body = t.bodyOf(keep);

		eq("exactly one Ideas heading survives", (body.match(/## Ideas/g) || []).length, 1);
		eq("exactly one Quotes heading survives", (body.match(/## Quotes/g) || []).length, 1);
		eq(
			"both friends' ideas are merged",
			(await t.contacts.readIdeas(keep)).map((i) => i.text).sort(),
			["Dupe idea", "Keep idea"]
		);
		ok("both quotes survive", body.includes("Keep quote") && body.includes("Dupe quote"));
		ok("the duplicate's own prose is appended", body.includes("User prose."));
		eq(
			"scalar gaps are filled from the duplicate",
			t.frontmatterOf(keep).hometown,
			"Carver"
		);
		eq(
			"the kept friend wins conflicts",
			t.frontmatterOf(keep).birthday,
			"1994-07-26"
		);
		ok("the duplicate file is trashed", !t.app.vault.getAbstractFileByPath(dupe.path));
	}

	// ---------- getContacts reads through to ideas in the body ----------
	{
		const t = await createTestVault();
		const file = await t.addPerson("Ada Fenwick", { birthday: "1994-07-26" });
		await t.contacts.addIdea(file, "gift", "Open one");
		await t.contacts.addIdea(file, "gift", "Done one");
		const ideas = await t.contacts.readIdeas(file);
		ideas[1].done = true;
		await t.contacts.writeIdeas(file, ideas);

		const contacts = await t.contacts.getContacts();
		eq("one contact found", contacts.length, 1);
		eq("name read from frontmatter", contacts[0].name, "Ada Fenwick");
		eq("ideas read from the body", contacts[0].ideas.length, 2);
		eq("open-idea count excludes done ones", contacts[0].openIdeas, 1);
	}

	// ---------- getContacts reads shortName ----------
	{
		const t = await createTestVault();
		await t.addPerson("Barack Obama", { shortName: "Obama" });
		await t.addPerson("Barack Chen");

		const contacts = await t.contacts.getContacts();
		const obama = contacts.find((c) => c.name === "Barack Obama");
		const chen = contacts.find((c) => c.name === "Barack Chen");
		eq("shortName read from frontmatter", obama.shortName, "Obama");
		eq("shortName is an empty string, not undefined, when unset", chen.shortName, "");
	}

	// ---------- groups are stored as links ----------
	// Wikilinks so each group is a real link to its page — graph edges and
	// backlinks for free. Everything downstream compares bare lowercase
	// names, so the brackets come off on the way in.
	eq(
		"a linked group reads as its bare name",
		ContactOperations.groupsOf({ groups: ["[[Uni friends]]"] }),
		["uni friends"]
	);
	// No migration pass: a vault written before this still reads correctly
	// and converts itself the next time the person is saved.
	eq(
		"a legacy plain name still reads",
		ContactOperations.groupsOf({ groups: ["Uni friends"] }),
		["uni friends"]
	);
	eq(
		"the two forms dedupe against each other",
		ContactOperations.groupsOf({ groups: ["[[Uni friends]]", "uni friends"] }),
		["uni friends"]
	);
	// An aliased link points at the note on the left; the label would be the
	// wrong thing to match on.
	eq(
		"an aliased link matches on its target",
		ContactOperations.groupsOf({ groups: ["[[Uni friends|the unis]]"] }),
		["uni friends"]
	);
	eq(
		"a single value isn't required to be a list",
		ContactOperations.groupsOf({ groups: "[[Climbing]]" }),
		["climbing"]
	);
	eq("no groups is empty", ContactOperations.groupsOf({}), []);
	eq(
		"blank entries are dropped",
		ContactOperations.groupsOf({ groups: ["", "  ", "[[A]]"] }),
		["a"]
	);

	// groupLink writes the pretty form, so the link names the file that
	// actually exists (Groups/Uni friends.md).
	eq(
		"a bare name becomes a link to its page",
		ContactOperations.groupLink("uni friends"),
		"[[Uni friends]]"
	);
	eq(
		"an existing link is not double-wrapped",
		ContactOperations.groupLink("[[Uni friends]]"),
		"[[Uni friends]]"
	);
	eq("blank produces nothing", ContactOperations.groupLink("  "), "");
	// Round-trip: storing then reading must give back what matching expects.
	eq(
		"link and read round-trip",
		ContactOperations.groupsOf({
			groups: ["climbing", "Uni friends"].map((g) =>
				ContactOperations.groupLink(g)
			),
		}),
		["climbing", "uni friends"]
	);

	return result();
}
