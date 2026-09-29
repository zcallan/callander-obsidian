import { createContext, useContext, type ReactNode } from "react";
import type CallanderPlugin from "@/main";

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
const PluginCtx = createContext<CallanderPlugin | null>(null);

export function PluginProvider({
	plugin,
	children,
}: {
	plugin: CallanderPlugin;
	children: ReactNode;
}) {
	return <PluginCtx.Provider value={plugin}>{children}</PluginCtx.Provider>;
}

export function usePlugin(): CallanderPlugin {
	const plugin = useContext(PluginCtx);
	if (!plugin) {
		throw new Error("usePlugin() used outside <PluginProvider>");
	}
	return plugin;
}
