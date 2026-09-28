import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";
import { SomedayOperations } from "./.build/callander.mjs";

/**
 * The someday service, pinned before it's reorganised: how each field is
 * read back (older shapes folded in, garbage dropped), what an edit writes
 * and removes, and the sub-idea list, which is edited by position.
 */
export async function run() {
	const { eq, ok, result } = createSuite("somedays (fake vault)");
	const S = SomedayOperations;

	// ---------- reading fields ----------
	eq("days are lowercased, and anything else dropped", S.daysOf({ days: ["Mon", "sat", "funday", 3] }), ["mon", "sat"]);
	eq("times: an old stored \"any\" means no times", S.timesOf({ times: ["any", "Morning", "night"] }), ["morning", "night"]);
	eq("seasons, the unknown dropped", S.seasonsOf({ seasons: ["Summer", "monsoon"] }), ["summer"]);
	eq("…the old single timeframe read as a season", S.seasonsOf({ timeframe: "winter" }), ["winter"]);
	eq("…but only when there are no seasons", S.seasonsOf({ seasons: ["fall"], timeframe: "winter" }), ["fall"]);
	eq(
		"sub-ideas: plain strings read as unticked, empty ones dropped",
		S.subIdeasOf({ subIdeas: ["plain", { text: "t", done: 1 }, { text: "" }, { done: true }] }),
		[{ text: "plain", done: false }, { text: "t", done: true }]
	);
	eq("types: deduped, unknown dropped, in the picker's order", S.typesOf({ types: ["nature", "food", "nature", "bogus"] }), ["food", "nature"]);
	eq("…the old single type read when there are none", [S.typesOf({ type: "drinks" }), S.typesOf({ types: [], type: "drinks" })], [["drinks"], ["drinks"]]);
	eq("…an old type id that no longer exists is nothing", S.typesOf({ type: "bar" }), []);
	eq("a cost is a number or nothing", [S.costOf({ cost: 0 }), S.costOf({ cost: "400" })], [0, null]);
	eq("people, whatever they were stored as", S.peopleOf({ people: ["[[A]]", 5] }), ["[[A]]", "5"]);

	// ---------- editing ----------
	{
		const t = await createTestVault();
		const file = await t.somedays.createSomeday({ name: "Picnic", notes: "Bring a rug", cost: 20, days: ["sat"] });
		await t.somedays.updateSomeday(file, { notes: "", cost: 0, days: [] });
		const fm = t.frontmatterOf(file);
		ok("an emptied field is removed", !("notes" in fm) && !("days" in fm));
		eq("…but a cost of 0 is kept: free is an estimate", fm.cost, 0);
	}
	{
		const t = await createTestVault();
		const file = await t.somedays.createSomeday({ name: "Picnic" });
		await t.app.fileManager.processFrontMatter(file, (fm) => {
			fm.timeframe = "summer";
			fm.type = "food";
		});
		await t.somedays.updateSomeday(file, { seasons: ["spring"], types: ["nature"] });
		const fm = t.frontmatterOf(file);
		eq("setting seasons retires the old timeframe", ["timeframe" in fm, fm.seasons], [false, ["spring"]]);
		eq("…and types the old single type", ["type" in fm, fm.types], [false, ["nature"]]);
	}

	// ---------- sub-ideas ----------
	{
		const t = await createTestVault();
		const file = await t.somedays.createSomeday({ name: "Trip to Maine" });
		const subIdeas = () => S.subIdeasOf(t.frontmatterOf(file));
		await t.somedays.addSubIdea(file, "  Beth's bakery  ");
		await t.somedays.addSubIdea(file, "   ");
		await t.somedays.addSubIdea(file, "Sunset at the point");
		eq("added trimmed, a blank one ignored", subIdeas(), [
			{ text: "Beth's bakery", done: false },
			{ text: "Sunset at the point", done: false },
		]);
		await t.somedays.toggleSubIdea(file, 1);
		eq("a tick lands on the one at that place", subIdeas().map((s) => s.done), [false, true]);
		await t.somedays.toggleSubIdea(file, 1);
		eq("…and a second tick undoes it", subIdeas()[1].done, false);
		await t.somedays.removeSubIdea(file, 5);
		eq("removing past the end changes nothing", subIdeas().length, 2);
		await t.somedays.removeSubIdea(file, 0);
		eq("removing one keeps the rest", subIdeas().map((s) => s.text), ["Sunset at the point"]);
		await t.somedays.removeSubIdea(file, 0);
		ok("…and removing the last takes the key with it", !("subIdeas" in t.frontmatterOf(file)));
	}

	// ---------- status, conversion, delete ----------
	{
		const t = await createTestVault();
		const file = await t.somedays.createSomeday({ name: "Picnic" });
		await t.somedays.setStatus(file, "done");
		await t.somedays.markConverted(file, "Friends/Plans/Picnic.md");
		const info = t.somedays.getSomedays().find((s) => s.file === file);
		eq("done, and where it went", [info.status, info.convertedTo], ["done", "Friends/Plans/Picnic.md"]);
		await t.somedays.deleteSomeday(file);
		ok("deleting sends it to the trash", t.app.fileManager.trashed.includes(file.path));
	}
	{
		const t = await createTestVault();
		await t.vault.createFolder("Friends/Somedays");
		const file = await t.vault.create("Friends/Somedays/Bare.md", "---\ncompany: crowd\n---\n");
		const info = t.somedays.getSomedays().find((s) => s.file === file);
		eq(
			"a note missing fields: its file name, open, no company",
			[info.name, info.status, info.company],
			["Bare", "open", ""]
		);
		ok("a someday is a note in its folder", t.somedays.isSomedayFile(file.path) && !t.somedays.isSomedayFile("Friends/Other.md"));
	}

	return result();
}
