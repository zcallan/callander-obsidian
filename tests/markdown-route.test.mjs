import { createSuite } from "./harness.mjs";
import { routeMarkdownState } from "./.build/callander.mjs";

/** Which Callander view a markdown navigation turns into, if any. */
export function run() {
	const { eq, result } = createSuite("markdown route");
	const rules = [
		{ matches: (p) => p === "Friends/Dashboard.md", type: "dash", state: () => ({}) },
		{ matches: (p) => p.startsWith("Friends/"), type: "page", state: (p) => ({ filePath: p }) },
		{ matches: (p) => p.startsWith("Friends/Events/"), type: "events", state: (p) => ({ focusPath: p }) },
	];
	const md = (file) => ({ type: "markdown", state: { file } });

	eq("the first matching rule wins, in order", routeMarkdownState(md("Friends/Events/Gig.md"), true, rules), { type: "page", state: { filePath: "Friends/Events/Gig.md" } });
	eq("an earlier, narrower rule", routeMarkdownState(md("Friends/Dashboard.md"), true, rules), { type: "dash", state: {} });
	eq(
		"left alone: routing off, not markdown, no path, no rule",
		[
			routeMarkdownState(md("Friends/A.md"), false, rules),
			routeMarkdownState({ type: "canvas", state: { file: "Friends/A.md" } }, true, rules),
			routeMarkdownState({ type: "markdown", state: {} }, true, rules),
			routeMarkdownState({ type: "markdown" }, true, rules),
			routeMarkdownState(md("Elsewhere/A.md"), true, rules),
		],
		[null, null, null, null, null]
	);
	return result();
}
