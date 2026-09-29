import type { TFile } from "obsidian";
import type { IdeaCategory, InterestCategory } from "@/constants";
import type { EventInfo } from "@/types/event";

export interface Contact {
	name: string;
	birthday: string;
	relationship: string;
	age: number | null;
	file: TFile;
}

export interface ContactWithCountdown extends Contact {
	daysUntilBirthday: number | null;
	daysSinceBirthday: number | null;
	met: string;
	openIdeas: number;
	/** The birthday occurrence (YYYY-MM-DD) already wished, if any */
	birthdayWished: string;
	/** displayName if set, otherwise name — what the UI should show */
	displayName: string;
	/** Override for shortenMemberNames/shortenPeopleList — "Obama" instead
	 * of a computed "Barack" or disambiguated "Barack O". Empty when unset. */
	shortName: string;
	groups: string[];
	ideas: Idea[];
	events: EventInfo[];
}

/**
 * A raw, uncategorized thought captured in the moment — to be triaged
 * into a proper idea (or a field edit) later.
 */
export interface Draft {
	text: string;
	created: string; // YYYY-MM-DD
	/**
	 * A day on the plan this belongs to, when it has one. Dated drafts show
	 * on the plan timeline alongside the ideas — an unfinished thought about
	 * Thursday is still a thing about Thursday.
	 */
	date?: string;
	/** Added by Claude rather than typed by hand — see utils/generated */
	generated?: boolean;
}

export interface GroupInfo {
	/** Normalized (lowercase) group id */
	name: string;
	/** The group's page in Groups/, if it has been created */
	file: TFile | null;
	color: string | null;
}

export interface Idea {
	category: IdeaCategory;
	text: string;
	done: boolean;
	/** Optional flex date — the dashboard resurfaces the idea from then on */
	resurface?: string;
	/** Added by Claude rather than typed by hand — see utils/generated */
	generated?: boolean;
}

/** A thing a friend is into — a short tag under a fixed category. */
export interface Interest {
	category: InterestCategory;
	/** The thing itself: a song, a book, a team. Optional where a detail
	 * says enough on its own — an artist they love, with no song in mind. */
	text?: string;
	/** Optional second field; meaning varies by category (author, artist, …) */
	detail?: string;
	/** Optional third field, only categories with one of their own ask for
	 * it (Music's genre, alongside its artist in `detail`). */
	detail2?: string;
	/** What they like about it, or how they have it. Saved but not yet shown
	 * on the person page. */
	notes?: string;
}

/** A memorable thing a friend said, with optional context (when/where). */
export interface Quote {
	text: string;
	context?: string;
}

/**
 * Something this person wants to do someday — learn Spanish, run a marathon.
 *
 * Not a Someday: those are things *you* might do, and graduate into a Plan.
 * This is a record of theirs, kept so it can prompt an idea, a plan, or
 * simply "how's the Spanish going?" after a long gap.
 *
 * Completed goals are kept rather than deleted — the point is partly the
 * record, and "they finally did it" is worth being able to look back on.
 */
export interface LifeGoal {
	text: string;
	notes?: string;
	done?: boolean;
	/** ISO date it was marked done, so the list can say when. */
	completed?: string;
}

/** An inside joke you share, with optional context (how it started). */
export interface InsideJoke {
	text: string;
	context?: string;
}
