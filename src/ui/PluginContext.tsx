import { createContext, useContext } from "react";
import type { App } from "obsidian";
import type FriendTracker from "@/main";

/**
 * The plugin instance, handed to React at the mount point.
 *
 * Passed through context rather than props because every component
 * eventually needs it — services, settings and `app` all hang off it — and
 * threading it down by hand would be noise in every signature.
 *
 * There is no default: a component rendered outside the provider is a bug,
 * and failing loudly at the point of use beats rendering against a null
 * plugin and producing an empty screen with no explanation.
 */
const PluginCtx = createContext<FriendTracker | null>(null);

export function PluginProvider({
	plugin,
	children,
}: {
	plugin: FriendTracker;
	children: React.ReactNode;
}) {
	return <PluginCtx.Provider value={plugin}>{children}</PluginCtx.Provider>;
}

export function usePlugin(): FriendTracker {
	const plugin = useContext(PluginCtx);
	if (!plugin) {
		throw new Error("usePlugin() used outside <PluginProvider>");
	}
	return plugin;
}

export function useApp(): App {
	return usePlugin().app;
}
