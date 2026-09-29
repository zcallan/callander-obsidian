import type { App } from "obsidian";

/**
 * Clicks on links inside rendered markdown. Obsidian only follows them
 * in its own views, so here they're routed by hand: an anchor scrolls
 * within the render, an internal link opens (in a new tab with the
 * modifier held), and anything web goes to the browser as usual.
 *
 * `sourcePath` is the note the markdown came from, which relative links
 * resolve against.
 */
export function followRenderedLink(
	app: App,
	event: MouseEvent,
	container: HTMLElement,
	sourcePath: string
) {
	const anchor = (event.target as HTMLElement | null)?.closest("a");
	if (!anchor || !container.contains(anchor)) return;
	const href = anchor.getAttribute("href");
	if (href?.startsWith("#")) {
		event.preventDefault();
		// A heading id isn't always a valid selector ("#My heading").
		try {
			container.querySelector(href)?.scrollIntoView();
		} catch {
			// Nothing to scroll to.
		}
	} else if (href && !/^[a-z][a-z0-9+.-]*:/i.test(href)) {
		event.preventDefault();
		void app.workspace.openLinkText(
			href,
			sourcePath,
			event.ctrlKey || event.metaKey
		);
	}
}
