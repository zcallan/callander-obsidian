import { useSyncExternalStore } from "react";

/**
 * A revision counter an imperative view owns and React islands inside it
 * subscribe to.
 *
 * `useVaultVersion` is the right signal for a view that reads the vault
 * directly — the dashboard's sections do, so they need nothing else. The
 * contact page doesn't: it keeps a parsed in-memory copy of one file's
 * frontmatter (`contactData`), refreshed asynchronously by `setFile()`, and
 * every write goes through that copy rather than back through the cache.
 *
 * Driving an island off the vault version there would race that refresh —
 * the version bumps the moment bytes land, while `setFile()` is still
 * awaiting its re-read, so React would re-read `contactData` a beat before
 * it's actually been updated. Bumping this instead, from the same place the
 * imperative code re-renders, means an island updates exactly when the old
 * code would have redrawn: never on stale data, and never a frame later
 * than the DOM around it.
 *
 * The snapshot is a number for the same reason `useVaultVersion`'s is —
 * `getSnapshot` must return a referentially stable value or React re-renders
 * forever, and callers derive their data from the bump rather than getting
 * it handed over.
 */
export class ViewStore {
	private revision = 0;
	private listeners = new Set<() => void>();

	/** Announce that the view's data has changed and islands should re-read. */
	bump() {
		this.revision += 1;
		// Copied before iterating: a listener that unsubscribes during the
		// notify pass would otherwise mutate the set mid-iteration.
		for (const listener of [...this.listeners]) listener();
	}

	// Bound as fields, not methods: useSyncExternalStore compares `subscribe`
	// by identity and resubscribes when it changes, so these must be the same
	// function object on every render.
	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	getSnapshot = () => this.revision;
}

/** Re-render whenever the host view says its data moved on. */
export function useViewRevision(store: ViewStore): number {
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot
	);
}
