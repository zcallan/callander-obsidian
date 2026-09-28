/**
 * Folder plumbing every service repeats: make sure a folder exists, list
 * the notes directly in it, and find a free name for a new one.
 */

import { App, TFile, normalizePath } from "obsidian";

/** Create the folder unless something already sits at that path. */
export async function ensureFolder(app: App, path: string): Promise<void> {
	if (!app.vault.getAbstractFileByPath(path)) {
		await app.vault.createFolder(path);
	}
}

/** The markdown files directly in a folder — not in its subfolders. */
export function markdownFilesIn(app: App, folderPath: string): TFile[] {
	const folder = app.vault.getFolderByPath(normalizePath(folderPath));
	if (!folder) return [];
	return folder.children.filter(
		(f): f is TFile => f instanceof TFile && f.extension === "md"
	);
}

/**
 * `folder/base.md`, or the first of `base<sep>1.md`, `base<sep>2.md`, …
 * that nothing occupies. Anything at the path counts, a folder included.
 * `ignorePath` is a file's own current path, which it may keep.
 */
export function uniqueNotePath(
	app: App,
	folder: string,
	base: string,
	{ separator, ignorePath }: { separator: "-" | " "; ignorePath?: string }
): string {
	let path = normalizePath(`${folder}/${base}.md`);
	let counter = 1;
	while (path !== ignorePath && app.vault.getAbstractFileByPath(path)) {
		path = normalizePath(`${folder}/${base}${separator}${counter++}.md`);
	}
	return path;
}
