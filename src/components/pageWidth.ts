import { ItemView } from "obsidian";
import type FriendTracker from "@/main";

/** The reading column every page is capped to when the setting is on. */
export const PAGE_WIDTH = 760;
/** Room the widen button needs beside that column before it's worth offering. */
const GUTTER = 56;

/**
 * Keeps `callander-has-room` on the leaf while there's space beside a capped
 * page for the widen button.
 *
 * A ResizeObserver rather than a media query, for the reason the calendar
 * uses a container query: a leaf can be a split pane far narrower than the
 * window, and a viewport-width rule would offer the button where there's
 * nowhere to widen into — and withhold it where there is.
 *
 * Call from `onOpen` and hand the result to `view.register`, so it's
 * observed once for the life of the view rather than per render.
 */
export function observePageRoom(view: ItemView): () => void {
	const el = view.containerEl;
	const apply = () =>
		el.toggleClass(
			"callander-has-room",
			el.clientWidth >= PAGE_WIDTH + GUTTER
		);
	const observer = new ResizeObserver(apply);
	observer.observe(el);
	apply();
	return () => observer.disconnect();
}

/**
 * Caps a view's content to the reading column and offers the escape hatch.
 *
 * Called at the *end* of a render, once the page is built: it re-parents
 * whatever the view appended into a capped wrapper, rather than asking
 * every view to thread a different parent through seventy-odd call sites.
 * The widen button then sits outside that wrapper, in the gutter beside it
 * — which is the only place it makes sense, since what it offers is the
 * space out there.
 *
 * The cap is a setting, all pages or none — a per-page preference would be
 * several more settings to explain. What is per-page is the temporary
 * override: `wide` is view state, so widening one page to read a wide table
 * doesn't quietly widen the dashboard too, and it lapses on close.
 *
 * The button is drawn only when the cap is on and this page hasn't already
 * been widened. With the setting off there is nothing to escape, and once
 * widened there is no gutter left to sit in.
 */
export function applyPageWidth(
	root: HTMLElement,
	plugin: FriendTracker,
	wide: boolean,
	onWiden: () => void
): void {
	const capped = plugin.settings.pageWidthContainer;

	const page = createDiv({ cls: "callander-page" });
	page.toggleClass("is-wide", !capped || wide);
	while (root.firstChild) page.appendChild(root.firstChild);

	// Gone once it's been used. It offers one thing — the space out in the
	// gutter — and once the page has taken it there is no gutter left for
	// the button to sit in, so leaving it would mean parking it on top of
	// the content it just made room for. Reopening the page brings the
	// column, and the button, back.
	if (capped && !wide) {
		// The bar goes in first so it sticks to the top of the scroll area;
		// a zero-height sticky element after the content sits at the bottom.
		const bar = root.createDiv({ cls: "callander-width-bar" });
		const button = bar.createEl("button", {
			cls: "callander-width-toggle",
			attr: { type: "button", "aria-label": "Use the full width" },
		});
		// Drawn rather than named. `setIcon` renders nothing at all for a
		// name Obsidian doesn't ship — no error, no warning, just a blank
		// button — and CLAUDE.md's verified list has nothing meaning
		// "expand". Built through createSvg rather than innerHTML, which
		// the plugin review scan flags and which this doesn't need.
		appendCorners(button);
		button.addEventListener("click", onWiden);
	}

	root.appendChild(page);
}

/** Four corners pointing out — the only direction this button goes. */
function appendCorners(button: HTMLElement) {
	const svg = button.createSvg("svg", {
		attr: {
			width: "16",
			height: "16",
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "2",
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
		},
	});
	for (const d of ["M15 3h6v6", "M9 21H3v-6", "M21 3l-7 7", "M3 21l7-7"]) {
		svg.createSvg("path", { attr: { d } });
	}
}
