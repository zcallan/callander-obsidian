/**
 * Narrowing helpers for YAML-shaped values (frontmatter, parseYaml output,
 * loadData). Frontmatter arrives as `any` from the Obsidian API; these keep
 * it `unknown` until a reader validates the shape it actually needs.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The named field of a record-shaped value; undefined for anything else. */
export function fieldOf(value: unknown, key: string): unknown {
	return isRecord(value) ? value[key] : undefined;
}

/** The value itself if it's an array, else empty. Elements stay unknown. */
export function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? (value as unknown[]) : [];
}

/**
 * Display string for a YAML scalar. Strings pass through; numbers/booleans
 * stringify; anything else (null, objects, arrays) is "" — frontmatter
 * fields never legitimately hold those where prose is expected.
 */
export function toText(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return "";
}

/**
 * toText, except any falsy value — 0 and false as well as "" and null —
 * reads as unset (""). The rule every service reader has always applied.
 */
export function textIfSet(value: unknown): string {
	return value ? toText(value) : "";
}

/**
 * A frontmatter field under textIfSet's rule, as in
 * `fieldText(fm, "name") || file.basename`.
 */
export function fieldText(fm: unknown, key: string): string {
	return textIfSet(fieldOf(fm, key));
}
