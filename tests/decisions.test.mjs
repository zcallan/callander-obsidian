import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";
import { carryExpenseStatus, expenseEditClearsStatus, groupNameProblem } from "./.build/callander.mjs";

/** The behaviour the owner settled on 2026-09-28 (PLAN §2, decisions 14–15 and §5.3). */
export async function run() {
	const { eq, ok, result } = createSuite("owner decisions");

	// §5.3: people's file names, trimmed and cleaned; a blank name refused.
	{
		const t = await createTestVault();
		const bob = await t.contacts.createContact({ name: "  Bob  " });
		eq("a padded name is trimmed, file and frontmatter both (MA-B7)", [bob.path, t.frontmatterOf(bob).name], ["Friends/People/Bob.md", "Bob"]);
		const odd = await t.contacts.createContact({ name: "D&D: Tue/Wed" });
		eq("characters a file can't hold are swapped in the file name only", [odd.path, t.frontmatterOf(odd).name], ["Friends/People/D&D- Tue-Wed.md", "D&D: Tue/Wed"]);
		let threw = false;
		try {
			await t.contacts.createContact({ name: "   " });
		} catch {
			threw = true;
		}
		ok("a blank name is refused", threw);
		await t.contacts.renamePerson(bob, " Bob: the builder ");
		eq("a rename follows the same rule", bob.path, "Friends/People/Bob- the builder.md");
	}

	// §5.3: group names that can't be a file or a link are refused, not rewritten.
	eq(
		"group names (SVC-B13)",
		["Run club", "Work/School", "D&D: Tuesdays", "   ", "Book [club]"].map((n) => groupNameProblem(n) === null),
		[true, false, false, false, false]
	);

	// Decision 15: an edit keeps paid ticks and settled only when the money is unchanged.
	{
		const before = { label: "Dinner", amount: 60, people: ["[[Ann]]", "Bo"], paid: ["Ann"], settled: false, split: { mode: "even" } };
		const edit = (over) => ({ label: "Dinner", amount: 60, people: ["[[Ann]]", "Bo"], split: { mode: "even" }, ...over });
		eq("a relabel keeps them", carryExpenseStatus(before, edit({ label: "Pizza" })), { ...edit({ label: "Pizza" }), settled: false, paid: ["Ann"] });
		eq(
			"a new amount, split or people drops them",
			[edit({ amount: 70 }), edit({ split: { mode: "shares", shares: { Ann: 2 } } }), edit({ people: ["[[Ann]]"] })].map((e) => [expenseEditClearsStatus(before, e), "paid" in carryExpenseStatus(before, e)]),
			[[true, false], [true, false], [true, false]]
		);
		eq("a new expense has nothing to carry", carryExpenseStatus(null, edit({})), edit({}));
	}

	// Decision 14 (SVC-B6): an opted-out event is off the person's page and their note.
	{
		const t = await createTestVault();
		const ada = await t.addPerson("Ada");
		await t.events.createEvent({ name: "Dinner", date: "2026-08-06", people: ["[[Ada]]"] });
		await t.events.createEvent({ name: "Buy Ada a present", date: "2026-08-07", people: ["[[Ada]]"], showOnTimelines: false });
		eq("only the event about her is on her page", t.events.eventsFor(ada).map((e) => e.name), ["Dinner"]);
		ok("…and in her note's Events list", t.bodyOf(ada).includes("Dinner") && !t.bodyOf(ada).includes("present"));
	}
	return result();
}
