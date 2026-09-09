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

/**
 * Open the plugin's own settings tab.
 *
 * `app.setting` isn't in the public typings, but this is capture tooling
 * rather than plugin code, and a missing API bows out as a skip.
 */
const openSettings = () =>
	`async () => {
		const setting = window.app.setting;
		if (!setting) return "no settings API on this build";
		await setting.open();
		setting.openTabById("callander");
	}`;

/**
 * Put a settings heading at the top of the frame.
 *
 * The shooter's own `scroll` finds a scroller inside the active workspace
 * leaf, and a modal isn't in one — so settings shots scroll themselves and
 * set `noScrollReset`.
 */
const scrollSettingsTo = (heading) =>
	`async () => {
		const root = document.querySelector(".modal-container .vertical-tab-content")
			?? document.querySelector(".modal-container");
		if (!root) return "settings never opened";
		const scrollers = [root, ...root.querySelectorAll("*")].filter(
			(el) => el.scrollHeight > el.clientHeight + 20
		);
		const scroller = scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
		if (!scroller) return "settings tab does not scroll";
		const label = ${JSON.stringify(heading)};
		const el = [...scroller.querySelectorAll("*")].find(
			(n) => n.children.length === 0 && (n.textContent || "").trim() === label
		);
		if (!el) return "no settings heading " + label;
		scroller.scrollTop +=
			el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16;
	}`;

/**
 * Put one of the cost breakdown's sub-headings at the top of the frame.
 *
 * The shooter's own `scrollTo` only looks at h1-h4, and these are divs —
 * they're section dividers rather than document structure.
 */
const scrollToSubHeading = (text) =>
	`async () => {
		const label = ${JSON.stringify(text)};
		const el = [...document.querySelectorAll(".callander-subheading")].find(
			(n) => (n.textContent || "").includes(label)
		);
		if (!el) return "no sub-heading " + label;
		el.scrollIntoView({ block: "center" });
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
	// The other two tabs. Matched on the apostrophe-free part of the label,
	// since the button renders a typographic apostrophe the regex would miss.
	{
		name: "all-friends-2",
		setup: steps(
			command("callander:open-friends-table"),
			clickButton("day Timeline")
		),
	},
	{
		name: "all-friends-3",
		setup: steps(
			command("callander:open-friends-table"),
			clickButton("day Calendar")
		),
	},
	{ name: "somedays-1", setup: command("callander:open-somedays") },
	// Events opens on its Timeline, so events-1 is that; these are the rest.
	{ name: "events-1", setup: command("callander:open-events") },
	{
		name: "events-2",
		setup: steps(command("callander:open-events"), clickButton("^Calendar$")),
	},
	{
		name: "events-3",
		setup: steps(command("callander:open-events"), clickButton("^List$")),
	},
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
		// "Who owes what" is no longer behind a disclosure — it just needs
		// scrolling into frame. Anchored on the sub-heading rather than a
		// pixel offset, since the number of expenses above it moves with the
		// seed data.
		name: "plan-who-owes-1",
		setup: steps(openNote("plan"), scrollToSubHeading("Who owes what")),
		noScrollReset: true,
	},
	{
		// The per-person working. The per-row "Breakdown" button is gone —
		// the row itself opens it now, so this clicks the row rather than
		// searching for a button that no longer exists.
		name: "plan-breakdown-1",
		setup: steps(
			openNote("plan"),
			`async () => {
				// Not your own row: yours has no tick boxes and no settle
				// action, since you can't owe yourself — which makes it the
				// least representative version of this modal to photograph.
				const row = document.querySelector(
					".expense-owed-row.is-clickable:not(.is-you)"
				);
				if (!row) return "nobody but you owes anything on this plan";
				row.click();
			}`
		),
		noScrollReset: true,
	},

	// ── Settings ─────────────────────────────────────────────────────────
	// Two frames: the top of the tab, then the part that most needs showing
	// — the ribbon toggles and the draggable dashboard order. Both scroll
	// themselves, since the shooter's scroller lives in a workspace leaf and
	// this is a modal.
	{ name: "settings-1", setup: openSettings(), noScrollReset: true },
	{
		name: "settings-2",
		setup: steps(openSettings(), scrollSettingsTo("Quick actions")),
		noScrollReset: true,
	},
];
