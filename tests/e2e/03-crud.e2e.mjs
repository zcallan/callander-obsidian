import { createSuite } from "../harness.mjs";

/**
 * Add / edit / delete against real Obsidian.
 *
 * The fake vault covers this logic already, so what's actually under test
 * here is everything the fake can only approximate: Obsidian's own
 * `processFrontMatter` and its YAML serialiser, `vault.process`, and the
 * metadata cache catching up between writes. A migration that round-trips
 * perfectly through a stub can still mangle real YAML.
 *
 * Runs after seeding.e2e.mjs, so the vault already has its folders.
 */
export async function run({ cdp }) {
	const { eq, ok, result } = createSuite("crud (real Obsidian)");

	/**
	 * Wait for the metadata cache to catch up with a just-written file.
	 * Real indexing is async, so reading frontmatter straight after a write
	 * is a race — the very race this tier exists to exercise.
	 */
	const cacheReady = (path) =>
		cdp.waitFor(
			(p) => {
				const f = window.app.vault.getAbstractFileByPath(p);
				if (!f) return false;
				return !!window.app.metadataCache.getFileCache(f)?.frontmatter;
			},
			{ timeoutMs: 10000, label: `cache for ${path}`, args: [path] }
		);

	// ---------- create a friend ----------
	const created = await cdp.evaluate(async () => {
		const plugin = window.app.plugins.plugins.callander;
		const ops = plugin.contactOperations;
		await ops.ensurePeopleFolder();
		const path = "Friends/People/Test Person.md";
		const existing = window.app.vault.getAbstractFileByPath(path);
		if (existing) await window.app.vault.delete(existing);
		await window.app.vault.create(
			path,
			`---\nname: Test Person\nbirthday: 1994-07-26\nrelationship: friend\n---\n`
		);
		return { path };
	});
	await cacheReady(created.path);
	ok("friend file created", true);

	// ---------- add ideas through the real service ----------
	const added = await cdp.evaluate(async () => {
		const ops = window.app.plugins.plugins.callander.contactOperations;
		const file = window.app.vault.getAbstractFileByPath(
			"Friends/People/Test Person.md"
		);
		await ops.addIdea(file, "gift", "A nice mug");
		await ops.addIdea(file, "place", "Saltie Girl");
		const raw = await window.app.vault.read(file);
		return { ideas: await ops.readIdeas(file), raw };
	});
	eq(
		"both ideas persisted",
		added.ideas.map((i) => i.text),
		["A nice mug", "Saltie Girl"]
	);
	ok("ideas written to the note body", added.raw.includes("## Ideas"));
	ok("grouped under category headings", added.raw.includes("### 🎁 Gift"));
	ok(
		"not left in frontmatter",
		!/^ideas:/m.test(added.raw.split("---")[1] ?? "")
	);

	// ---------- edit ----------
	const edited = await cdp.evaluate(async () => {
		const ops = window.app.plugins.plugins.callander.contactOperations;
		const file = window.app.vault.getAbstractFileByPath(
			"Friends/People/Test Person.md"
		);
		const ideas = await ops.readIdeas(file);
		ideas[0] = { ...ideas[0], done: true, resurface: "2026-03" };
		await ops.writeIdeas(file, ideas);
		return {
			ideas: await ops.readIdeas(file),
			raw: await window.app.vault.read(file),
		};
	});
	eq("edit persisted through a real write", edited.ideas[0], {
		category: "gift",
		text: "A nice mug",
		done: true,
		resurface: "2026-03",
	});
	ok("written as a checked task", edited.raw.includes("- [x] A nice mug"));
	ok("resurface marker written", edited.raw.includes("⏳ 2026-03"));

	// ---------- frontmatter survives body writes ----------
	// Waited for, not read straight away: writeIdeas resolves when the bytes
	// reach disk, which is strictly before the metadata cache reindexes them.
	// Reading the cache immediately catches it mid-reindex often enough to
	// fail roughly one run in two, with both fields coming back undefined —
	// which reads like the write destroyed the frontmatter rather than like
	// a race. Polling until the entry is back is the same thing 04-event
	// does after its own write, and for the same reason.
	const fmIntact = await cdp.waitFor(
		() => {
			const file = window.app.vault.getAbstractFileByPath(
				"Friends/People/Test Person.md"
			);
			const fm = window.app.metadataCache.getFileCache(file)?.frontmatter;
			// Falsy until the reindex lands, so waitFor keeps polling; the
			// assertions below still decide whether the values are right.
			return fm && fm.name !== undefined ? fm : false;
		},
		{ timeoutMs: 10000, label: "the metadata cache to reindex after a body write" }
	);
	eq("name untouched by body writes", fmIntact.name, "Test Person");
	eq("birthday untouched", fmIntact.birthday, "1994-07-26");

	// ---------- delete ----------
	const deleted = await cdp.evaluate(async () => {
		const ops = window.app.plugins.plugins.callander.contactOperations;
		const file = window.app.vault.getAbstractFileByPath(
			"Friends/People/Test Person.md"
		);
		const ideas = await ops.readIdeas(file);
		await ops.writeIdeas(
			file,
			ideas.filter((i) => i.text !== "Saltie Girl")
		);
		const afterOne = await ops.readIdeas(file);
		await ops.writeIdeas(file, []);
		return {
			afterOne: afterOne.map((i) => i.text),
			afterAll: await ops.readIdeas(file),
			raw: await window.app.vault.read(file),
		};
	});
	eq("deleting one idea persists", deleted.afterOne, ["A nice mug"]);
	eq("deleting all leaves an empty list", deleted.afterAll, []);
	ok("empty section is removed entirely", !deleted.raw.includes("## Ideas"));
	ok(
		"frontmatter still intact after the section is gone",
		deleted.raw.includes("name: Test Person")
	);

	// ---------- drafts round-trip through real processFrontMatter ----------
	const drafts = await cdp.evaluate(async () => {
		const ops = window.app.plugins.plugins.callander.contactOperations;
		const file = window.app.vault.getAbstractFileByPath(
			"Friends/People/Test Person.md"
		);
		await ops.addDraft(file, "Half-formed thought");
		const withOne = await window.app.vault.read(file);
		await ops.removeDraft(file, 0);
		return { withOne, after: await window.app.vault.read(file) };
	});
	ok("draft written to frontmatter", drafts.withOne.includes("Half-formed thought"));
	ok(
		"removing the last draft deletes the key, not just its contents",
		!/^drafts:/m.test(drafts.after)
	);

	// ---------- clean up ----------
	await cdp.evaluate(async () => {
		const file = window.app.vault.getAbstractFileByPath(
			"Friends/People/Test Person.md"
		);
		if (file) await window.app.vault.delete(file);
	});
	const gone = await cdp.evaluate(
		() =>
			!window.app.vault.getAbstractFileByPath(
				"Friends/People/Test Person.md"
			)
	);
	eq("test file cleaned up", gone, true);

	return result();
}
