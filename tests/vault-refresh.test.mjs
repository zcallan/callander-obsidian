import { createSuite } from "./harness.mjs";
import { registerVaultRefresh } from "./.build/callander.mjs";

// The helper schedules through window timers, as Obsidian code does.
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;

/**
 * Every view renders from the metadata cache but used to listen only to
 * `vault.on("modify")` — which fires *before* the cache reindexes. A refresh
 * driven by it alone re-reads the pre-write frontmatter, so cancelling an
 * event redrew the row it was meant to remove and the view sat stale until
 * an unrelated change came along.
 *
 * These tests exist to keep the cache subscription from being dropped again;
 * it's invisible until someone actually writes to disk and watches.
 */
export function run() {
	const { eq, ok, result } = createSuite("vault refresh");

	const harness = ({ scope } = {}) => {
		const bags = { vault: new Map(), cache: new Map() };
		const emitter = (bag) => ({
			on(name, cb) {
				if (!bag.has(name)) bag.set(name, []);
				bag.get(name).push(cb);
				return { name, cb };
			},
		});
		const fire = (bag, name, ...args) =>
			(bags[bag].get(name) ?? []).forEach((cb) => cb(...args));

		let refreshes = 0;
		const cleanups = [];
		const view = {
			registerEvent() {},
			register: (cb) => cleanups.push(cb),
		};
		const plugin = {
			settings: { baseFolder: "Friends" },
			app: {
				vault: emitter(bags.vault),
				metadataCache: emitter(bags.cache),
			},
		};

		registerVaultRefresh(view, plugin, () => refreshes++, {
			delay: 5,
			scope,
		});

		return {
			vault: (name, ...a) => fire("vault", name, ...a),
			cache: (name, ...a) => fire("cache", name, ...a),
			close: () => cleanups.forEach((cb) => cb()),
			settle: () => new Promise((r) => setTimeout(r, 25)),
			count: () => refreshes,
		};
	};

	const file = (path) => ({ path });

	return (async () => {
		// --- the regression itself ---
		{
			const h = harness();
			h.cache("changed", file("Friends/Events/Dinner.md"));
			await h.settle();
			eq("a metadata cache reindex triggers a refresh", h.count(), 1);
		}

		// A vault write alone must still work — it's the backstop for changes
		// that never produce a cache event (a delete, say).
		{
			const h = harness();
			h.vault("delete", file("Friends/Events/Dinner.md"));
			await h.settle();
			eq("a vault delete triggers a refresh", h.count(), 1);
		}

		// --- coalescing: the modify/changed pair is one rebuild, not two ---
		{
			const h = harness();
			h.vault("modify", file("Friends/Events/Dinner.md"));
			h.cache("changed", file("Friends/Events/Dinner.md"));
			await h.settle();
			eq("a write and its reindex coalesce into one refresh", h.count(), 1);
		}

		// ...and the coalesced refresh must land *after* the cache event, or
		// it re-reads stale frontmatter — the whole point of the fix.
		{
			const h = harness();
			let sawCacheFirst = false;
			h.vault("modify", file("Friends/Events/Dinner.md"));
			h.cache("changed", file("Friends/Events/Dinner.md"));
			sawCacheFirst = h.count() === 0;
			await h.settle();
			ok("no refresh runs before the reindex is heard", sawCacheFirst);
		}

		// --- scoping ---
		{
			const h = harness();
			h.cache("changed", file("Other/Notes/Scratch.md"));
			h.vault("modify", file("Other/Notes/Scratch.md"));
			await h.settle();
			eq("changes outside the base folder are ignored", h.count(), 0);
		}

		{
			// A file named like the folder but not inside it.
			const h = harness();
			h.cache("changed", file("Friendship.md"));
			await h.settle();
			eq("a sibling path sharing the prefix is ignored", h.count(), 0);
		}

		{
			const h = harness({ scope: (p) => p.startsWith("Friends/Events/") });
			h.cache("changed", file("Friends/Somedays/Trip.md"));
			await h.settle();
			eq("a caller-supplied scope narrows it", h.count(), 0);
			h.cache("changed", file("Friends/Events/Dinner.md"));
			await h.settle();
			eq("...and still fires inside that scope", h.count(), 1);
		}

		// --- rename sees both ends ---
		{
			const h = harness();
			h.vault("rename", file("Elsewhere/Moved.md"), "Friends/Events/Old.md");
			await h.settle();
			eq("a rename out of scope still refreshes", h.count(), 1);
		}

		// --- teardown ---
		{
			const h = harness();
			h.cache("changed", file("Friends/Events/Dinner.md"));
			h.close();
			await h.settle();
			eq("a queued refresh is dropped when the view closes", h.count(), 0);
		}

		return result();
	})();
}
