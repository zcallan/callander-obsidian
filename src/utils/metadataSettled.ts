import type { App } from "obsidian";

/**
 * Resolves once the metadata cache has caught up with a write.
 *
 * Obsidian indexes frontmatter on an async pass, so anything that reads
 * through `metadataCache` — `getReminders()`, `getContacts()` — can run
 * before the write it just made is visible, and quietly render stale data.
 *
 * Two modes:
 *
 *   metadataSettled(app, path)              // any re-index of this file
 *   metadataSettled(app, path, { until })   // until the cache says `until`
 *
 * Prefer `until` whenever the caller knows what it wrote. Waiting for "an
 * index event happened" is not enough when a file is written twice in
 * quick succession — creating a reminder does exactly that, `vault.create`
 * then `processFrontMatter` — because the *first* write's event can land
 * after the second write was issued and resolve the wait against
 * frontmatter that is still missing the fields from it.
 *
 * Both modes time out rather than hanging: a write that changes nothing
 * emits no event, and a caller must not block forever waiting for one.
 */
export function metadataSettled(
	app: App,
	path: string,
	options: {
		/** Called with the cached frontmatter; resolve once it returns true. */
		until?: (frontmatter: Record<string, unknown> | undefined) => boolean;
		timeoutMs?: number;
	} = {}
): Promise<void> {
	const { until, timeoutMs = 2000 } = options;

	return new Promise<void>((resolve) => {
		let done = false;
		let poll: number | undefined;
		const finish = () => {
			if (done) return;
			done = true;
			window.clearTimeout(timer);
			if (poll !== undefined) window.clearInterval(poll);
			app.metadataCache.offref(ref);
			resolve();
		};

		const satisfied = () => {
			if (!until) return false;
			const file = app.vault.getAbstractFileByPath(path);
			if (!file) return false;
			const cache = app.metadataCache.getCache(path);
			return until(cache?.frontmatter);
		};

		const timer = window.setTimeout(finish, timeoutMs);
		// Polled as well as event-driven: an index that completed between
		// the write and this call emits nothing further to listen for.
		if (until) {
			poll = window.setInterval(() => {
				if (satisfied()) finish();
			}, 25);
		}

		const ref = app.metadataCache.on("changed", (file) => {
			if (file.path !== path) return;
			if (!until || satisfied()) finish();
		});

		if (satisfied()) finish();
	});
}
