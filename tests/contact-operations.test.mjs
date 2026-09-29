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

	// ---------- drafts: a checklist in the dashboard note ----------
	{
		const t = await createTestVault();
		const bo = await t.addPerson("Bo Nakamura", {});
		await t.contacts.addDraft("Something half-formed");
		await t.contacts.addDraft("Ask about the trip", bo);

		const dash = t.vault.getAbstractFileByPath(t.contacts.getDashboardFilePath());
		ok("the dashboard note is made if it wasn't there", !!dash);
		const body = t.bodyOf(dash);
		ok("under a Drafts heading", body.includes("## Drafts"));
		// Local date, matching todayISO() — toISOString() is UTC and drifts
		// a day off local near midnight, which is what made this flaky.
		const now = new Date();
		const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		ok(
			"as unchecked tasks with a created date",
			/- \[ \] Something half-formed ➕ \d{4}-\d{2}-\d{2}/.test(body)
		);
		ok(
			"someone it's about is a wikilink",
			/- \[ \] Ask about the trip \[\[Bo Nakamura\]\] ➕/.test(body)
		);
		eq("the note's own frontmatter is left alone", t.frontmatterOf(dash).kind, "dashboard");
		eq("and no drafts key is written anywhere", "drafts" in t.frontmatterOf(bo), false);

		const drafts = await t.contacts.readDrafts();
		eq("read back in order", drafts.map((d) => d.text), ["Something half-formed", "Ask about the trip"]);
		eq("the link resolves to their note", t.contacts.draftAbout(drafts[1])?.path, bo.path);
		eq("a draft with no one has no note", t.contacts.draftAbout(drafts[0]), null);

		// Done ticks it and stamps the day — it does not delete the line,
		// which is the point of the checklist.
		await t.contacts.completeDraft(0, "Something half-formed");
		const after = t.bodyOf(dash);
		ok("ticked, with the day it was done", /- \[x\] Something half-formed ➕ \d{4}-\d{2}-\d{2} ✅ \d{4}-\d{2}-\d{2}/.test(after));
		ok("the other draft is untouched", /- \[ \] Ask about the trip \[\[Bo Nakamura\]\]/.test(after));
		eq("still in the record", (await t.contacts.readDrafts()).length, 2);
		eq(
			"and it's the ticked one that's done",
			(await t.contacts.readDrafts()).map((d) => d.done),
			[true, false]
		);

		await t.contacts.updateDraft(1, "Ask about the trip", { text: "Ask about the Maine trip" });
		const reworded = (await t.contacts.readDrafts())[1];
		eq("rewording changes the text", reworded.text, "Ask about the Maine trip");
		eq("...and keeps who it's about", reworded.person, "Bo Nakamura");
		eq("...and the day it was captured", reworded.created, today);

		// The list moved under the click: acting on the position alone would
		// tick the wrong line.
		await t.contacts.addDraft("A third");
		await t.contacts.completeDraft(0, "A third");
		eq(
			"an action finds its draft by text when the position is off",
			(await t.contacts.readDrafts()).map((d) => [d.text, d.done]),
			[["Something half-formed", true], ["Ask about the Maine trip", false], ["A third", true]]
		);

		await t.contacts.addDraft("   ");
		eq("blank text isn't a draft", (await t.contacts.readDrafts()).length, 3);
	}

	// ---------- moving drafts out of frontmatter ----------
	{
		const t = await createTestVault();
		const bo = await t.addPerson("Bo Nakamura", {
			drafts: [
				{ text: "About Bo, older", created: "2026-08-01" },
				{ text: "Claude's idea", created: "2026-09-01", generated: true },
			],
			updated: "2026-01-01",
		});
		await t.vault.create(
			t.contacts.getDashboardFilePath(),
			"---\nkind: dashboard\ndrafts:\n  - text: Unattached thought\n    created: 2026-08-15\n---\n"
		);

		eq("it says how many it moved", await t.contacts.migrateDraftsToDashboard(), 3);
		const drafts = await t.contacts.readDrafts();
		eq(
			"oldest first, whoever they were on",
			drafts.map((d) => [d.text, d.person ?? null]),
			[["About Bo, older", "Bo Nakamura"], ["Unattached thought", null], ["Claude's idea", "Bo Nakamura"]]
		);
		eq("the flag is carried", drafts[2].generated, true);
		eq("none of them is ticked", drafts.some((d) => d.done), false);
		eq("the person's frontmatter key is gone", "drafts" in t.frontmatterOf(bo), false);
		const dash = t.vault.getAbstractFileByPath(t.contacts.getDashboardFilePath());
		eq("and the dashboard's", "drafts" in t.frontmatterOf(dash), false);
		eq("moving one isn't an edit to the friend", t.frontmatterOf(bo).updated, "2026-01-01");

		eq("running it again finds nothing", await t.contacts.migrateDraftsToDashboard(), 0);
		eq("...and adds nothing", (await t.contacts.readDrafts()).length, 3);
	}
	{
		// A run that died after writing the checklist but before clearing
		// the keys leaves the drafts in both places. The next run must clear
		// the keys without adding them a second time.
		const t = await createTestVault();
		const bo = await t.addPerson("Bo Nakamura", {
			drafts: [{ text: "Already moved", created: "2026-08-01" }],
		});
		await t.contacts.addDraft("Already moved", bo);
		const before = await t.contacts.readDrafts();
		// Same text and person, but today's date — make it match exactly.
		const dash = t.vault.getAbstractFileByPath(t.contacts.getDashboardFilePath());
		await t.vault.modify(
			dash,
			t.read(dash).replace(/➕ \d{4}-\d{2}-\d{2}/, "➕ 2026-08-01")
		);
		await t.contacts.migrateDraftsToDashboard();
		eq("not added twice", (await t.contacts.readDrafts()).length, before.length);
		eq("but the stale key is cleared", "drafts" in t.frontmatterOf(bo), false);
	}
	{
		// The metadata cache lags a write by a beat, so right after the move
		// clears a key it can still show it. The dashboard refreshes on that
		// very write and would run the move again on that stale picture; the
		// file itself, checked first, says there's nothing left to move.
		const t = await createTestVault();
		const bo = await t.addPerson("Bo Nakamura", {});
		const real = t.app.metadataCache.getFileCache.bind(t.app.metadataCache);
		t.app.metadataCache.getFileCache = (f) =>
			f.path === bo.path
				? { frontmatter: { name: "Bo Nakamura", drafts: [{ text: "Ghost", created: "2026-08-01" }] } }
				: real(f);
		eq("a stale cache alone moves nothing", await t.contacts.migrateDraftsToDashboard(), 0);
		eq("...and adds nothing to the checklist", (await t.contacts.readDrafts()).length, 0);
	}
	{
		const t = await createTestVault();
		await t.addPerson("Bo Nakamura", {});
		eq("nothing to move", await t.contacts.migrateDraftsToDashboard(), 0);
		eq(
			"and it doesn't conjure a dashboard note",
			t.vault.getAbstractFileByPath(t.contacts.getDashboardFilePath()),
			null
		);
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
	// A name containing a `]` used to break the unwrap entirely: the old
	// regex refused to cross one, so the whole raw, still-bracketed value
	// fell through untouched and matched nothing anywhere else in the app
	// — a group added on a Plan simply never showed up.
	eq(
		"a bracket inside the name doesn't break the unwrap",
		ContactOperations.groupsOf({ groups: ["[[Sci-Fi [Book Club]]]"] }),
		["sci-fi [book club]"]
	);
	eq(
		"the same group, written plain, reads the same key",
		ContactOperations.groupsOf({ groups: ["Sci-Fi [Book Club]"] }),
		["sci-fi [book club]"]
	);
	// Other symbols a group might reasonably be named with.
	eq(
		"an ampersand survives",
		ContactOperations.groupsOf({ groups: ["[[Book & Movie Club]]"] }),
		["book & movie club"]
	);
	eq(
		"a colon survives",
		ContactOperations.groupsOf({ groups: ["[[Running: 5k Crew]]"] }),
		["running: 5k crew"]
	);
	// A hyphen is just a character to every step here — nothing in the
	// unwrap, split or lowercase treats it specially.
	eq(
		"a hyphenated group name is untouched",
		ContactOperations.groupsOf({ groups: ["[[Well-Being Group]]"] }),
		["well-being group"]
	);
	eq(
		"and reads the same whether linked or plain",
		ContactOperations.groupsOf({
			groups: ["[[Well-Being Group]]", "well-being group"],
		}),
		["well-being group"]
	);

	// A bracketed name still splits its alias on the left, same as any
	// other link — the bracket in the target isn't mistaken for one.
	eq(
		"a bracketed target still honours an alias",
		ContactOperations.groupsOf({
			groups: ["[[Sci-Fi [Book Club]|the sci-fi group]]"],
		}),
		["sci-fi [book club]"]
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
	// The round trip that was breaking: a bracketed name, linked and read
	// back, has to land on the same key it started from.
	eq(
		"a bracketed name round-trips through groupLink",
		ContactOperations.groupsOf({
			groups: [ContactOperations.groupLink("sci-fi [book club]")],
		}),
		["sci-fi [book club]"]
	);
	eq("blank produces nothing", ContactOperations.groupLink("  "), "");
	// The page's own spelling wins when it's known. Without it the fallback
	// capitalises the first letter only, which mangles anything multi-word:
	// a group page called "Run n' Chug" was being linked as "[[Run n' chug]]".
	eq(
		"a known page's capitalisation is used verbatim",
		ContactOperations.groupLink("run n' chug", "Run n' Chug"),
		"[[Run n' Chug]]"
	);
	eq(
		"the fallback only capitalises the first word",
		ContactOperations.groupLink("run n' chug"),
		"[[Run n' chug]]"
	);
	eq(
		"a blank display falls back rather than linking to nothing",
		ContactOperations.groupLink("uni friends", "   "),
		"[[Uni friends]]"
	);
	// However it's spelled, it still reads back as the same bare key — which
	// is what every membership comparison relies on.
	eq(
		"a page-cased link still reads as its key",
		ContactOperations.groupsOf({
			groups: [ContactOperations.groupLink("run n' chug", "Run n' Chug")],
		}),
		["run n' chug"]
	);
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

	// ---------- adding an idea when a read fails ----------
	// addIdea used to read the list and write it back separately. A read
	// that failed came back as no ideas, and the write then replaced every
	// idea the friend had with the new one.
	{
		const t = await createTestVault();
		const ada = await t.addPerson("Ada");
		await t.contacts.addIdea(ada, "gift", "Tea caddy");
		const cachedRead = t.vault.cachedRead;
		t.vault.cachedRead = async () => {
			throw new Error("busy");
		};
		try {
			await t.contacts.addIdea(ada, "gift", "Climbing shoes");
		} finally {
			t.vault.cachedRead = cachedRead;
		}
		eq(
			"the ideas already there survive a failed read",
			(await t.contacts.readIdeas(ada)).map((i) => i.text),
			["Tea caddy", "Climbing shoes"]
		);
	}

	// ---------- filing an inbox idea onto a friend ----------
	{
		const inbox =
			"---\nkind: dashboard\nideas:\n  - category: gift\n    text: Tea caddy\n    done: false\n---\n";
		const t = await createTestVault();
		const ada = await t.addPerson("Ada");
		await t.vault.create(t.contacts.getDashboardFilePath(), inbox);
		const moved = await t.contacts.moveInboxIdea(0, ada);
		eq("filing returns the idea", moved?.text, "Tea caddy");
		eq(
			"...it lands on the friend",
			(await t.contacts.readIdeas(ada)).map((i) => i.text),
			["Tea caddy"]
		);
		eq("...and leaves the inbox", (await t.contacts.getInboxIdeas()).length, 0);

		// Loss-ordered: added to the friend first, taken out of the inbox
		// only after — so a write that fails leaves it where it was.
		const u = await createTestVault();
		const bo = await u.addPerson("Bo");
		await u.vault.create(u.contacts.getDashboardFilePath(), inbox);
		const process = u.vault.process;
		u.vault.process = async function (file, fn) {
			if (file.path === bo.path) throw new Error("locked");
			return process.call(this, file, fn);
		};
		let failed = false;
		try {
			await u.contacts.moveInboxIdea(0, bo);
		} catch {
			failed = true;
		} finally {
			u.vault.process = process;
		}
		ok("a friend's note that can't be written fails the move", failed);
		eq(
			"...and the idea is still in the inbox",
			(await u.contacts.getInboxIdeas()).map((i) => i.text),
			["Tea caddy"]
		);
	}

	// ---------- managing a group whose page isn't simply capitalised ----------
	// A group is keyed by its page's basename lowercased, so "BJJ.md" is the
	// group "bjj". Rebuilding the page's path from that key only ever guessed
	// "Bjj.md" — and missed the real page every time.
	{
		const t = await createTestVault();
		const page = await t.vault.create(
			"Friends/Groups/BJJ.md",
			"---\nname: BJJ\n---\n"
		);
		const ada = await t.addPerson("Ada", { groups: ["[[BJJ]]"] });
		const cy = await t.addPerson("Cy", { groups: ["[[Book club]]"] });
		const cyBefore = t.read(cy);

		await t.contacts.setGroupColor("bjj", "#ff0000");
		eq("a colour lands on the page that exists", t.frontmatterOf(page).color, "#ff0000");
		ok(
			"...and no second page is made beside it",
			t.vault.getAbstractFileByPath("Friends/Groups/Bjj.md") === null
		);
		ok("ensuring the page finds it too", (await t.contacts.ensureGroupFile("bjj")) === page);

		await t.contacts.renameGroup("bjj", "judo");
		ok(
			"renaming moves the page itself",
			t.vault.getAbstractFileByPath("Friends/Groups/Judo.md") !== null &&
				t.vault.getAbstractFileByPath("Friends/Groups/BJJ.md") === null
		);
		eq("...its members follow", ContactOperations.groupsOf(t.frontmatterOf(ada)), ["judo"]);
		eq("...and a friend who isn't in it isn't rewritten", t.read(cy), cyBefore);

		await t.contacts.deleteGroup("judo");
		ok(
			"deleting trashes the page",
			t.vault.getAbstractFileByPath("Friends/Groups/Judo.md") === null
		);
		eq("...takes it off its members", "groups" in t.frontmatterOf(ada), false);
		eq("...and still leaves everyone else alone", t.read(cy), cyBefore);
	}

	// ---------- renaming onto a name another group already has ----------
	{
		const t = await createTestVault();
		await t.vault.create("Friends/Groups/Run club.md", "---\nname: Run club\n---\n");
		await t.vault.create("Friends/Groups/Climbing.md", "---\nname: Climbing\n---\n");
		const ada = await t.addPerson("Ada", { groups: ["[[Run club]]"] });
		const adaBefore = t.read(ada);
		let refused = false;
		try {
			await t.contacts.renameGroup("run club", "climbing");
		} catch {
			refused = true;
		}
		ok("is refused", refused);
		eq("...before any member is touched", t.read(ada), adaBefore);
		ok(
			"...and both pages are still there",
			t.vault.getAbstractFileByPath("Friends/Groups/Run club.md") !== null &&
				t.vault.getAbstractFileByPath("Friends/Groups/Climbing.md") !== null
		);
	}

	return result();
}
