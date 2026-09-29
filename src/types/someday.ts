import type { TFile } from "obsidian";
import type {
	SomedayCompany,
	SomedayDay,
	SomedayTime,
	SomedayType,
} from "@/constants";

/** A child idea under a Someday — e.g. a bakery to hit on the Maine trip. */
export interface SomedaySubIdea {
	text: string;
	done?: boolean;
}

/**
 * A standalone wishlist idea — a park to visit, "Maine in fall" — captured
 * before it's ever a committed Plan. Lives as its own note in the Somedays
 * folder. Deliberately lighter than a Plan: no members, no split costs.
 */
export interface SomedayInfo {
	file: TFile;
	name: string;
	/** FlexDate string ("2026" | "2026-10" | "2026-10-18"), or "" */
	date: string;
	/** Chosen seasons (spring/summer/fall/winter) — an alternative to a date */
	seasons: string[];
	/** Candidate weekdays it could happen on */
	days: SomedayDay[];
	/** Time-of-day windows it suits; all three means "any" (see SOMEDAY_TIMES) */
	times: SomedayTime[];
	/** Start of the doable window (ISO YYYY-MM-DD), or "" — tickets go on
	 * sale, the exhibit opens. Blank means it's already doable. */
	fromDate: string;
	/** End of the doable window (ISO YYYY-MM-DD), or "" — the season ends,
	 * the bar closes, the show finishes its run. Unlike `date` this isn't
	 * when you hope to do it, it's when the chance is gone. */
	untilDate: string;
	/** Estimated cost, or null when unset */
	cost: number | null;
	notes: string;
	subIdeas: SomedaySubIdea[];
	/** open | done (done = did it / archived) */
	status: string;
	/** Path of the Plan this became once converted; "" otherwise */
	convertedTo: string;
	/** Solo or group activity; "" when unset */
	company: SomedayCompany | "";
	/** What kinds of thing it is — one someday can be several (a food stop
	 * on a short trip). Kept in SOMEDAY_TYPES' natural order; the first is
	 * the lead, whose emoji fronts the row when the name brings none. */
	types: SomedayType[];
	/**
	 * Wikilinks to real contacts (e.g. "[[Casey]]"), same storage shape as
	 * a plan's members — resolved back to a display name wherever it's
	 * shown. Empty when unset, or when company is "solo".
	 */
	people: string[];
	/** Added by Claude rather than typed by hand — see utils/generated */
	generated?: boolean;
}
