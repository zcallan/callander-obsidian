import type { EventRef } from "obsidian";
import type FriendTracker from "@/main";

/** A view (or any Component) that can own subscriptions for its lifetime. */
interface Registrar {
	registerEvent(ref: EventRef): void;
	register(cb: () => void): void;
}

/**
 * Re-render a view whenever anything under the base folder changes.
 *
 * Two event sources, and both are load-bearing:
 *
 * - `vault.on("modify")` fires when bytes reach disk.
 * - `metadataCache.on("changed")` fires once that file has been **reindexed**.
 *
 * Every view here renders from the metadata cache, never from file contents —
 * `getEvents()`, `getContacts()` and friends all read `getFileCache()`. So a
 * refresh driven only by the vault event re-reads the *pre-write* frontmatter
 * and faithfully redraws the row it was supposed to remove. The view then
 * looks stuck until some unrelated later change happens to trigger another
 * pass, which is exactly how cancelling an event left it sitting on the
 * dashboard until a reload or a tab switch.
 *
 * Listening to the cache as well means the last word always comes from a
 * reindexed cache. Refreshes are coalesced onto a short timer so the
 * modify-then-changed pair costs one rebuild rather than two, and so a burst
 * of writes — a rename touching several files, a sync landing, a plan
 * rewriting its timeline — settles before anything redraws.
 */
export function registerVaultRefresh(
	view: Registrar,
	plugin: FriendTracker,
	refresh: () => void,
	{ delay = 50, scope }: { delay?: number; scope?: (path: string) => boolean } = {}
): void {
	const inScope =
		scope ??
		((path: string) => path.startsWith(plugin.settings.baseFolder + "/"));

	let timer: number | null = null;
	const schedule = (path: string) => {
		if (!inScope(path)) return;
		if (timer !== null) window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			timer = null;
			refresh();
		}, delay);
	};
	// A queued refresh outliving the view would render into a detached
	// container and keep the closed view reachable. Cheap to prevent.
	view.register(() => {
		if (timer !== null) window.clearTimeout(timer);
	});

	const { vault, metadataCache } = plugin.app;
	view.registerEvent(vault.on("modify", (f) => schedule(f.path)));
	view.registerEvent(vault.on("create", (f) => schedule(f.path)));
	view.registerEvent(vault.on("delete", (f) => schedule(f.path)));
	view.registerEvent(
		vault.on("rename", (f, old) => {
			schedule(f.path);
			schedule(old);
		})
	);
	// The one that was missing everywhere: the cache is what these views
	// actually read, so it has to be what they listen to.
	view.registerEvent(metadataCache.on("changed", (f) => schedule(f.path)));
}
