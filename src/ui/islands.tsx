import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import type FriendTracker from "@/main";
import { PluginProvider } from "@/ui/PluginContext";

// preact/compat/client exports createRoot but not a name for what it
// returns, so the root type is derived from the function itself.
type Root = ReturnType<typeof createRoot>;

/**
 * A view's React islands, each created once and kept for the life of the
 * view.
 *
 * An imperative view rebuilds its DOM on every vault event, but a root
 * recreated per render would unmount and resubscribe a beat later, and
 * anything arriving in that gap is lost. So `host()` renders a section on
 * first call only and afterwards returns the same host node for the view
 * to place again. React owns the section's updates from then on.
 *
 * StrictMode is deliberately off. It double-invokes effects, and this
 * plugin's effects reach disk — a debounced autosave firing twice would
 * write twice.
 */
export class IslandSet {
	private islands = new Map<string, { host: HTMLElement; root: Root }>();
	/** Set by unmountAll. A render that lands after the view closed — an
	 * await finishing late — would otherwise mount roots nothing ever
	 * unmounts. */
	private closed = false;

	/** `plugin` is read on first render, so a view can build this in a
	 * field initialiser, before its constructor has run. */
	constructor(private readonly plugin: () => FriendTracker) {}

	/** The host node for `key`, rendering `node` into it the first time. */
	host(key: string, node: ReactNode): HTMLElement {
		if (this.closed) return createDiv();
		const existing = this.islands.get(key);
		if (existing) return existing.host;

		const host = createDiv({ cls: "callander-react-root" });
		const root = createRoot(host);
		root.render(
			<PluginProvider plugin={this.plugin()}>{node}</PluginProvider>
		);
		this.islands.set(key, { host, root });
		return host;
	}

	/** Tear every island down, from the view's onClose. */
	unmountAll(): void {
		this.closed = true;
		const roots = [...this.islands.values()];
		this.islands.clear();
		// Unmounting synchronously inside a React render pass is an error,
		// and onClose can be reached from one — defer so teardown always
		// lands between renders.
		window.setTimeout(() => roots.forEach(({ root }) => root.unmount()), 0);
	}
}
