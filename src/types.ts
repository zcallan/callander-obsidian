import { TFile } from "obsidian";
import type {
	AccommodationType,
	BookingState,
	EventType,
	Hemisphere,
	IdeaCategory,
	InterestCategory,
	PlanIdeaCategory,
	PlanPriority,
	ReminderType,
	SomedayCompany,
	SomedayDay,
	SomedaySort,
	SomedayTime,
	SomedayType,
	TravelType,
} from "./constants";

export interface FriendTrackerSettings {
	/** Holds all Callander data: the People, Groups, Plans, Somedays and
	 * Reminders folders plus the dashboard file. */
	baseFolder: string;
	diaryFolder: string;
	/** Basename of the note (in the base folder) that opens the Callander
	 * dashboard and carries the idea inbox in its properties. */
	dashboardFileName: string;
	defaultSortColumn: keyof Omit<ContactWithCountdown, "file">;
	defaultSortDirection: "asc" | "desc";
	relationshipTypes: string[];
	defaultActiveTab: "notes" | "events" | "ideas" | "markdown";
	belatedBirthdayDays: number;
	/** How far ahead the dashboard's Upcoming section looks, in days */
	upcomingDays: number;
	/** Default sales tax %, offered on a "by receipt" expense split */
	receiptTaxPercent: number;
	/** Default tip %, offered on a "by receipt" expense split */
	receiptTipPercent: number;
	showBirthdayReminders: boolean;
	birthdayReminderDays: number;
	showMetColumn: boolean;
	showIdeasColumn: boolean;
	openContactsInCallanderView: boolean;
	showStarSign: boolean;
	showBirthstone: boolean;
	showBirthFlower: boolean;
	showChineseZodiac: boolean;
	/** Included automatically when sharing plans as a message */
	yourName: string;
	/** Decides which months each season covers — read when matching a
	 * someday's chosen seasons against today. */
	hemisphere: Hemisphere;
	lastBirthdayNoticeDate: string;
	/** Sort order for the All friends list, remembered across opens */
	friendListSort: FriendListSort;
	/**
	 * Whether the dashboard's Drafts accordion is collapsed. Open by
	 * default — drafts are meant to nag — but the choice sticks, since the
	 * view is rebuilt from scratch every time the dashboard opens and would
	 * otherwise spring back open. Incidental UI state, so it isn't surfaced
	 * in the settings tab (like friendListSort).
	 */
	draftsCollapsed: boolean;
	/** Same as draftsCollapsed, for the dashboard's Upcoming birthdays accordion. */
	birthdaysCollapsed: boolean;
	/** Sort for the Somedays page; the dashboard's list follows it. Like
	 * friendListSort, incidental UI state rather than a settings-tab option. */
	somedaySort: SomedaySort;
	/** Sidebar ribbon icons, individually toggleable — see RIBBON_ACTIONS. */
	ribbonDashboard: boolean;
	ribbonDiary: boolean;
	ribbonAddIdea: boolean;
	ribbonSomedays: boolean;
	ribbonReminder: boolean;
}

export type FriendListSort =
	| "alphabetical"
	| "alphabeticalDesc"
	| "newest"
	| "oldest"
	| "birthday"
	| "lastEvent"
	| "youngest"
	| "eldest"
	| "modified";

export interface Contact {
	name: string;
	birthday: string;
	relationship: string;
	age: number | null;
	file: TFile;
}

export interface ContactWithCountdown extends Contact {
	formattedBirthday: string;
	daysUntilBirthday: number | null;
	daysSinceBirthday: number | null;
	lastInteraction: string | null;
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
	events: FriendEvent[];
	drafts: Draft[];
}

/**
 * A raw, uncategorized thought captured in the moment — to be triaged
 * into a proper idea (or a field edit) later.
 */
export interface Draft {
	text: string;
	created: string; // YYYY-MM-DD
}

export interface PlanItem {
	text: string;
	category: PlanIdeaCategory;
	priority: PlanPriority;
	/** ISO date (YYYY-MM-DD) — when set, the idea shows on the plan timeline. */
	date?: string;
	/** 24h time (HH:MM) — refines timeline ordering within a day. */
	time?: string;
	/** Who's involved, free text, e.g. "me, Riley, Laura". */
	people?: string;
	/** Where it happens, e.g. "Eventide Oyster Co" — openable in Maps. */
	location?: string;
	cost?: number;
	/** Free-text detail — edited from the timeline's read view. */
	notes?: string;
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
	/** Street address — openable in Google Maps. */
	address?: string;
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
	source: "idea" | "travel" | "accommodation";
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
export interface PlanCost {
	label: string;
	amount: number;
	/** Squared up already — excluded from "Who owes what" and its
	 * per-person breakdown, and shown struck through in the view modal. */
	settled?: boolean;
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
export interface PlanCredit {
	person: string;
	amount: number;
	/** Optional context, e.g. "Venmo", "covered petrol". */
	note?: string;
}

export interface PlanInfo {
	file: TFile;
	name: string;
	/** Flex date — "2026-10" for "sometime in October" is honest */
	date: string;
	/** Optional end of a range ("Sat Aug 16 - 17") */
	endDate: string;
	location: string;
	status: string; // planning | done
	items: PlanItem[];
	/** Wikilink strings, e.g. "[[Austin Philleo]]" */
	members: string[];
}

export interface GroupInfo {
	/** Normalized (lowercase) group id */
	name: string;
	/** The group's page in Groups/, if it has been created */
	file: TFile | null;
	color: string | null;
}

export interface SortConfig {
	column: keyof Omit<ContactWithCountdown, "file">;
	direction: "asc" | "desc";
}

/**
 * Something that happened: a meetup, a life event of theirs, a memorable
 * outing. The date is a flex string — "2026-05-12", "2026-05", or "2026" —
 * because you often only remember roughly when.
 */
export interface FriendEvent {
	date: string;
	text: string;
	/** Optional details, shown under the name on the timeline */
	description?: string;
	/** Optional — legacy/untyped events are fine and render neutral */
	type?: EventType;
	/** Optional where it happened, shown after the text on the timeline */
	location?: string;
	/** Optional external URL (opened from the edit modal, not shown inline) */
	link?: string;
	/** Path of the diary entry this event was logged from, if any —
	 * used to update instead of duplicate when re-logging */
	source?: string;
	/**
	 * Wikilink to the Plan this row came from ("[[Weekend in Maine]]").
	 *
	 * Only ever set on rows *derived* at render time from a plan's
	 * membership — never written to a person's note. The plan stays the
	 * single source of truth, so a row appears and disappears with the
	 * membership itself. Its presence marks a row as read-only here.
	 */
	plan?: string;
	/** Hidden from the dashboard's Upcoming section only — the timeline
	 * on the person's page still shows it */
	hiddenFromUpcoming?: boolean;
}

export interface Idea {
	category: IdeaCategory;
	text: string;
	done: boolean;
	/** Optional flex date — the dashboard resurfaces the idea from then on */
	resurface?: string;
}

/** A thing a friend is into — a short tag under a fixed category. */
export interface Interest {
	category: InterestCategory;
	text: string;
	/** Optional second field; meaning varies by category (author, artist, …) */
	detail?: string;
}

/** A memorable thing a friend said, with optional context (when/where). */
export interface Quote {
	text: string;
	context?: string;
}

/** An inside joke you share, with optional context (how it started). */
export interface InsideJoke {
	text: string;
	context?: string;
}

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
	/** Hard deadline (ISO YYYY-MM-DD), or "" — the season ends, the bar
	 * closes, the show finishes its run. Unlike `date` this isn't when you
	 * hope to do it, it's when the chance is gone. */
	finalDate: string;
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
	/** What kind of thing it is; "" when unset */
	type: SomedayType | "";
	/**
	 * Wikilinks to real contacts (e.g. "[[Callan]]"), same storage shape as
	 * a plan's members — resolved back to a display name wherever it's
	 * shown. Empty when unset, or when company is "solo".
	 */
	people: string[];
}

export interface DiaryEntry {
	file: TFile;
	title: string;
	date: string; // the date the entry is ABOUT (YYYY-MM-DD)
	created: string; // when it was written (YYYY-MM-DD)
	body: string; // markdown body (without frontmatter)
}

/**
 * A lightweight scheduled reminder — "Laura's birthday" — surfaced on the
 * dashboard's Upcoming section. Stored together in a single Reminders.md file.
 */
export interface Reminder {
	/** File path for folder reminders; a random id for legacy Reminders.md rows */
	id: string;
	name: string;
	/** FlexDate string; absent for an undated reminder */
	date?: string;
	/** 24-hour "HH:MM" */
	time?: string;
	/** What kind of thing it is; typeless (legacy) reminders render neutral */
	type?: ReminderType;
	location?: string;
	link?: string;
	/** Free text, e.g. "Callan, Steve" — shortened/disambiguated for display
	 * the same way a plan's people field is (see shortenPeopleList). */
	people?: string;
	notes?: string;
	status?: "open" | "done";
	created?: string;
	updated?: string;
	/** Set for reminders that live as their own file under Reminders/;
	 * absent for legacy rows still inside Reminders.md */
	file?: TFile;
}

export const DEFAULT_SETTINGS: FriendTrackerSettings = {
	baseFolder: "Friends",
	diaryFolder: "Friends/Diary",
	dashboardFileName: "Dashboard",
	defaultSortColumn: "daysUntilBirthday",
	defaultSortDirection: "asc",
	relationshipTypes: ["family", "friend", "colleague", "pet"],
	defaultActiveTab: "notes",
	belatedBirthdayDays: 14,
	upcomingDays: 30,
	receiptTaxPercent: 6.25,
	receiptTipPercent: 20,
	showBirthdayReminders: true,
	birthdayReminderDays: 7,
	showMetColumn: false,
	showIdeasColumn: true,
	openContactsInCallanderView: true,
	showStarSign: true,
	showBirthstone: true,
	showBirthFlower: true,
	showChineseZodiac: false,
	yourName: "",
	hemisphere: "northern",
	lastBirthdayNoticeDate: "",
	friendListSort: "birthday",
	draftsCollapsed: false,
	birthdaysCollapsed: false,
	somedaySort: "recommended",
	ribbonDashboard: true,
	ribbonDiary: false,
	ribbonAddIdea: false,
	ribbonSomedays: false,
	ribbonReminder: false,
};
