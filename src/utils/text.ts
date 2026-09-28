/**
 * General string helpers: counts, capitals, previews. (textFormat.ts is the
 * Notes editor's markdown toolbar, which is a different job.)
 */

/** The word for a count. Only exactly 1 is singular, so 0 reads "0 events". */
export function pluralize(
	n: number,
	singular: string,
	pluralForm = `${singular}s`
): string {
	return n === 1 ? singular : pluralForm;
}

/** "1 event", "3 events"; formatCount(2, "person", "people") → "2 people". */
export function formatCount(
	n: number,
	singular: string,
	pluralForm?: string
): string {
	return `${n} ${pluralize(n, singular, pluralForm)}`;
}

/**
 * The first UTF-16 unit upper-cased, the rest untouched. Keep it exactly
 * this: it builds group file names and stored link text, so a locale-aware
 * or code-point-aware version would rename files and change stored links.
 */
export function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The first `max` UTF-16 units plus "…" when `text` is longer, else `text`. */
export function truncate(text: string, max: number): string {
	return text.length > max ? text.slice(0, max) + "…" : text;
}
