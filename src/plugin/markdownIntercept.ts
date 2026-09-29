import { WorkspaceLeaf, type Plugin, type ViewState } from "obsidian";
import {
	routeMarkdownState,
	type MarkdownRouteRule,
} from "@/utils/markdownRoute";
import { patchMethod } from "@/utils/patchMethod";

/**
 * The markdown-view intercept: Callander notes navigated to as markdown
 * (file explorer, quick switcher, links, graph) open in their Callander
 * views instead. Installed on WorkspaceLeaf.prototype so every navigation
 * path goes through it; removed when `plugin` unloads, through patchMethod,
 * so another plugin patching the same method is never undone.
 *
 * `routing` is read on every navigation, so a settings change applies at
 * once.
 */
export function installMarkdownIntercept(
	plugin: Plugin,
	routing: () => { enabled: boolean; rules: readonly MarkdownRouteRule[] }
): void {
	const unpatch = patchMethod(
		WorkspaceLeaf.prototype,
		"setViewState",
		(original) =>
			function (
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
			}
	);
	plugin.register(unpatch);
}
