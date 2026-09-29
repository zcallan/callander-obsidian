/**
 * The contact page's small decision rules: how its dates read, what an idea
 * logs as, how legacy values are read. Pure, so they're tested here rather
 * than through a view nothing can drive.
 */

import {
	IDEA_CATEGORIES,
	INTEREST_CATEGORIES,
	type IdeaCategory,
	type InterestCategory,
} from "@/constants";
import type { Idea, Interest } from "@/types";
import { isoDateOf, wholeDaysBetween } from "@/utils/dates";
import { toText } from "@/utils/fm";
import { isExactFlexDate, parseFlexDate } from "@/utils/flexdate";
import { formatPlanDateRange } from "@/utils/planShare";

/**
 * Whether About gives a value a row: anything but a blank. 0 and false are
 * answers — a custom `pets: 0` or `vegetarian: false` was hidden as if it
 * had never been filled in.
 */
export function isFilledField(value: unknown): boolean {
	if (value === null || value === undefined) return false;
	if (typeof value === "string") return value.trim() !== "";
	if (Array.isArray(value)) return value.some(isFilledField);
	return true;
}

/** A field's value as About's text box edits it: a list as one
 * comma-separated line, a number or a yes/no as its word. */
export function fieldEditText(value: unknown): string {
	if (Array.isArray(value)) {
		return value.map(toText).filter(Boolean).join(", ");
	}
	return toText(value);
}

/**
 * The box's text back as the value to store, in the shape the field had.
 * A list stays a list and a number a number, while the text still reads as
 * one — editing `nicknames: [Bob, Bobby]` used to flatten it to a string,
 * after showing it as an empty box.
 */
export function fieldEditValue(
	text: string,
	previous: unknown
): string | string[] | number | boolean {
	if (Array.isArray(previous)) {
		return text
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
	}
	const trimmed = text.trim();
	if (
		typeof previous === "number" &&
		trimmed !== "" &&
		Number.isFinite(Number(trimmed))
	) {
		return Number(trimmed);
	}
	if (typeof previous === "boolean" && /^(true|false)$/i.test(trimmed)) {
		return trimmed.toLowerCase() === "true";
	}
	return text;
}

/** "today", "yesterday", "12 days ago", or past a month the date itself. */
export function lastUpdatedLabel(mtime: Date, now: Date): string {
	// A synced device whose clock runs ahead can leave an mtime in the
	// future: that's today, not "-2 days ago".
	const daysAgo = Math.max(0, wholeDaysBetween(mtime, now));
	return daysAgo === 0
		? "today"
		: daysAgo === 1
		? "yesterday"
		: daysAgo <= 30
		? `${daysAgo} days ago`
		: mtime.toLocaleDateString("en-AU", {
				day: "numeric",
				month: "long",
				year: "numeric",
		  });
}

/**
 * A plan's date line — "12–15 Aug · in 3 days" — or null when it has no
 * date. The countdown needs a month and day; a year-less date counts
 * towards this year's.
 */
export function planWhenLabel(
	date: string | undefined,
	endDate: string | undefined,
	now: Date
): string | null {
	const dateFlex = parseFlexDate(date);
	if (!dateFlex) return null;
	let when = formatPlanDateRange(date, endDate);
	if (dateFlex.month !== null && dateFlex.day !== null) {
		const target = new Date(
			dateFlex.year ?? now.getFullYear(),
			dateFlex.month - 1,
			dateFlex.day
		);
		target.setHours(0, 0, 0, 0);
		const days = wholeDaysBetween(now, target);
		if (days === 0) when += " · today!";
		else if (days === 1) when += " · tomorrow";
		else if (days > 1) when += ` · in ${days} days`;
		else if (days === -1) when += " · yesterday";
		else when += ` · ${-days} days ago`;
	}
	return when;
}

/** An idea's category, or "other" for one no longer offered. */
export function normalizeIdeaCategory(idea: Idea): IdeaCategory {
	return IDEA_CATEGORIES.some((c) => c.id === idea.category)
		? idea.category
		: "other";
}

/** What a done idea is logged on the timeline as, by its category. */
const IDEA_DONE_VERBS: Partial<Record<IdeaCategory, string>> = {
	gift: "Gave",
	conversation: "Talked about",
	activity: "Did",
	place: "Went to",
	recommendation: "Recommended",
	other: "",
};

/** "Gave: A book" — the timeline line a checked-off idea offers to log. */
export function ideaLogText(idea: Idea): string {
	const verb = IDEA_DONE_VERBS[normalizeIdeaCategory(idea)];
	return verb ? `${verb}: ${idea.text}` : idea.text;
}

/** Unknown/removed categories fall back to "other" so nothing is orphaned. */
export function normalizeInterestCategory(
	interest: Interest
): InterestCategory {
	if (INTEREST_CATEGORIES.some((c) => c.id === interest.category)) {
		return interest.category;
	}
	// Legacy "Movie & TV" → Movie
	if (String(interest.category) === "screen") return "movie";
	// Legacy "Music Genre" → Music, once its own category
	if (String(interest.category) === "musicgenre") return "music";
	return "other";
}

/** Fun facts as a list (a legacy multi-line string splits into items). */
export function parseFunFacts(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return raw.map((f) => String(f).trim()).filter(Boolean);
	}
	if (typeof raw === "string") {
		// Legacy single field: split on newlines or the " · " separator
		return raw
			.split(/\r?\n|\s·\s/)
			.map((l) => l.trim())
			.filter(Boolean);
	}
	return [];
}

/**
 * An interest's words in the order its chip shows them: the thing itself,
 * then its details — "Stick Season", "Noah Kahan", "Indie folk". Any of
 * them can be missing; an artist on their own is an interest too.
 */
export function interestParts(interest: Interest): string[] {
	return [interest.text, interest.detail, interest.detail2]
		.map((part) => (part ?? "").trim())
		.filter(Boolean);
}

/**
 * An idea seeded from an interest: "East of Eden (John Steinbeck)", or
 * whatever it has when there's no title — the artist, say.
 */
export function interestIdeaText(interest: Interest): string {
	const text = interest.text?.trim();
	if (!text) return interestParts(interest)[0] ?? "";
	return interest.detail ? `${text} (${interest.detail})` : text;
}

/**
 * The line under an interest's fields saying any one of them will do, in
 * the type's own words, or "" for a type with only the one field.
 */
export function interestFieldsTip(detailLabels: readonly string[]): string {
	if (detailLabels.length === 0) return "";
	const named = detailLabels.map((label) => `'${label}'`);
	const which =
		named.length === 1
			? `${named[0]} on its own`
			: `${named.slice(0, -1).join(", ")} or ${named[named.length - 1]} on their own`;
	return `Tip: You don't need to fill out all fields — entering just ${which} is fine too.`;
}

/** A plan date as YYYY-MM-DD when it's exact to the day, else null. */
export function exactPlanDay(
	value: string | number | undefined
): string | null {
	const p = parseFlexDate(value);
	return isExactFlexDate(p) ? isoDateOf(p.year, p.month, p.day) : null;
}

