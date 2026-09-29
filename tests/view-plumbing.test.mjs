import { createSuite } from "./harness.mjs";
import { inFolders, newRandomSeed, registerPageRefresh, weekStartsOn } from "./.build/callander.mjs";

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

	eq("settings, then the vault and the cache, all owned by the view", registered, ["settings-changed", "modify", "create", "delete", "rename", "changed"]);
	fire("events", "settings-changed");
	eq("a settings change refreshes at once", refreshes, 1);
	fire("cache", "changed", { path: "Friends/Plans/Trip.md" });
	fire("cache", "changed", { path: "Friends/People/Ann.md" });
	await new Promise((r) => setTimeout(r, 80));
	eq("a change in scope refreshes; one outside doesn't", refreshes, 2);

	const scope = inFolders("A/B", "C");
	eq("inFolders: the folder itself or anything in it", ["A/B", "A/B/x.md", "A/BC/x.md", "C/d/e.md", "Cx.md"].map(scope), [true, true, false, true, false]);

	eq("the week starts Sunday only when set so", [0, 1, 6, 3].map((n) => weekStartsOn({ weekStartsOn: n })), [0, 1, 1, 1]);
	const seed = newRandomSeed();
	ok("a seed is a non-negative 31-bit integer", Number.isInteger(seed) && seed >= 0 && seed < 2 ** 31);
	return result();
}
