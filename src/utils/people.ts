import type { App } from "obsidian";

/** A person as they should read on screen, plus any nickname override. */
export interface PersonInfo {
	displayName: string;
	shortName: string;
}

/**
 * Resolve a list of people to the names they should render as.
 *
 * Entries are "[[Wikilinks]]" for real contacts — resolved through the
 * metadata cache to their `displayName`/`shortName` — or bare names for
 * anyone without a file, which pass straight through. That fallback is what
 * lets a guest be named on something without first becoming a contact.
 *
 * The one place that walks these links, so every caller's display names and
 * short-name overrides are derived from the same resolution and can never
 * drift apart.
 */
export function resolvePeopleInfo(
	app: App,
	sourcePath: string,
	list: string[]
): PersonInfo[] {
	return list.map((raw) => {
		const linktext = String(raw).replace(/^\[\[|\]\]$/g, "");
		const dest = sourcePath
			? app.metadataCache.getFirstLinkpathDest(linktext, sourcePath)
			: null;
		if (!dest) return { displayName: linktext, shortName: "" };
		const fm = app.metadataCache.getFileCache(dest)?.frontmatter;
		return {
			displayName: String(fm?.displayName ?? dest.basename),
			shortName: fm?.shortName ? String(fm.shortName).trim() : "",
		};
	});
}

/** Just the display names — the participant list most callers want. */
export function resolvePeopleNames(
	app: App,
	sourcePath: string,
	list: string[]
): string[] {
	return resolvePeopleInfo(app, sourcePath, list).map((p) => p.displayName);
}
