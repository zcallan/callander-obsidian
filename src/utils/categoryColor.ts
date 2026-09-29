import { eventColour } from "@/constants";

/**
 * Colours for "Color by group": the three kinds of thing on the calendar,
 * and each event category, without asking anyone to pick one.
 *
 * Categories are handed colours from a fixed palette, in order — the first
 * category alphabetically gets the first colour, and so on — so the first
 * dozen are guaranteed distinct from each other and from the three kinds'
 * own colours. The palette steers clear of purple, green and pink/magenta
 * altogether, which is what those three are. Past the twelfth a colour is
 * generated from the name instead, still clear of those three hues.
 *
 * Handing out by order does mean a new category that sorts early moves the
 * ones after it along the palette. A colour picked by hand in the colours
 * modal never moves.
 */

/** "Color by group"'s own colours, for anything without a hand-picked one. */
export const DEFAULT_GROUP_COLORS = {
	plan: "#4b23a8",
	birthday: "#126e0a",
	event: "#970c99",
} as const;

/**
 * Twelve colours for the first twelve categories — ordered so the first few
 * are as far apart as they can be (blue, orange, teal, red…), since most
 * calendars will only ever have a handful. Mid to light shades, so each
 * reads as itself on either theme; see contrastColor for the text on them.
 */
export const CATEGORY_PALETTE = [
	"#3b82f6", // blue
	"#e8833a", // orange
	"#1fb5a8", // teal
	"#d94f4f", // red
	"#e6b422", // amber
	"#22a7d0", // cyan
	"#f28b82", // coral
	"#6b7f99", // slate
	"#b8c12b", // lime-yellow
	"#a0643c", // brown
	"#7cc4f5", // sky
	"#d9b38c", // tan
] as const;

/** [start, end) hue ranges, in degrees, a generated colour never lands in:
 * the green, purple and pink/magenta of the three kinds' defaults. */
const RESERVED_HUES: ReadonlyArray<readonly [number, number]> = [
	[95, 135], // green — birthdays
	[240, 275], // purple — plans (and Obsidian's own accent)
	[285, 320], // magenta — events
];

/** `raw`, folded into the hues left over once the reserved bands are cut
 * out — so every possible input still lands somewhere, just never there. */
function safeHue(raw: number): number {
	const total = 360 - RESERVED_HUES.reduce((sum, [a, b]) => sum + (b - a), 0);
	let pos = ((raw % total) + total) % total;
	let cursor = 0;
	for (const [start, end] of RESERVED_HUES) {
		const gap = start - cursor;
		if (pos < gap) return cursor + pos;
		pos -= gap;
		cursor = end;
	}
	return cursor + pos;
}

/**
 * A colour generated from a category's name — for the thirteenth category
 * on. Deterministic, and matched case-insensitively the way the category
 * picker matches names; fixed saturation and lightness, so only the hue
 * varies.
 */
export function categoryColor(name: string): string {
	const key = name.trim().toLowerCase();
	let hash = 0;
	for (let i = 0; i < key.length; i++) {
		hash = (hash * 31 + key.charCodeAt(i)) | 0;
	}
	const hue = safeHue(((hash % 360) + 360) % 360);
	return `hsl(${hue}, 55%, 55%)`;
}

/**
 * Every category's colour, keyed by its lowercased name: the palette in
 * order for the first twelve, then generated. `categories` is the list the
 * calendar offers — alphabetical, once each — so the order is stable until
 * a category is added or removed.
 */
export function categoryColors(
	categories: readonly string[]
): Map<string, string> {
	const colors = new Map<string, string>();
	for (const name of categories) {
		const key = name.trim().toLowerCase();
		if (colors.has(key)) continue;
		colors.set(
			key,
			CATEGORY_PALETTE[colors.size] ?? categoryColor(name)
		);
	}
	return colors;
}

/**
 * A category's colour before any hand-picked override — its place in the
 * palette, or generated once the palette runs out. Used to seed a colour
 * picker's default/reset target, distinct from whatever's actually saved
 * for it right now.
 */
export function defaultCategoryColor(
	name: string,
	categories: readonly string[]
): string {
	const key = name.trim().toLowerCase();
	return categoryColors(categories).get(key) ?? categoryColor(name);
}

/** Colours chosen by hand in the calendar's colour settings. "" means
 * "use the default"; categories and types are keyed by their lowercased
 * name (a type's id is already lowercase). */
export interface GroupColors {
	plan: string;
	birthday: string;
	event: string;
	categories: Record<string, string>;
	types: Record<string, string>;
}

/**
 * The settings' `calendarGroupColors`, filled in and written back.
 *
 * Shared by every place that reads or edits these colours — the settings
 * drawer's own modal and an event category's edit modal both call this
 * first, so a vault saved before one of these keys existed gets the same
 * normalised shape either way, and a change either makes lands on the same
 * object the other reads.
 */
export function ensureGroupColors(settings: {
	calendarGroupColors?: Partial<GroupColors>;
}): GroupColors {
	const saved: Partial<GroupColors> = settings.calendarGroupColors ?? {};
	const colors: GroupColors = {
		plan: saved.plan ?? "",
		birthday: saved.birthday ?? "",
		event: saved.event ?? "",
		categories: { ...(saved.categories ?? {}) },
		types: { ...(saved.types ?? {}) },
	};
	settings.calendarGroupColors = colors;
	return colors;
}

/** The colour "Color by group" gives a kind of thing: a hand-picked one
 * if there is one, otherwise the default. */
export function groupColorFor(
	kind: "event" | "plan" | "birthday",
	custom: GroupColors
): string {
	return custom?.[kind] || DEFAULT_GROUP_COLORS[kind];
}

/**
 * The colour "Color by category" gives an event: its first
 * category's — hand-picked if set, else its place in the palette — or null
 * when it has no category, leaving the event to its other colours.
 */
export function categoryColorFor(
	categories: readonly string[],
	custom: GroupColors,
	palette: ReadonlyMap<string, string> = new Map()
): string | null {
	const first = categories[0];
	if (!first) return null;
	const key = first.trim().toLowerCase();
	// Optional: a value saved before this field existed loads with the
	// object it belongs to but not necessarily this key on it — see
	// CallanderPlugin.loadSettings, which repairs it, but nothing here should
	// depend on always having run after that.
	return custom?.categories?.[key] || palette.get(key) || categoryColor(first);
}

/**
 * The colour "Color by type" gives an event: its type's — hand-picked if
 * set, else the type's own fixed colour — or null for an untyped event,
 * leaving it to "Color by group".
 */
export function typeColorFor(type: string, custom: GroupColors): string | null {
	if (!type) return null;
	return custom?.types?.[type] || eventColour(type);
}

/** Nothing else applied — none of the three tiers matched or were on.
 * Obsidian's own accent, so it reads as "the plugin's colour" rather than
 * any particular event type's, the way it did before any of this existed. */
export const NO_COLOR_FALLBACK = "var(--interactive-accent)";

/**
 * The colour an event is drawn in on the Calendar page. In order: a colour
 * picked for this one event; its category's, while "Color by category" is
 * on and it has one; its type's, while "Color by type" is on and it has
 * one; the events' colour, while "Color by group" is on; and otherwise the
 * accent — all three are on by default, so this last resort is normally
 * only reached by turning one of them off.
 */
export function calendarEventColor(
	event: { color: string; type: string; categories: readonly string[] },
	opts: {
		byGroup: boolean;
		byCategory: boolean;
		byType: boolean;
		custom: GroupColors;
		palette: ReadonlyMap<string, string>;
	}
): string {
	if (event.color) return event.color;
	const category = opts.byCategory
		? categoryColorFor(event.categories, opts.custom, opts.palette)
		: null;
	if (category) return category;
	const type = opts.byType ? typeColorFor(event.type, opts.custom) : null;
	if (type) return type;
	if (opts.byGroup) return groupColorFor("event", opts.custom);
	return NO_COLOR_FALLBACK;
}
