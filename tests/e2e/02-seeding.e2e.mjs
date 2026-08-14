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
				"Friends/Events",
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

	// ---------- the React island actually mounts ----------
	// The Expenses section is rendered by React inside the dashboard. A
	// mount failure is silent — the section is simply absent — and nothing
	// else in the suite would notice, so it's asserted here where a
	// dashboard is already open.
	const react = await cdp.evaluate(async () => {
		await window.app.plugins.plugins.callander.activateDashboard();
		// The root renders on the same tick the view renders; give the
		// commit a frame rather than racing it.
		await new Promise((r) => requestAnimationFrame(() => r(null)));
		const host = document.querySelector(".callander-react-root");
		return {
			hostPresent: !!host,
			// React renders into the host; empty means it mounted but threw.
			hasContent: !!host && host.childElementCount > 0,
			headings: [...(host?.querySelectorAll("h3") ?? [])].map(
				(h) => h.textContent
			),
			addButton: [...(host?.querySelectorAll("button") ?? [])].some((b) =>
				/new expense/i.test(b.textContent ?? "")
			),
		};
	});

	ok("React root is mounted in the dashboard", react.hostPresent);
	ok("...and rendered something", react.hasContent);
	eq("...both ported sections", react.headings, [
		"📌 Upcoming",
		"💵 Expenses",
	]);
	ok("...with its New expense button", react.addButton);

	// Closing the tab must take the root with it. A leaked root keeps its
	// vault subscriptions and renders into detached DOM — invisible until
	// something writes and a stale tree throws.
	const cycle = await cdp.evaluate(async () => {
		const type = "callander-dashboard";
		const frame = () =>
			new Promise((r) => requestAnimationFrame(() => r(null)));

		window.app.workspace.getLeavesOfType(type).forEach((l) => l.detach());
		await frame();
		const afterClose = document.querySelectorAll(
			".callander-react-root"
		).length;

		await window.app.plugins.plugins.callander.activateDashboard();
		await frame();
		const afterReopen = document.querySelectorAll(
			".callander-react-root"
		).length;

		return { afterClose, afterReopen };
	});

	eq("closing the tab removes the React host", cycle.afterClose, 0);
	// Exactly one: a second host would mean the previous root was never
	// unmounted and its DOM was left in place.
	eq("reopening mounts exactly one root", cycle.afterReopen, 1);

	// ---------- React reacts to a write, with no manual refresh ----------
	// The point of the migration, and the thing most likely to quietly not
	// work: a modal writes to disk, and the dashboard behind it updates on
	// its own. Nothing here calls refresh() — if the row disappears, it's
	// because the vault event bumped the store and React re-rendered.
	const live = await cdp.evaluate(async () => {
		const plugin = window.app.plugins.plugins.callander;
		const frame = () =>
			new Promise((r) => requestAnimationFrame(() => r(null)));
		const settle = async () => {
			// A write lands, then the metadata cache reindexes, then React
			// commits. Give all three a moment rather than racing them.
			for (let i = 0; i < 40; i++) await frame();
		};

		const NAME = "Reactivity probe";
		const future = new Date();
		future.setDate(future.getDate() + 3);
		const pad = (n) => String(n).padStart(2, "0");
		const date = `${future.getFullYear()}-${pad(
			future.getMonth() + 1
		)}-${pad(future.getDate())}`;

		await plugin.eventOperations.createEvent({ name: NAME, date });
		await plugin.activateDashboard();
		await settle();

		const rowText = () =>
			document.querySelector(".callander-react-root")?.textContent ?? "";

		const beforeCancel = rowText().includes(NAME);

		// Cancel it exactly the way the view modal does — no refresh call.
		const file = plugin.eventOperations
			.getEvents()
			.find((e) => e.name === NAME).file;
		await plugin.eventOperations.setStatus(file, "cancelled");
		await settle();
		const afterCancel = rowText().includes(NAME);

		// And back again, to prove it's genuinely reactive rather than a
		// one-way teardown.
		await plugin.eventOperations.setStatus(file, "open");
		await settle();
		const afterRestore = rowText().includes(NAME);

		return { beforeCancel, afterCancel, afterRestore };
	});

	ok("an upcoming event renders in the React section", live.beforeCancel);
	ok("cancelling removes it with no manual refresh", !live.afterCancel);
	ok("restoring brings it back", live.afterRestore);

	return result();
}
