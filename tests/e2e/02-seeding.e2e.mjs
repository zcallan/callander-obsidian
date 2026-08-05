import { createSuite } from "../harness.mjs";

/**
 * First-run seeding, against a genuinely empty vault.
 *
 * This is the one case Tier 2 cannot reach. `getContacts()` reads
 * frontmatter from the metadata cache rather than the file, and that cache
 * is filled by an async indexing pass — so a note written a moment ago may
 * not be in it yet. The fake vault updates synchronously and would report
 * success either way. Only a real Obsidian can prove the seeded friend is
 * actually visible on the *first* dashboard render rather than after a
 * close and reopen.
 *
 * ORDERING: this needs a pristine vault, so it must run before anything
 * that creates the base folder. Hence the numeric filename prefixes — the
 * suite shares one Obsidian instance, and one vault, across all files.
 */
export async function run({ cdp }) {
	const { eq, ok, result } = createSuite("first-run seeding (real)");

	// The vault starts empty, so this is a true fresh install.
	const before = await cdp.evaluate(() => ({
		files: window.app.vault.getMarkdownFiles().length,
		hasBase: !!window.app.vault.getAbstractFileByPath("Friends"),
	}));
	eq("vault starts empty", before.files, 0);
	eq("no base folder yet", before.hasBase, false);

	// Open the dashboard exactly as the ribbon icon does, then read what
	// that first render actually saw — not what a later refresh would.
	const seeded = await cdp.evaluate(async () => {
		const plugin = window.app.plugins.plugins.callander;
		await plugin.activateDashboard();

		const leaf = window.app.workspace
			.getLeavesOfType("callander-dashboard")
			.at(0);
		const view = leaf?.view;
		// `contacts` is the array the dashboard rendered from.
		return {
			opened: !!view,
			contactsOnFirstRender: (view?.contacts ?? []).map((c) => c.name),
			folders: [
				"Friends",
				"Friends/People",
				"Friends/Groups",
				"Friends/Plans",
				"Friends/Somedays",
				"Friends/Reminders",
			].map((p) => ({
				path: p,
				exists: !!window.app.vault.getAbstractFileByPath(p),
			})),
			exampleExists: !!window.app.vault.getAbstractFileByPath(
				"Friends/People/Example Friend.md"
			),
		};
	});

	eq("dashboard opened", seeded.opened, true);
	for (const { path, exists } of seeded.folders) {
		ok(`folder created: ${path}`, exists);
	}
	eq("example friend file created", seeded.exampleExists, true);

	// Everything below reads that file. If seeding didn't happen there's
	// nothing meaningful left to assert, and continuing would throw an
	// opaque null error rather than reporting the real problem.
	if (!seeded.exampleExists) return result();

	// The actual regression guard: present on the first render, with no
	// reopen and no manual refresh.
	eq(
		"example friend is visible on the first dashboard render",
		seeded.contactsOnFirstRender,
		["Example Friend"]
	);

	// Seeded dates should make the friend immediately useful.
	const fm = await cdp.evaluate(() => {
		const file = window.app.vault.getAbstractFileByPath(
			"Friends/People/Example Friend.md"
		);
		return window.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	});
	eq("name is set", fm.name, "Example Friend");
	ok("birthday is set", typeof fm.birthday === "string");
	ok("met is set", typeof fm.met === "string");

	const daysAway = Math.round(
		(new Date(`${fm.birthday}T00:00:00`) - new Date(`${fm.met}T00:00:00`)) /
			86400000
	);
	eq("birthday is 21 days after met (today)", daysAway, 21);

	// Re-running must not duplicate anything.
	const again = await cdp.evaluate(async () => {
		await window.app.plugins.plugins.callander.seedStarterVault();
		return window.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.startsWith("Friends/People/")).length;
	});
	eq("seeding twice does not duplicate the example friend", again, 1);

	return result();
}
