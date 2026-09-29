import { createSuite } from "./harness.mjs";
import {
	ContactPageModel,
	OwnWrites,
	TFile,
	loadModel,
	reloadModel,
	saveModel,
	writeIdeas,
} from "./.build/callander.mjs";
import { createTestVault } from "./vault.mjs";

/**
 * The contact page's persistence — loading a note into a model, saving
 * what the page changed, and reading the note again — driven through a
 * stand-in for the view. Until the page was split, none of this could be
 * reached from a test.
 */
export function run() {
	const { eq, result } = createSuite("contact page model");

	/** What persistence.ts reaches through PageContext. */
	const page = (t) => {
		const ctx = {
			app: t.app,
			plugin: t.plugin,
			store: { bump: () => ctx.bumps++ },
			bumps: 0,
			ownWrites: new OwnWrites(),
			model: ContactPageModel.unread(),
			wrote: () => {},
		};
		return ctx;
	};
	const always = () => true;
	const load = (ctx, file, kind = "person") =>
		loadModel(ctx, file, { kind, stillWanted: always });
	const fm = (t, file) => t.app.metadataCache.getFileCache(file)?.frontmatter;

	return (async () => {
		// --- a save lands in its own note, after the page has moved on ---
		{
			const t = await createTestVault();
			const ctx = page(t);
			const ana = await t.addPerson("Ana", { relationship: "friend" });
			const bo = await t.addPerson("Bo", { relationship: "family" });
			const a = await load(ctx, ana);
			// The page goes to Bo while a form for Ana is still open.
			ctx.model = await load(ctx, bo);
			a.data.location = "Lisbon";
			await saveModel(ctx, a);
			eq("Ana's note has the edit", t.read(ana).includes("location: Lisbon"), true);
			eq("Bo's note doesn't", t.read(bo).includes("Lisbon"), false);
		}

		// --- a save writes only what changed ---
		{
			const t = await createTestVault();
			const ctx = page(t);
			const ana = await t.addPerson("Ana", { groups: ["[[Book club]]"] });
			const a = await load(ctx, ana);
			// Another device adds a phone number after the page loaded.
			await t.app.fileManager.processFrontMatter(ana, (f) => {
				f.phone = "555-0100";
			});
			delete a.data.groups;
			await saveModel(ctx, a);
			const text = t.read(ana);
			eq("the cleared list is gone", text.includes("groups"), false);
			eq("the other device's key is kept", text.includes("phone: 555-0100"), true);
		}

		// --- a migration's save doesn't stamp; an edit does ---
		{
			const t = await createTestVault();
			const ctx = page(t);
			const ana = await t.addPerson("Ana", {
				quotes: [{ text: "Brevity.", context: "at lunch" }],
			});
			await load(ctx, ana);
			const text = t.read(ana);
			eq("quotes moved into the body", text.includes("## Quotes"), true);
			eq("and out of frontmatter", /^quotes:/m.test(text), false);
			eq("a move isn't an edit: no stamp", /^updated:/m.test(text), false);
			const a = await load(ctx, ana);
			a.data.location = "Porto";
			await saveModel(ctx, a);
			eq("an edit stamps updated", /^updated: \d{4}-\d{2}-\d{2}$/m.test(t.read(ana)), true);
		}

		// --- a move that died between its two writes is finished quietly ---
		{
			const t = await createTestVault();
			const ctx = page(t);
			const ana = await t.addPerson(
				"Ana",
				{ quotes: [{ text: "Brevity." }] },
				'## Quotes\n\n- "Brevity."\n'
			);
			await load(ctx, ana);
			const text = t.read(ana);
			eq("the leftover key is cleared", /^quotes:/m.test(text), false);
			eq("without stamping", /^updated:/m.test(text), false);
		}

		// --- groups and "other" notes are never stamped ---
		{
			const t = await createTestVault();
			const ctx = page(t);
			const group = await t.vault.create(
				"Friends/Groups/Book club.md",
				"---\nname: Book club\n---\n"
			);
			const g = await load(ctx, group, "group");
			g.data.color = "#ff0000";
			await saveModel(ctx, g);
			eq("a group page isn't stamped", /^updated:/m.test(t.read(group)), false);
		}

		// --- the frontmatter ideas move, legacy gift ideas included ---
		{
			const t = await createTestVault();
			const ctx = page(t);
			const ana = await t.addPerson("Ana", {
				ideas: [{ category: "activity", text: "Climbing", done: false }],
				giftIdeas: ["A good pen"],
			});
			const a = await load(ctx, ana);
			const text = t.read(ana);
			eq("ideas are in the body", text.includes("## Ideas"), true);
			eq("both keys are cleared", /^(ideas|giftIdeas):/m.test(text), false);
			eq(
				"the model reads both from the body",
				a.ideas().map((i) => i.text),
				["Climbing", "A good pen"]
			);
		}

		// --- a legacy notes value becomes the Notes section ---
		{
			const t = await createTestVault();
			const ctx = page(t);
			const ana = await t.addPerson("Ana", { notes: "Allergic to cats." });
			const a = await load(ctx, ana);
			const text = t.read(ana);
			eq("notes are in the body", /## Notes\n+Allergic to cats\./.test(text), true);
			eq("the key is cleared", /^notes:/m.test(text), false);
			eq("the model has them", a.bodyNotes, "Allergic to cats.");
		}

		// --- a plan's undated drafts move; dated ones stay for the timeline ---
		{
			const t = await createTestVault();
			const ctx = page(t);
			const plan = await t.addPlan("Cabin trip", {
				drafts: [
					{ text: "Bring board games", created: "2026-09-01" },
					{ text: "Book the canoe", created: "2026-09-02", date: "2026-10-03" },
				],
			});
			const p = await load(ctx, plan, "plan");
			const text = t.read(plan);
			eq("the undated one is in the Drafts section", /## Drafts[\s\S]*Bring board games/.test(text), true);
			eq(
				"the dated one stays in frontmatter",
				fm(t, plan)?.drafts?.map((d) => d.text),
				["Book the canoe"]
			);
			eq("the model reads the undated one from the body", p.planDrafts().map((d) => d.text), ["Bring board games"]);
		}

		// --- reading the note on screen again keeps unsaved edits ---
		{
			const t = await createTestVault();
			const ctx = page(t);
			const ana = await t.addPerson("Ana", { relationship: "friend" });
			const a = await load(ctx, ana);
			ctx.model = a;
			a.data.location = "Lisbon"; // typed, not yet saved
			// A sync lands meanwhile.
			await t.app.fileManager.processFrontMatter(ana, (f) => {
				f.relationship = "family";
			});
			eq("the read went through", await reloadModel(ctx, a, always), "done");
			eq("the synced change is read", a.data.relationship, "family");
			eq("the unsaved edit survives", a.data.location, "Lisbon");
			await saveModel(ctx, a);
			const text = t.read(ana);
			eq(
				"and the next save writes only that",
				[text.includes("relationship: family"), text.includes("location: Lisbon")],
				[true, true]
			);
		}

		// --- a read the page no longer wants changes nothing ---
		{
			const t = await createTestVault();
			const ctx = page(t);
			const ana = await t.addPerson("Ana", { relationship: "friend" });
			const a = await load(ctx, ana);
			await t.app.fileManager.processFrontMatter(ana, (f) => {
				f.relationship = "family";
			});
			eq("a stale read says so", await reloadModel(ctx, a, () => false), "stale");
			eq("and leaves the model alone", a.data.relationship, "friend");
		}

		// --- a note that can't be read can't be saved over ---
		{
			const t = await createTestVault();
			const ctx = page(t);
			const ghost = new TFile("Friends/People/Ghost.md");
			// The failed read is logged; it's expected here.
			const logged = [];
			const original = console.error;
			console.error = (...args) => logged.push(args);
			let g;
			try {
				g = await load(ctx, ghost);
			} finally {
				console.error = original;
			}
			eq("comes back unread", [g.saved, g.data], [null, {}]);
			eq("and says why in the console", logged.length, 1);
			g.data.name = "Ghost";
			await saveModel(ctx, g);
			eq("and a save writes nothing", t.vault.writeLog.some((w) => w.path === ghost.path), false);
		}

		// --- body writes go through the view's own-write tracker ---
		{
			const t = await createTestVault();
			const ctx = page(t);
			const ana = await t.addPerson("Ana", {});
			const a = await load(ctx, ana);
			const seen = [];
			t.vault.on("modify", (f) => {
				if (f.path === ana.path) seen.push(ctx.ownWrites.isOwn(f));
			});
			await writeIdeas(ctx, a, [{ category: "gift", text: "Socks", done: false }]);
			a.data.location = "Porto";
			await saveModel(ctx, a);
			eq("the page knows both writes as its own", seen, [true, true]);
			eq("and the model has what it wrote", a.bodyIdeas?.map((i) => i.text), ["Socks"]);
		}

		return result();
	})();
}
