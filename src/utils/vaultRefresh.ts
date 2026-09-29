import type { App, EventRef, Events } from "obsidian";

/** What the refresh helpers read from the plugin. */
export interface RefreshHost {
	app: App;
	settings: { baseFolder: string };
	/** The plugin's broadcast: "settings-changed" fires after every save,
	 * "day-changed" when the local date turns over. */
	events: Events;
}

/** How long events are gathered before one refresh answers them all. */
const REFRESH_COALESCE_MS = 50;

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
	plugin: Pick<RefreshHost, "app" | "settings">,
	refresh: () => void,
	{
		delay = REFRESH_COALESCE_MS,
		scope,
	}: { delay?: number; scope?: (path: string) => boolean } = {}
): void {
	const inScope =
		scope ?? ((path: string) => isInFolder(path, plugin.settings.baseFolder));

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

/**
 * A page's whole refresh wiring: settings changes and the day turning over,
 * which are both read at render time and so have to be heard, plus
 * registerVaultRefresh. The pair CLAUDE.md says always go together, in one
 * call. Without the day, a page left open overnight kept yesterday's
 * "Today" until something in the vault happened to change.
 */
export function registerPageRefresh(
	view: Registrar,
	plugin: RefreshHost,
	refresh: () => void,
	options: { scope?: (path: string) => boolean } = {}
): void {
	view.registerEvent(plugin.events.on("settings-changed", refresh));
	view.registerEvent(plugin.events.on("day-changed", refresh));
	registerVaultRefresh(view, plugin, refresh, options);
}

/** A scope for registerVaultRefresh: any of these folders, or inside one. */
export function inFolders(...folders: string[]): (path: string) => boolean {
	return (path) => folders.some((f) => isInFolder(path, f));
}

/**
 * Whether `path` is `folder` or inside it. The vault root — offered by the
 * folder picker, and what an emptied setting becomes — holds everything:
 * checked as `startsWith("/" + "/")` it matched nothing, and every page
 * stopped refreshing.
 */
export function isInFolder(path: string, folder: string): boolean {
	const f = folder.replace(/\/+$/, "");
	return f === "" || path === f || path.startsWith(f + "/");
}
