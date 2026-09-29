import { useEffect, useRef, useState } from "react";
import { usePlugin } from "@/ui/PluginContext";
import { useViewRevision } from "@/ui/viewStore";

/**
 * A counter that bumps whenever anything under the base folder changes on
 * disk, a setting does, or the day turns over: the plugin's `vaultVersion`,
 * wired with the same registerPageRefresh the imperative pages use.
 *
 * The snapshot is deliberately a **number**, not the data. `getSnapshot` has
 * to return a referentially stable value or React re-renders forever, and a
 * primitive is stable by construction — whereas returning a freshly-read
 * array would be a new reference every call and loop immediately. Callers
 * derive their data from the version instead, which makes the invalidation
 * explicit rather than something the store has to guess at.
 *
 * One counter for the plugin, counting since it loaded, rather than one per
 * island. Preact subscribes an island after its first paint, and the
 * cache's `changed` lands a few milliseconds after a write, so a counter
 * that only started counting on subscribe missed a write made just before
 * the island opened, and showed pre-write data until some unrelated change.
 * This one has already counted it: useSyncExternalStore compares the
 * snapshot when it subscribes, and catches up.
 */
export function useVaultVersion(): number {
	return useViewRevision(usePlugin().vaultVersion);
}

/**
 * Run an async read against the vault, re-running it whenever the vault
 * changes.
 *
 * The read is kept in a ref so a caller can pass an inline arrow without its
 * changing identity retriggering the effect on every render — the version is
 * what decides when to re-read, which is the whole point of the hook.
 *
 * In-flight reads are abandoned rather than cancelled: `getContacts()` walks
 * the metadata cache and can't be aborted, so the guard just makes sure a
 * slow read that resolves after a newer one can't overwrite it.
 */
export function useVaultQuery<T>(read: () => Promise<T>, initial: T): T {
	const version = useVaultVersion();
	const [value, setValue] = useState<T>(initial);
	const latest = useRef(read);
	latest.current = read;

	useEffect(() => {
		let live = true;
		void latest.current().then((result) => {
			if (live) setValue(result);
		});
		return () => {
			live = false;
		};
	}, [version]);

	return value;
}
