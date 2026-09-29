import { createSuite } from "./harness.mjs";
import { gatherDashboard } from "./.build/callander.mjs";
import { createTestVault } from "./vault.mjs";

/**
 * What the dashboard reads before it draws. Its render used to await these
 * section by section, so two refreshes could interleave and draw sections
 * twice; gathered up front, the render never awaits.
 */
export function run() {
	const { eq, result } = createSuite("dashboard snapshot");

	return (async () => {
		// --- one read of each ---
		{
			const t = await createTestVault({ showGettingStarted: true });
			await t.vault.create(
				"Friends/Dashboard.md",
				"---\nkind: dashboard\nideas:\n  - category: gift\n    text: A good pen\n    done: false\n---\n"
			);
			const ana = await t.addPerson("Ana", { relationship: "friend" });
			await t.contacts.addDraft("Ask about the move", ana);
			const data = await gatherDashboard(t.plugin);
			eq("the friends", data.contacts.map((c) => c.name), ["Ana"]);
			eq("the drafts", data.drafts.map((d) => d.text), ["Ask about the move"]);
			eq("the inbox", data.inboxIdeas.map((i) => i.text), ["A good pen"]);
			eq(
				"a draft ticks Getting started's Quick note",
				data.gettingStartedDone.includes("quickNote"),
				true
			);
		}

		// --- a note that synced in with drafts in frontmatter is carried over first ---
		{
			const t = await createTestVault();
			await t.addPerson("Bo", {
				drafts: [{ text: "Bring the tent back", created: "2026-09-01" }],
			});
			const data = await gatherDashboard(t.plugin);
			eq(
				"its draft is on the checklist the dashboard reads",
				data.drafts.map((d) => d.text),
				["Bring the tent back"]
			);
		}

		// --- Getting started is worked out, and remembered, before drawing ---
		{
			const t = await createTestVault({
				showGettingStarted: true,
				gettingStartedDone: [],
			});
			await t.addPerson("Ana", {});
			const saves = t.plugin.saved;
			const first = await gatherDashboard(t.plugin);
			eq("a friend and your name count", first.gettingStartedDone, ["friend", "name"]);
			eq("and are remembered", t.plugin.settings.gettingStartedDone, ["friend", "name"]);
			eq("with one save", t.plugin.saved - saves, 1);
			await gatherDashboard(t.plugin);
			eq("nothing new, nothing saved", t.plugin.saved - saves, 1);
		}

		// --- hidden, it isn't worked out at all ---
		{
			const t = await createTestVault({ showGettingStarted: false });
			await t.addPerson("Ana", {});
			const saves = t.plugin.saved;
			const data = await gatherDashboard(t.plugin);
			eq("no steps", data.gettingStartedDone, []);
			eq("and no save", t.plugin.saved - saves, 0);
		}

		return result();
	})();
}
