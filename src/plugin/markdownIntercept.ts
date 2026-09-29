import { WorkspaceLeaf, type Plugin, type ViewState } from "obsidian";
import {
	routeMarkdownState,
	type MarkdownRouteRule,
} from "@/utils/markdownRoute";

/**
 * The markdown-view intercept: Callander notes navigated to as markdown
 * (file explorer, quick switcher, links, graph) open in their Callander
 * views instead. Installed on WorkspaceLeaf.prototype so every navigation
 * path goes through it; uninstalled when `plugin` unloads.
 *
 * `routing` is read on every navigation, so a settings change applies at
 * once.
 */
export function installMarkdownIntercept(
	plugin: Plugin,
	routing: () => { enabled: boolean; rules: readonly MarkdownRouteRule[] }
): void {
	// eslint-disable-next-line @typescript-eslint/unbound-method -- captured so the override can delegate via .call(this)
	const original = WorkspaceLeaf.prototype.setViewState;
	WorkspaceLeaf.prototype.setViewState = function (
		this: WorkspaceLeaf,
		viewState: ViewState,
		eventState?: unknown
	) {
		const { enabled, rules } = routing();
		const route = routeMarkdownState(viewState, enabled, rules);
		return original.call(
			this,
			route ? { ...viewState, ...route } : viewState,
			eventState
		);
	};
	plugin.register(() => {
		WorkspaceLeaf.prototype.setViewState = original;
	});
}
