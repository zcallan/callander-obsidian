import type { TFile } from "obsidian";
import type {
	AccommodationType,
	BookingState,
	PlanIdeaCategory,
	PlanPriority,
	TravelType,
} from "@/constants";

export interface PlanItem {
	text: string;
	category: PlanIdeaCategory;
	priority: PlanPriority;
	/** ISO date (YYYY-MM-DD) — when set, the idea shows on the plan timeline. */
	date?: string;
	/** 24h time (HH:MM) — refines timeline ordering within a day. */
	time?: string;
	/** How long it runs, canonical "2h 30m" — the same shape a travel leg
	 * stores, and what a calendar export reads for an end time. */
	duration?: string;
	/** Who's involved, free text, e.g. "me, Riley, Laura". */
	people?: string;
	/** Where it happens, e.g. "Eventide Oyster Co" — openable in Maps. */
	location?: string;
	cost?: number;
	/** Free-text detail — edited from the timeline's read view. */
	notes?: string;
}

/**
 * An idea attached to a plan that nobody has committed to yet — "that
 * restaurant in Boston, maybe Tue or Wed night".
 *
 * Deliberately not a `PlanItem`: it carries *candidate* days rather than one
 * chosen day, and its `categories` are a grouping local to this plan
 * ("Boston", "Rainy day") with no meaning anywhere else. Promoting one to
 * the timeline builds a real PlanItem from it — see the plan page's
 * add-to-timeline flow.
 */
export interface PlanQuickIdea {
	text: string;
	/** Reuses the timeline's own type list, so a promoted idea keeps it. */
	type?: PlanIdeaCategory;
	/** Plan-local groupings. Anything uncategorised shows under "Other". */
	categories?: string[];
	/** Candidate days (ISO YYYY-MM-DD) — any one of them would work. */
	dates?: string[];
	/** A ROUGH_TIMES id or "HH:MM" — the same shape a timeline item's time
	 * takes, so it transfers across on promotion untouched. */
	time?: string;
	/** Canonical "2h 30m", same as a timeline item's — carried across on
	 * promotion rather than re-asked for. */
	duration?: string;
	people?: string;
	cost?: number;
	notes?: string;
	created?: string;
	/** Added by Claude rather than typed by hand — see utils/generated */
	generated?: boolean;
}

/** Flat plan list entries: travel legs, accommodation options */
export interface PlanSimpleItem {
	text: string;
	/** Mode of transport — travel legs only. */
	type?: TravelType;
	/** Kind of stay — accommodation only. */
	stay?: AccommodationType;
	/** ISO date (YYYY-MM-DD): travel legs and check-in nights. */
	date?: string;
	/** 24h time (HH:MM) — travel legs, refines ordering within a day. */
	time?: string;
	/** Who's on this leg / staying, free text, e.g. "me, Riley, Laura". */
	people?: string;
	/** Free-text span for travel, e.g. "2h flight". Stays use `nights`. */
	duration?: string;
	/** Whole nights at this accommodation. */
	nights?: number;
	/** Check-in / check-out, 24h "HH:MM" on the hour — accommodation only.
	 * Either may be absent, which is what an all-day booking looks like. */
	checkIn?: string;
	checkOut?: string;
	/** Street address — openable in Google Maps. */
	address?: string;
	/**
	 * Plan-local groupings — accommodation only, and the same shape a quick
	 * idea's are. A trip up a coast has stays in several towns, and "which
	 * one was in Boston" is the question the list is read with.
	 */
	categories?: string[];
	/** Booking status — stays and travel legs; absent means nothing to chase. */
	booked?: BookingState;
	/** Check-in/out times, door codes — anything worth having on hand. */
	notes?: string;
	cost?: number;
}

/**
 * A derived, read-only view row for the plan timeline. NOT stored — computed
 * by PlanOperations.timelineOf from the dated items in `items`/`travel`/
 * `accommodation`. `source` + `index` point back to the one real object so
 * edits/deletes route to it; there is no duplicate to keep in sync.
 */
export interface PlanTimelineEntry {
	source: "idea" | "travel" | "accommodation" | "draft";
	index: number;
	date: string;
	time?: string;
	people?: string;
	text: string;
	emoji: string;
	/** Idea entries only — carried so a read view can label them. */
	category?: PlanIdeaCategory;
	priority?: PlanPriority;
	/** Accommodation entries only — the kind of stay. */
	stay?: AccommodationType;
	/** Travel entries only — the mode of transport. */
	travel?: TravelType;
	duration?: string;
	/** Stay length — accommodation entries (shown once, on check-in day). */
	nights?: number;
	/** Check-in / check-out times — accommodation entries only. */
	checkIn?: string;
	checkOut?: string;
	address?: string;
	/** Idea entries' equivalent of `address` — both open in Maps. */
	location?: string;
	booked?: BookingState;
	notes?: string;
	cost?: number;
}

/**
 * A shared expense split across participants. "even" divides equally;
 * "shares" divides by integer weights (Austin 3, Riley 2 nights, etc.) —
 * generic units, so it works for nights, drinks, gas, anything.
 */
export interface Expense {
	label: string;
	amount: number;
	/** Squared up already — excluded from "Who owes what" and its
	 * per-person breakdown, and shown struck through in the view modal. */
	settled?: boolean;
	/**
	 * Who's splitting this, as "[[Wikilinks]]" for real contacts and bare
	 * names for anyone else. Only ad-hoc expenses carry their own people;
	 * on a plan it's absent and the participants come from plan members.
	 */
	people?: string[];
	/**
	 * Who's squared up, by display name — the ticked boxes in the read view.
	 * `settled` is what this adds up to: tick everyone and the expense
	 * settles itself.
	 *
	 * Absent means nothing's been recorded yet, which is not the same as an
	 * empty list: absent falls back to you being ticked (you're the one who
	 * paid), while `[]` is an expense explicitly marked unsettled.
	 */
	paid?: string[];
	split: {
		mode: "even" | "shares" | "percent" | "value" | "receipt";
		/** Per-person weights (shares), percentages, or exact dollar
		 * amounts ("value" and "receipt"), keyed by name */
		shares?: Record<string, number>;
		/** "receipt" only — how a line was written when it was arithmetic
		 * ("7+7" for 14), keyed by name. Kept purely so you can see how a
		 * figure was arrived at; `shares` remains the number that counts. */
		exprs?: Record<string, string>;
		/** "receipt" only — sales tax %, absent when not applied. Charged
		 * on the subtotal, not compounded with the tip. */
		tax?: number;
		/** "receipt" only — tip %, absent when not applied. Also charged
		 * on the subtotal. */
		tip?: number;
	};
}

/**
 * Money a person has already handed over (a transfer, or covering something
 * else) — deducted from what they owe. Not split; it applies to one person.
 */
export interface Credit {
	person: string;
	amount: number;
	/** Optional context, e.g. "Venmo", "covered petrol". */
	note?: string;
}

/** The lists that show plans among other things, each hideable per plan. */
export type PlanList = "upcoming" | "events";

export interface PlanInfo {
	file: TFile;
	name: string;
	/** Flex date — "2026-10" for "sometime in October" is honest */
	date: string;
	/** Optional end of a range ("Sat Aug 16 - 17") */
	endDate: string;
	location: string;
	status: string; // planning | done
	/** YYYY-MM-DD stamps from the note. `updated` is kept true by every
	 * write; `created` is missing on plans made before it was written, so
	 * it may be "". */
	created: string;
	updated: string;
	items: PlanItem[];
	/** Wikilink strings, e.g. "[[Austin Philleo]]" */
	members: string[];
	/**
	 * Kept off the dashboard's Upcoming list.
	 *
	 * Per plan rather than a setting, because it answers a different
	 * question: the setting is "do I read those as one list", this is "that
	 * one trip isn't what I mean by what's next". A plan hidden here still
	 * shows in the Plans section, which is where you turn it back on.
	 */
	hiddenFromUpcoming: boolean;
	/**
	 * Kept off the Events page. Separate from the Upcoming flag because the
	 * two pages ask different things of a plan — the dashboard's window is
	 * "what's next", the Events page is the whole calendar.
	 */
	hiddenFromEvents: boolean;
}

/** One line on a plan's packing list. */
export interface PlanBringItem {
	text: string;
	done: boolean;
}
