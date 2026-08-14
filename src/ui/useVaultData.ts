import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePlugin } from "@/ui/PluginContext";
import type FriendTracker from "@/main";

/**
 * A counter that bumps whenever anything the plugin owns changes on disk, or
 * a setting does.
 *
 * The snapshot is deliberately a **number**, not the data. `getSnapshot` has
 * to return a referentially stable value or React re-renders forever, and a
 * primitive is stable by construction — whereas returning a freshly-read
 * array would be a new reference every call and loop immediately. Callers
 * derive their data from the version instead, which makes the invalidation
 * explicit rather than something the store has to guess at.
 *
 * Scoped to the base folder for the same reason the imperative views scope
 * their listeners: an unscoped subscription fires on every keystroke in any
 * note in the vault.
 */
export function useVaultVersion(): number {
	const plugin = usePlugin();

	// Held outside React so `subscribe` and `getSnapshot` can both reach it
	// without either being recreated per render.
	const state = useRef({ version: 0 });

	const subscribe = useCallback(
		(onChange: () => void) => {
			const bump = () => {
				state.current.version += 1;
				onChange();
			};
			const inScope = (path: string) =>
				path.startsWith(plugin.settings.baseFolder + "/");

			const vault = plugin.app.vault;
			const vaultRefs = [
				vault.on("modify", (f) => inScope(f.path) && bump()),
				vault.on("create", (f) => inScope(f.path) && bump()),
				vault.on("delete", (f) => inScope(f.path) && bump()),
				vault.on(
					"rename",
					(f, old) => (inScope(f.path) || inScope(old)) && bump()
				),
			];
			// Settings feed rendering as much as the files do — a changed sort
			// or folder has to invalidate too. Detached through its own
			// emitter: each Events instance keeps its own handler map, so
			// `vault.offref` would silently fail to remove this one.
			const settingsRef = plugin.events.on("settings-changed", bump);

			return () => {
				vaultRefs.forEach((ref) => vault.offref(ref));
				plugin.events.offref(settingsRef);
			};
		},
		[plugin]
	);

	return useSyncExternalStore(
		subscribe,
		() => state.current.version,
		() => state.current.version
	);
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

/** Settings, re-read whenever they change. */
export function useSettings(): FriendTracker["settings"] {
	const plugin = usePlugin();
	// The version covers settings-changed, so this re-renders with them.
	useVaultVersion();
	return plugin.settings;
}
