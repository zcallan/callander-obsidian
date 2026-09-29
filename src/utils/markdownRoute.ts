/**
 * Where a markdown navigation should land instead: the dashboard note, a
 * someday, an event or a person/plan/group page each open in their
 * Callander view. The rules are tried in order and the first match wins.
 */

import { fieldOf } from "@/utils/fm";

export interface MarkdownRouteRule {
	matches(path: string): boolean;
	/** The view type to open instead. */
	type: string;
	/** That view's state, for this path. */
	state(path: string): Record<string, unknown>;
}

/**
 * The replacement type and state for a markdown view state, or null to
 * leave it alone: routing off, not markdown, no file path, or no rule for
 * that path.
 */
export function routeMarkdownState(
	viewState: { type: string; state?: unknown },
	enabled: boolean,
	rules: readonly MarkdownRouteRule[]
): { type: string; state: Record<string, unknown> } | null {
	if (!enabled || viewState.type !== "markdown") return null;
	const path = fieldOf(viewState.state, "file");
	if (typeof path !== "string") return null;
	const rule = rules.find((r) => r.matches(path));
	return rule ? { type: rule.type, state: rule.state(path) } : null;
}
