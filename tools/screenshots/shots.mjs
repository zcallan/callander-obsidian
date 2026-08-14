/**
 * The shot list: what to photograph, and how to get the app there.
 *
 * Each shot's `setup` is serialised and run *inside* Obsidian's renderer, so
 * it can't close over anything here — it gets `{ paths }` as its only
 * argument. Returning a string marks the shot as skipped with that reason,
 * which is how a shot for a feature that isn't in this build bows out
 * instead of failing the run.
 *
 * `scroll` runs after setup and before the shutter: a number scrolls the
 * view's scroller by that many pixels, "end" goes to the bottom.
 */

export const PATHS = {
	person: "Friends/People/George Orwell.md",
	plan: "Friends/Plans/🍁 Leaf-peeping in the White Mountains.md",
	group: "Friends/Groups/Book club.md",
	someday: "Friends/Somedays/Kayak the Charles at golden hour.md",
};

/** Open one of the seeded notes, letting the plugin route it to its view. */
const openNote = (key) =>
	`async ({ paths }) => {
		const file = window.app.vault.getAbstractFileByPath(paths[${JSON.stringify(key)}]);
		if (!file) return "missing note: " + paths[${JSON.stringify(key)}];
		await window.app.workspace.getLeaf(false).openFile(file);
	}`;

/** Fire a plugin command by id. */
const command = (id) =>
	`async () => {
		if (!window.app.commands.commands[${JSON.stringify(id)}]) return "no command " + ${JSON.stringify(id)};
		window.app.commands.executeCommandById(${JSON.stringify(id)});
	}`;

/**
 * Click a button by its visible label, within an optional scope. Used for
 * the modals that have no command of their own — they're only reachable
 * from a button on a view.
 */
const clickButton = (label, scope = "body") =>
	`async () => {
		const root = document.querySelector(${JSON.stringify(scope)});
		if (!root) return "no scope " + ${JSON.stringify(scope)};
		const re = new RegExp(${JSON.stringify(label)}, "i");
		// Rows in these views are divs, not buttons, so cast wide and then
		// pick the most specific hit — the shortest text that still matches,
		// which is the row itself rather than the section wrapping it.
		const candidates = [...root.querySelectorAll(
			'button, a, [class*="row"], [class*="chip"], [class*="item"], [class*="clickable"]'
		)].filter((el) => re.test((el.textContent || "").trim()));
		const el = candidates.sort(
			(a, b) => (a.textContent || "").length - (b.textContent || "").length
		)[0];
		if (!el) return "no button matching " + ${JSON.stringify(label)};
		el.click();
	}`;

/** Do several in-renderer steps in order. */
const steps = (...fns) =>
	`async (ctx) => {
		for (const fn of [${fns.join(",")}]) {
			const r = await fn(ctx);
			if (typeof r === "string") return r;
			// Views finish rendering asynchronously; a shorter wait here made
			// the click land before the rows existed.
			await new Promise((res) => setTimeout(res, 1400));
		}
	}`;

export const SHOTS = [

	// ── Views ────────────────────────────────────────────────────────────
	// Anchored to their headings rather than to pixel offsets: the dashboard's
	// height moves with the seed data, and a fixed offset had been slicing the
	// Upcoming section in half between two shots.
	// Four frames, each anchored to a heading rather than a pixel offset: the
	// dashboard's height moves with the seed data, and fixed offsets had been
	// slicing the Upcoming section in half between two shots. Anchors must be
	// distinctive — "Upcoming" alone also matches "Upcoming birthdays".
	{ name: "dashboard-1", setup: command("callander:open-dashboard") },
	{ name: "dashboard-2", setup: command("callander:open-dashboard"), scrollTo: "Upcoming birthdays" },
	{ name: "dashboard-3", setup: command("callander:open-dashboard"), scrollTo: "Plans" },
	{ name: "dashboard-4", setup: command("callander:open-dashboard"), scroll: "end" },
	{ name: "all-friends-1", setup: command("callander:open-friends-table") },
	{ name: "somedays-1", setup: command("callander:open-somedays") },
	{ name: "events-1", setup: command("callander:open-events") },
	{ name: "diary-1", setup: command("callander:open-diary") },

	{ name: "person-1", setup: openNote("person") },
	{ name: "person-2", setup: openNote("person"), scroll: 900 },
	{ name: "person-3", setup: openNote("person"), scroll: "end" },

	{ name: "plan-1", setup: openNote("plan") },
	{ name: "plan-2", setup: openNote("plan"), scroll: 550 },
	{ name: "plan-3", setup: openNote("plan"), scroll: 1100 },
	{ name: "plan-4", setup: openNote("plan"), scroll: 1650 },
	{ name: "plan-5", setup: openNote("plan"), scroll: "end" },

	{ name: "group-1", setup: openNote("group") },

	// ── Modals reachable by command ──────────────────────────────────────
	{ name: "add-friend-1", setup: command("callander:add-friend") },
	{ name: "add-event-1", setup: command("callander:add-event") },
	{ name: "add-somedays-1", setup: command("callander:add-someday") },
	{ name: "quick-note-1", setup: command("callander:quick-note") },

	// ── Modals reachable only from a view's buttons ──────────────────────
	{
		name: "add-plan-1",
		setup: steps(command("callander:open-dashboard"), clickButton("^New plan$")),
	},
	{
		name: "someday-view-1",
		setup: steps(command("callander:open-somedays"), clickButton("Kayak the Charles")),
	},

	// ── Expense splitting, one shot per mode ─────────────────────────────
	// Each opens a seeded expense for editing, so the form is populated with
	// three named people rather than being an empty "add" form.
	{
		name: "expense-split-even-1",
		setup: steps(
			command("callander:open-dashboard"),
			clickButton("Taxi back from the Wilbur"),
			clickButton("^Edit$")
		),
	},
	{
		name: "expense-split-percent-1",
		setup: steps(
			command("callander:open-dashboard"),
			clickButton("Groceries for book club"),
			clickButton("^Edit$")
		),
	},
	{
		name: "expense-split-receipt-1",
		setup: steps(
			command("callander:open-dashboard"),
			clickButton("Dinner at Neptune Oyster"),
			clickButton("^Edit$")
		),
	},

	// ── Building out a plan ──────────────────────────────────────────────
	{
		name: "plan-add-idea-1",
		setup: steps(openNote("plan"), clickButton("^Add idea$")),
	},
	{
		name: "plan-add-travel-1",
		setup: steps(openNote("plan"), clickButton("^Add travel$")),
	},
	{
		name: "plan-add-accommodation-1",
		setup: steps(openNote("plan"), clickButton("^Add accommodation$")),
	},
	{
		// "Who owes what" is a <details>, collapsed by default — open it and
		// scroll it into frame rather than clicking, which would toggle
		// whatever else matched.
		name: "plan-who-owes-1",
		setup: steps(
			openNote("plan"),
			`async () => {
				const details = [...document.querySelectorAll("details.expense-summary")];
				if (details.length === 0) return "no expense summary on the page";
				for (const d of details) d.open = true;
				details[0].scrollIntoView({ block: "center" });
			}`
		),
		noScrollReset: true,
	},
	{
		// The per-person working: expand the summary, then open one person's
		// Breakdown from it.
		name: "plan-breakdown-1",
		setup: steps(
			openNote("plan"),
			`async () => {
				const details = [...document.querySelectorAll("details.expense-summary")];
				if (details.length === 0) return "no expense summary on the page";
				for (const d of details) d.open = true;
			}`,
			clickButton("^Breakdown$", "details.expense-summary")
		),
		noScrollReset: true,
	},
];
