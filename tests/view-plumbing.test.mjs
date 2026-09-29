import { createSuite } from "./harness.mjs";
import { inFolders, newDayCheck, newRandomSeed, registerPageRefresh, SearchBox, weekStartsOn } from "./.build/callander.mjs";

/** What every page's wiring shares: refresh subscriptions, scope, week start. */
export async function run() {
	const { eq, ok, result } = createSuite("view plumbing");

	const bags = { vault: new Map(), cache: new Map(), events: new Map() };
	const emitter = (bag) => ({
		on(name, cb) {
			if (!bag.has(name)) bag.set(name, []);
			bag.get(name).push(cb);
			return { name, cb };
		},
	});
	const fire = (bag, name, ...args) => (bags[bag].get(name) ?? []).forEach((cb) => cb(...args));
	let refreshes = 0;
	const registered = [];
	const view = { registerEvent: (ref) => registered.push(ref.name), register() {} };
	const plugin = {
		settings: { baseFolder: "Friends" },
		events: emitter(bags.events),
		app: { vault: emitter(bags.vault), metadataCache: emitter(bags.cache) },
	};
	registerPageRefresh(view, plugin, () => refreshes++, { scope: inFolders("Friends/Plans") });

	eq("settings and the day, then the vault and the cache, all owned by the view", registered, ["settings-changed", "day-changed", "modify", "create", "delete", "rename", "changed"]);
	fire("events", "settings-changed");
	eq("a settings change refreshes at once", refreshes, 1);
	fire("events", "day-changed");
	eq("so does the day turning over", refreshes, 2);
	fire("cache", "changed", { path: "Friends/Plans/Trip.md" });
	fire("cache", "changed", { path: "Friends/People/Ann.md" });
	await new Promise((r) => setTimeout(r, 80));
	eq("a change in scope refreshes; one outside doesn't", refreshes, 3);

	// What main.ts polls each minute to fire "day-changed".
	{
		const days = ["2026-09-28", "2026-09-28", "2026-09-29", "2026-09-29", "2026-09-28"];
		let i = 0;
		let turned = 0;
		const check = newDayCheck(() => turned++, () => days[i++]);
		const seen = [];
		for (let n = 0; n < 4; n++) {
			check();
			seen.push(turned);
		}
		// The last is the clock going back a day (a time zone change): a
		// different day all the same, and "today" has moved.
		eq("the day check fires once per new day, and not at all within one", seen, [0, 1, 1, 2]);
	}

	const scope = inFolders("A/B", "C");
	eq("inFolders: the folder itself or anything in it", ["A/B", "A/B/x.md", "A/BC/x.md", "C/d/e.md", "Cx.md"].map(scope), [true, true, false, true, false]);

	eq("the week starts Sunday only when set so", [0, 1, 6, 3].map((n) => weekStartsOn({ weekStartsOn: n })), [0, 1, 1, 1]);
	const seed = newRandomSeed();
	ok("a seed is a non-negative 31-bit integer", Number.isInteger(seed) && seed >= 0 && seed < 2 ** 31);
	// ---------- SearchBox: a refresh mid-search keeps the caret ----------
	{
		const doc = { activeElement: null };
		const body = { tag: "body" };
		const parent = {
			built: [],
			createEl(tag, opts) {
				const el = {
					tag, opts, value: "", ownerDocument: doc, listeners: [], focusedWith: [],
					selectionStart: 0, selectionEnd: 0, selectionDirection: "none",
					addEventListener(type, cb) { this.listeners.push([type, cb]); },
					focus(o) { doc.activeElement = el; this.focusedWith.push(o); },
					setSelectionRange(s, e, d) { Object.assign(this, { selectionStart: s, selectionEnd: e, selectionDirection: d }); },
				};
				this.built.push(el);
				return el;
			},
		};
		// What a page's render does: empty (focus falls to the body), rebuild.
		const redraw = (box, value) => {
			doc.activeElement = body;
			return box.build(parent, { placeholder: "Search…", cls: "s", value, onInput: (v) => typed.push(v) });
		};
		const typed = [];
		const box = new SearchBox();
		const first = redraw(box, "ri");
		eq("the box starts from the query", [first.value, first.opts.attr.placeholder, first.opts.cls], ["ri", "Search…", "s"]);
		first.value = "ril";
		first.listeners.find(([t]) => t === "input")[1]();
		eq("typing reports the value", typed, ["ril"]);
		eq("a first build takes no focus", first.focusedWith.length, 0);

		// Focused, with part of the word selected backwards, when a sync lands.
		first.focus();
		first.setSelectionRange(1, 3, "backward");
		box.hold();
		const second = redraw(box, "ril");
		eq("a held box's successor takes the focus, without scrolling", second.focusedWith, [{ preventScroll: true }]);
		eq("...and the same selection", [second.selectionStart, second.selectionEnd, second.selectionDirection], [1, 3, "backward"]);

		// One hold, one restore: a later rebuild with nothing held stays put.
		const third = redraw(box, "ril");
		eq("a hold is spent by the build it was for", third.focusedWith.length, 0);

		// Focus elsewhere on the page when the refresh lands: leave it there.
		const fourth = redraw(box, "ril");
		doc.activeElement = { tag: "button" };
		box.hold();
		const fifth = redraw(box, "ril");
		eq("a box without focus isn't given it", [fourth.focusedWith.length, fifth.focusedWith.length], [0, 0]);
	}

	return result();
}
