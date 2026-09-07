/**
 * Reading and writing the fields whose entries name other notes — parents,
 * siblings, children, friends, related files.
 *
 * Each entry is either a `[[Wikilink]]` or plain text, and the two are
 * deliberately interchangeable: a relative with no note of their own is still
 * worth naming. The list is the storage unit rather than one joined string,
 * because only a whole-value link gets indexed by Obsidian (see
 * LINKABLE_FIELDS).
 */

/**
 * A stored field value as its list of entries.
 *
 * Accepts a list (what these fields write now) and a plain string (what a
 * vault edited before this existed still holds, and what someone typing YAML
 * by hand will produce). A string is split on commas, which is how the read
 * view has always joined multi-value fields back together — so a legacy
 * `parents: Denise, Bob` reads as two entries rather than one odd one.
 *
 * Splitting never happens inside brackets: a note legitimately called
 * "Smith, John" survives as one entry rather than becoming two broken ones.
 */
export function parseLinkField(value: unknown): string[] {
	const raw = Array.isArray(value)
		? value.map(scalarText)
		: typeof value === "string"
		? splitOutsideBrackets(value)
		: [scalarText(value)];
	return raw.map((s) => s.trim()).filter(Boolean);
}

/**
 * A YAML scalar as text, and anything else as nothing.
 *
 * Hand-edited frontmatter can put a map or a nested list here. Coercing one
 * with `String()` would render "[object Object]" into the field and then save
 * it back on the next edit, so an unusable value is dropped instead — the
 * field shows one fewer entry rather than a line of noise.
 */
function scalarText(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return "";
}

function splitOutsideBrackets(text: string): string[] {
	const out: string[] = [];
	let current = "";
	let depth = 0;
	for (let i = 0; i < text.length; i++) {
		const two = text.slice(i, i + 2);
		if (two === "[[") {
			depth++;
			current += two;
			i++;
			continue;
		}
		if (two === "]]" && depth > 0) {
			depth--;
			current += two;
			i++;
			continue;
		}
		if (text[i] === "," && depth === 0) {
			out.push(current);
			current = "";
			continue;
		}
		current += text[i];
	}
	out.push(current);
	return out;
}

/**
 * What the edit box shows for a stored value, and the inverse of
 * parseLinkField for anything a person types back into it.
 */
export function formatLinkField(value: unknown): string {
	return parseLinkField(value).join(", ");
}

/**
 * The note an entry points at, or null when it's plain text.
 *
 * Handles the alias form too — `[[Note|shown as this]]` targets `Note`, which
 * is what has to be resolved even though the label is what's rendered.
 */
export function linkTarget(entry: string): string | null {
	const m = /^\[\[([^\]]+)\]\]$/.exec(entry.trim());
	if (!m) return null;
	const target = m[1].split("|")[0].trim();
	return target || null;
}

/** What an entry reads as: a link's alias if it has one, else its target. */
export function linkLabel(entry: string): string {
	const m = /^\[\[([^\]]+)\]\]$/.exec(entry.trim());
	if (!m) return entry.trim();
	const [target, alias] = m[1].split("|");
	return (alias ?? target).trim() || entry.trim();
}

/**
 * Wrap a note name as a link, unless it already is one.
 *
 * Used when a name is picked from the autocomplete — typing stays untouched,
 * so plain text is never silently promoted to a link the person didn't ask
 * for.
 */
export function asWikilink(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return "";
	return linkTarget(trimmed) ? trimmed : `[[${trimmed}]]`;
}

/**
 * Replace the entry the caret sits in, leaving the others alone.
 *
 * The edit box holds every entry on one comma-separated line, so picking a
 * suggestion has to know which of them is being typed. Returns the whole new
 * value, ready to put back in the input.
 */
export function replaceEntryAt(
	text: string,
	caret: number,
	replacement: string
): string {
	const entries = splitOutsideBrackets(text);
	// Walk the segments counting the characters each consumed (plus its
	// comma) until the caret's own segment is the one we're standing on.
	let consumed = 0;
	let index = entries.length - 1;
	for (let i = 0; i < entries.length; i++) {
		const end = consumed + entries[i].length;
		if (caret <= end) {
			index = i;
			break;
		}
		consumed = end + 1;
	}
	const rebuilt = entries.map((e, i) =>
		i === index ? replacement : e.trim()
	);
	return rebuilt
		.map((e) => e.trim())
		.filter((e, i) => e || i === index)
		.join(", ");
}
