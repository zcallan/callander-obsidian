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
		// A timer, not requestAnimationFrame: rAF doesn't tick while the
		// window is occluded, which an unattended run frequently is, and the
		// wait would simply never resolve.
		await new Promise((r) => setTimeout(r, 50));
		// One island per ported section, each its own root — so query all of
		// them rather than assuming a single host.
		const hosts = [...document.querySelectorAll(".callander-react-root")];
		const within = (sel) => hosts.flatMap((h) => [...h.querySelectorAll(sel)]);
		return {
			hostPresent: hosts.length > 0,
			// React renders into each host; empty means it mounted but threw.
			hasContent: hosts.every((h) => h.childElementCount > 0),
			headings: within("h3").map((h) => h.textContent),
			addButton: within("button").some((b) =>
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
		const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));

		const count = () =>
			document.querySelectorAll(".callander-react-root").length;
		const before = count();

		window.app.workspace.getLeavesOfType(type).forEach((l) => l.detach());
		await tick();
		const afterClose = count();

		await window.app.plugins.plugins.callander.activateDashboard();
		await tick();
		const afterReopen = count();

		return { before, afterClose, afterReopen };
	});

	eq("closing the tab removes every React host", cycle.afterClose, 0);
	// Same count as before, not more: an extra host would mean a previous
	// root was never unmounted and its DOM was left behind. Compared rather
	// than hardcoded, so porting another section doesn't break this.
	eq(
		"reopening mounts the same number of roots",
		cycle.afterReopen,
		cycle.before
	);

	// ---------- React reacts to a write, with no manual refresh ----------
	// The point of the migration, and the thing most likely to quietly not
	// work: a modal writes to disk, and the dashboard behind it updates on
	// its own. Nothing here calls refresh() — if the row disappears, it's
	// because the vault event bumped the store and React re-rendered.
	const live = await cdp.evaluate(async () => {
		const plugin = window.app.plugins.plugins.callander;
		const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
		const settle = async () => {
			// A write lands, then the metadata cache reindexes, then React
			// commits. One wait long enough to cover all three, rather than
			// a spin that depends on the window being painted.
			await tick(600);
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

		// Deliberately NOT driving the modal UI here: a modal left open by a
		// missed selector blocks every test after it. The service call is
		// the same write the Cancel button makes, and the regression this
		// guards is about what happens *after* the write — see the island
		// identity check below, which is where the bug actually lived.
		const file = plugin.eventOperations
			.getEvents()
			.find((e) => e.name === NAME).file;

		// Capture the island node so we can prove it survives the dashboard
		// re-render the write triggers.
		const hostBefore = document.querySelector(".callander-react-root");

		await plugin.eventOperations.setStatus(file, "cancelled");
		await settle();
		const afterCancel = rowText().includes(NAME);
		const hostAfter = document.querySelector(".callander-react-root");
		// Same node, not a replacement. A recreated island means a remounted
		// root, which resubscribes too late to hear the metadata cache catch
		// up — the row then lingers until some unrelated change arrives.
		const hostSurvived = hostBefore === hostAfter && !!hostAfter;

		// And back again, to prove it's genuinely reactive rather than a
		// one-way teardown. Through the service this time — the modal shut
		// itself on Cancel.
		await plugin.eventOperations.setStatus(file, "open");
		await settle();
		const afterRestore = rowText().includes(NAME);

		return { beforeCancel, afterCancel, afterRestore, hostSurvived };
	});

	ok("an upcoming event renders in the React section", live.beforeCancel);
	ok("cancelling removes it with no manual refresh", !live.afterCancel);
	ok("restoring brings it back", live.afterRestore);
	ok(
		"the React island survives the re-render rather than remounting",
		live.hostSurvived
	);

	return result();
}
