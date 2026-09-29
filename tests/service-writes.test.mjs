import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";
import { stringifyYaml } from "./.build/callander.mjs";

/**
 * The writes that moved out of the contact page and AddContactModal into
 * services: the same bytes as before, from one place.
 */
export async function run() {
	const { eq, ok, result } = createSuite("service writes (fake vault)");

	// ---------- a new person ----------
	{
		const t = await createTestVault();
		const data = { name: "Sam Rivera", birthday: "1990-03-14", relationship: ["friend"], created: "2026-08-05", updated: "2026-08-05" };
		const file = await t.contacts.createContact(data);
		eq("named for them, under People/", file.path, "Friends/People/Sam Rivera.md");
		eq("frontmatter as given, in order, as AddContactModal wrote it", t.read(file), `---\n${stringifyYaml(data)}\n---\n`);
		let threw = false;
		try {
			await t.contacts.createContact({ name: "Sam Rivera" });
		} catch {
			threw = true;
		}
		ok("a taken name throws, so the form stays open", threw);
	}

	// ---------- deleting a person ----------
	{
		const t = await createTestVault();
		const person = await t.addPerson("Sam");
		const plan = await t.addPlan("Cabin", { members: ["[[Sam]]", "Guest"] });
		await t.contacts.deleteContact(person);
		eq("out of the plan first", t.frontmatterOf(plan).members, ["Guest"]);
		eq("then to the trash", t.app.fileManager.trashed, ["Friends/People/Sam.md"]);
	}

	// ---------- renaming a person ----------
	{
		const t = await createTestVault();
		const person = await t.addPerson("Sam");
		await t.contacts.renamePerson(person, "Sam Rivera");
		eq("the note follows the name", person.path, "Friends/People/Sam Rivera.md");
		const rename = t.app.fileManager.renameFile.bind(t.app.fileManager);
		let renames = 0;
		t.app.fileManager.renameFile = (...args) => (renames++, rename(...args));
		await t.contacts.renamePerson(person, " Sam Rivera ");
		eq("no rename at all when it already matches", [person.path, renames], ["Friends/People/Sam Rivera.md", 0]);
	}

	// ---------- a plan's name and its file ----------
	{
		const t = await createTestVault();
		const plan = await t.addPlan("Cabin");
		await t.plans.renamePlan(plan, 'Lake: "house"');
		eq("renamed with the plan's sanitising", plan.path, "Friends/Plans/Lake- -house-.md");
		await t.plans.renamePlan(plan, "  ");
		eq("an empty name falls back to Plan", plan.path, "Friends/Plans/Plan.md");
		const rename = t.app.fileManager.renameFile.bind(t.app.fileManager);
		let renames = 0;
		t.app.fileManager.renameFile = (...args) => (renames++, rename(...args));
		await t.plans.renamePlan(plan, "Plan");
		eq("no rename at all when it already matches", [plan.path, renames], ["Friends/Plans/Plan.md", 0]);
		await t.plans.deletePlan(plan);
		eq("deleting trashes it", t.app.fileManager.trashed, ["Friends/Plans/Plan.md"]);
	}

	// ---------- body sections ----------
	{
		const t = await createTestVault();
		const person = await t.addPerson("Ann", { birthday: "1990" }, "\n## Notes\n\nOld\n");
		await t.contacts.writeNotes(person, "New notes");
		await t.contacts.writeQuotes(person, [{ text: "Hi", date: "" }]);
		ok("notes rewritten", t.bodyOf(person).includes("New notes") && !t.bodyOf(person).includes("Old"));
		ok("quotes added", t.bodyOf(person).includes("Hi"));
		eq("frontmatter untouched", t.frontmatterOf(person), { name: "Ann", birthday: "1990" });

		const plan = await t.addPlan("Trip");
		await t.plans.writeDrafts(plan, [{ text: "Book the ferry", done: false, created: "" }]);
		ok("a plan's drafts section", /Book the ferry/.test(t.bodyOf(plan)));
	}
	return result();
}
