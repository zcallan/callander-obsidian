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

/** String coercion that keeps null/undefined absent instead of "null". */
export function asString(value: unknown): string | undefined {
	return value == null ? undefined : String(value);
}
