/**
 * What a page changed in a note's frontmatter, worked out against what it
 * last read from (or wrote to) that note — so a save can write just that.
 *
 * The contact page used to save by assigning its whole in-memory copy over
 * the file's frontmatter and deleting keys from a hand-kept list. Both halves
 * lost data. Assigning everything wrote the page's older values over any key
 * another device had changed since it loaded; and a key missing from the list
 * could never be removed, so clearing a person's last group, say, looked done
 * until the note was reopened.
 *
 * A patch against a snapshot fixes both at once. A key the page changed is
 * written; a key it removed is deleted, whichever key it is; and every key it
 * didn't touch is left exactly as it is on disk — including ones another
 * device added, changed or deleted in the meantime. A failed read leaves
 * nothing to compare against, so it writes nothing.
 */

/** A frontmatter change: keys to write with their values, and keys to drop. */
export interface FrontmatterPatch {
	set: Record<string, unknown>;
	remove: string[];
}

/**
 * A deep copy of frontmatter-shaped data (the plain values YAML produces),
 * taken when a note is read or written so later edits can be diffed against
 * it. A copy rather than the object itself, because the page edits its lists
 * in place.
 */
export function snapshotFrontmatter(
	data: Record<string, unknown>
): Record<string, unknown> {
	return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
}

/** Equal as frontmatter values — structural, which is all YAML can hold. */
function sameValue(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** What turns `before` into `after`. Both are snapshots. */
export function frontmatterPatch(
	before: Record<string, unknown>,
	after: Record<string, unknown>
): FrontmatterPatch {
	const set: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(after)) {
		if (!(key in before) || !sameValue(before[key], value)) set[key] = value;
	}
	const remove = Object.keys(before).filter((key) => !(key in after));
	return { set, remove };
}

export function isEmptyPatch(patch: FrontmatterPatch): boolean {
	return Object.keys(patch.set).length === 0 && patch.remove.length === 0;
}

/**
 * Apply a patch to frontmatter as `processFrontMatter` hands it over. Keys
 * already there keep their place in the file; new ones go at the end.
 */
export function applyFrontmatterPatch(
	frontmatter: Record<string, unknown>,
	patch: FrontmatterPatch
): void {
	Object.assign(frontmatter, patch.set);
	for (const key of patch.remove) delete frontmatter[key];
}
