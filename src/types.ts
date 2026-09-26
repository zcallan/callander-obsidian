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
	SomedayCompany,
	SomedayDay,
	SomedaySort,
	SomedayTime,
	SomedayType,
	TravelType,
} from "./constants";
import type { EventSort } from "./utils/eventRow";
import type { GroupColors } from "./utils/categoryColor";
import type {
	EventStatus,
	EventVariant,
} from "./services/EventOperations";

export interface FriendTrackerSettings {
	/** Holds all Callander data: the People, Groups, Plans, Somedays and
	 * Events folders plus the dashboard file. */
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
	/** How many somedays the dashboard's shortlist shows before "+N more" */
	dashboardSomedayCount: number;
	/** How many recently-touched friends the dashboard suggests under the
	 * search bar, before the "All friends" chip. */
	dashboardFriendSuggestionCount: number;
	/** Default sales tax %, offered on a "by receipt" expense split */
	receiptTaxPercent: number;
	/** Default tip %, offered on a "by receipt" expense split */
	receiptTipPercent: number;
	/** Offer "Add sales tax?" / "Add tip?" on a by-receipt split at all.
	 * Off for somewhere that has neither on a bill; an expense that already
	 * carries one keeps showing it. */
	receiptTaxEnabled: boolean;
	receiptTipEnabled: boolean;
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
	/**
	 * Which zone events with a `timezone` are read in. Empty — the default
	 * — follows whatever machine you're on, so a game quoted in Central
	 * reads correctly wherever you happen to be. Pin an IANA id to keep
	 * everything in one zone while travelling instead.
	 *
	 * Only affects events that carry a zone. A plain time is floating and
	 * is shown as typed whatever this says.
	 */
	displayTimezone: string;
	/**
	 * How long the "times are shown in a pinned zone" banner stays hidden
	 * after being snoozed: "" (never snoozed), "forever", or an ISO instant
	 * to reappear after. Shared by every page that shows the banner, so
	 * dismissing it once covers all of them.
	 */
	timezoneBannerSnoozedUntil: string;
	lastBirthdayNoticeDate: string;
	/** Sort order for the All friends list, remembered across opens */
	friendListSort: FriendListSort;
	/**
	 * Which All friends tab was last open. Remembered across sessions, so
	 * someone who lives in the Timeline isn't sent back to the List every
	 * time the page opens. Incidental UI state rather than a settings-tab
	 * option, like friendListSort.
	 */
	friendListTab: FriendListTab;
	/** Same, for the Events page. See friendListTab. */
	eventsTab: FriendListTab;
	/** The All plans page's tab — no calendar there, so only two. */
	plansTab: "timeline" | "list";
	/** The All plans page's sort. Its own, not eventSort: a plan has no
	 * type, so half of that list means nothing here. */
	planSort: EventSort;
	/** Month or week on the Events calendar. See eventsTab. */
	eventsCalendarMode: CalendarMode;
	/** Month or week on the full Calendar page. Remembered like
	 * eventsCalendarMode, separately: the two pages are opened for
	 * different things. */
	calendarMode: CalendarMode;
	/**
	 * Cap every page to a reading column, or let them all run full width.
	 * All or nothing on purpose — a per-page preference would be four more
	 * settings to explain. Widening one page for a moment is the button in
	 * its corner, which is view state rather than a setting.
	 */
	pageWidthContainer: boolean;
	/**
	 * Dashboard section ids, top to bottom. Empty means "never chosen", which
	 * yields the shipped order — storing a copy of it instead would freeze
	 * today's sections into every vault. See resolveDashboardOrder.
	 */
	dashboardOrder: string[];
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
	/**
	 * Whether a Person page's "About" accordion is open. Collapsed by
	 * default — the fields are reference, not the reason you opened the page
	 * — but the choice sticks across files and restarts, since the view is
	 * rebuilt from scratch each time and would otherwise forget. Incidental
	 * UI state, so it isn't surfaced in the settings tab.
	 */
	aboutExpanded: boolean;
	/**
	 * Which of a plan's foldable sections are collapsed, by id.
	 *
	 * A list rather than a boolean each, so a section added later needs no
	 * new setting — and absent means open, which is the right default for
	 * something nobody has expressed a view about.
	 *
	 * Held across every plan rather than per plan: the sections are the same
	 * five on all of them, and somebody who never uses What to bring wants
	 * it folded on the next trip too. Incidental UI state, so it isn't
	 * surfaced in the settings tab.
	 */
	planSectionsCollapsed: string[];
	/**
	 * Which of the Calendar page's calendars are unticked in its drawer, by
	 * id. Hidden ones are listed rather than shown ones, so a calendar added
	 * later — a Sports calendar, say — starts out ticked. Incidental UI
	 * state, so it isn't surfaced in the settings tab.
	 */
	calendarHidden: string[];
	/** Calendar page display setting: hide a chip's start time on the month
	 * grid. Never touches a plan's span days, which are its whole identity,
	 * not a "time". */
	calendarHideDateTime: boolean;
	/** Calendar page display setting: wrap a chip's name on the month grid
	 * instead of truncating it. */
	calendarWrapNames: boolean;
	/** Calendar page display setting: on a phone-width month grid, list
	 * event names (small) in each cell instead of emoji glyphs. */
	calendarNarrowNames: boolean;
	/** Categories unticked in the Calendar page's drawer — see
	 * utils/eventCategories for why the hidden ones are what's stored. */
	calendarHiddenCategories: string[];
	/** Colour events, plans and birthdays by kind — and each event category
	 * its own colour — instead of by event type. Calendar page only. */
	calendarColorByGroup: boolean;
	/** Colour events by their category (palette or hand-picked) on the
	 * Calendar page — separate from "Color by group". */
	calendarCustomCategoryColors: boolean;
	/** Colour events by their type (custom or the type's own fixed colour)
	 * on the Calendar page — the tier between category and group. */
	calendarColorByType: boolean;
	/** Fade anything before today to 70% opacity, on the Calendar page. */
	calendarFadePastEvents: boolean;
	/** Fill an event/plan/birthday chip with its colour, rather than just
	 * a left border. Calendar page only. */
	calendarColorBackgrounds: boolean;
	/** Colours picked by hand for "Color by group" — see GroupColors. */
	calendarGroupColors: GroupColors;
	/**
	 * The Events page Calendar tab's own drawer, the Calendar page's
	 * settings under separate names so each page keeps its own choices:
	 * wrap names, hide the second line, names on a phone, whether plans
	 * show, and the categories unticked.
	 */
	eventsCalWrapNames: boolean;
	eventsCalHideDateTime: boolean;
	eventsCalNarrowNames: boolean;
	eventsCalShowPlans: boolean;
	eventsCalHiddenCategories: string[];
	/** The Events page Calendar tab's colour switches — the Calendar page's
	 * three, under its own names. The colours themselves (calendarGroupColors)
	 * are shared, so a category is the same colour on both. */
	eventsCalColorByGroup: boolean;
	eventsCalUseCategoryColors: boolean;
	eventsCalColorByType: boolean;
	eventsCalFadePastEvents: boolean;
	eventsCalColorBackgrounds: boolean;
	/** Whether the dashboard shows its Getting started checklist at all.
	 * Its "Hide this section" and "Finish" buttons turn this off. */
	showGettingStarted: boolean;
	/** Whether that checklist is folded. Incidental UI state, like
	 * birthdaysCollapsed. */
	gettingStartedCollapsed: boolean;
	/** Steps it has ever seen done — sticky, see gettingStartedProgress. */
	gettingStartedDone: string[];
	/** Whether the dashboard's Secret actions section is folded. Folded to
	 * begin with — it's tools you reach for rarely, not something to read. */
	secretActionsCollapsed: boolean;
	/**
	 * Which day a calendar week opens on — 1 Monday, 0 Sunday.
	 *
	 * Monday by default: the plugin formats dates as en-AU throughout, and a
	 * Monday week keeps a weekend in one row rather than splitting it across
	 * two. Stored as the number `Date.getDay()` uses so the arithmetic reads
	 * against the same scale it compares to.
	 */
	weekStartsOn: 0 | 1;
	/**
	 * Show plans among the dashboard's Upcoming items.
	 *
	 * On by default: a trip is the biggest thing in that window, and the
	 * Plans section further down answers "what am I planning" rather than
	 * "what's next". Off for anyone who reads the two as separate lists.
	 */
	upcomingShowPlans: boolean;
	/** Whether the dashboard's Upcoming lists events at all — the other
	 * half of its Calendars choice, beside upcomingShowPlans. */
	upcomingShowEvents: boolean;
	/** Event categories unticked for the dashboard's Upcoming — see
	 * utils/eventCategories for why the hidden ones are stored. */
	upcomingHiddenCategories: string[];
	/** Event types unticked for the dashboard's Upcoming, by id. Hidden
	 * rather than shown, like the categories, so a type added later
	 * starts out showing. An untyped event always shows. */
	upcomingHiddenTypes: string[];
	/**
	 * Show plans among the Events page's events — list, timeline, and
	 * across every day they span on the calendar. On by default, for the
	 * same reason as upcomingShowPlans.
	 */
	eventsShowPlans: boolean;
	/** Sort for the Somedays page; the dashboard's list follows it. Like
	 * friendListSort, incidental UI state rather than a settings-tab option. */
	somedaySort: SomedaySort;
	/** Sort for the Events page — incidental UI state, same as somedaySort. */
	eventSort: EventSort;
	/** Sidebar ribbon icons, individually toggleable — see RIBBON_ACTIONS. */
	ribbonDashboard: boolean;
	ribbonDiary: boolean;
	ribbonAddIdea: boolean;
	ribbonSomedays: boolean;
	ribbonEvents: boolean;
	ribbonReminder: boolean;
	/**
	 * Experimental: edit Notes in Obsidian's own editor, mounted through
	 * non-public internals (see embeddedMarkdownEditor). Off by default, and
	 * falls back to the standard Notes if the internals have moved.
	 */
	nativeNotesEditor: boolean;
}

export type FriendListSort =
	| "alphabetical"
	| "alphabeticalDesc"
	| "newest"
	| "oldest"
	| "birthday"
	| "birthdayJanDec"
	| "birthdayDecJan"
	| "lastEvent"
	| "youngest"
	| "eldest"
	| "modified";

/**
 * Which presentation a list page is showing. Shared by All friends and
 * Events, which offer the same three.
 */
export type FriendListTab = "list" | "timeline" | "calendar";

/** Which grid the Events page's Calendar tab is drawing. */
export type CalendarMode = "month" | "week";

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
 * Something on the calendar, past or future: a meetup, a booking, a life
 * event, a person-less task. One markdown note per event in an Events/
 * folder; linked people's timelines derive from the `people` wikilinks.
 */
export interface EventInfo {
	file: TFile;
	name: string;
	/**
	 * Flex date ("2026-05-12" | "2026-05" | "2026"), or "" for undated —
	 * **as it reads in the viewer's zone**. Identical to `sourceDate`
	 * unless the event carries a `timezone`, in which case converting the
	 * time can also move the day. This is the date to render, group, sort
	 * and filter by; see `sourceDate` for the one to write back.
	 */
	date: string;
	/** 24-hour "HH:MM", one of EVENT_SPECIAL_TIMES, or "" — resolved into
	 * the viewer's zone, the same way `date` is. */
	time: string;
	/**
	 * The zone the stored time belongs to, as an IANA id, or "" for a
	 * floating time (the default, and every event predating this).
	 */
	timezone: string;
	/**
	 * Exactly what the file says, before any zone conversion.
	 *
	 * Anything written back to the vault uses these — an edit, a copy, a
	 * generated list's ordering — because writing the converted values
	 * would rewrite the event to mean something else, differently
	 * depending on where you happened to be sitting.
	 */
	sourceDate: string;
	sourceTime: string;
	/** How long it runs, canonical "2h 30m", or "" — used by the calendar
	 * export to work out an end time. */
	duration: string;
	/** Merged event/reminder vocabulary; "" renders neutral */
	type: EventType | "";
	/** Wikilinks to people/groups whose timelines this event shows on */
	people: string[];
	location: string;
	link: string;
	/** Shown under the name on timelines */
	description: string;
	/**
	 * open | done | cancelled. Done is only offered for tasks and undated
	 * events (a dated event is implicitly done once its date passes);
	 * cancelled is the record of something that isn't happening after all —
	 * kept rather than deleted, so the history stays honest.
	 */
	status: EventStatus;
	/** Calendar entry vs a record of someone — decides whether it shows
	 * on the dashboard and the Events page. See EventVariant. */
	variant: EventVariant;
	/** Whether the people on it see it on their own timelines. True unless
	 * the note explicitly opts out, so events predating the flag behave as
	 * they always did. */
	showOnTimelines: boolean;
	/** Path of the diary entry this event was logged from, if any —
	 * used to update instead of duplicate when re-logging */
	source: string;
	created: string;
	updated: string;
	/** Added by Claude rather than typed by hand — see utils/generated */
	generated?: boolean;
	/** Free-form labels for finding a batch of events together — e.g. a
	 * season of games imported at once. */
	categories: string[];
	/** A colour picked for this one event on the calendars, "#rrggbb", or
	 * "" to follow its type (or "Color by group"). */
	color: string;
}

/**
 * LEGACY: the embedded shape events had when they lived inside a person's
 * frontmatter. Only the migration (and the plan-timeline rows, which fake
 * this shape) still read it.
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
	/** Added by Claude rather than typed by hand — see utils/generated */
	generated?: boolean;
}

/** A thing a friend is into — a short tag under a fixed category. */
export interface Interest {
	category: InterestCategory;
	text: string;
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

/** An inside joke you share, with optional context (how it started). */
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
/** One line on a plan's packing list. */
export interface PlanBringItem {
	text: string;
	done: boolean;
}

export interface LifeGoal {
	text: string;
	notes?: string;
	done?: boolean;
	/** ISO date it was marked done, so the list can say when. */
	completed?: string;
}

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
	 * Wikilinks to real contacts (e.g. "[[Callan]]"), same storage shape as
	 * a plan's members — resolved back to a display name wherever it's
	 * shown. Empty when unset, or when company is "solo".
	 */
	people: string[];
	/** Added by Claude rather than typed by hand — see utils/generated */
	generated?: boolean;
}

export interface DiaryEntry {
	file: TFile;
	title: string;
	date: string; // the date the entry is ABOUT (YYYY-MM-DD)
	created: string; // when it was written (YYYY-MM-DD)
	body: string; // markdown body (without frontmatter)
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
	dashboardSomedayCount: 10,
	dashboardFriendSuggestionCount: 9,
	receiptTaxPercent: 6.25,
	receiptTipPercent: 20,
	receiptTaxEnabled: true,
	receiptTipEnabled: true,
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
	displayTimezone: "",
	timezoneBannerSnoozedUntil: "",
	lastBirthdayNoticeDate: "",
	friendListSort: "birthday",
	friendListTab: "list",
	eventsTab: "timeline",
	plansTab: "timeline",
	planSort: "natural",
	eventsCalendarMode: "month",
	calendarMode: "month",
	pageWidthContainer: true,
	dashboardOrder: [],
	draftsCollapsed: false,
	birthdaysCollapsed: false,
	aboutExpanded: false,
	planSectionsCollapsed: [],
	calendarHidden: [],
	calendarHideDateTime: false,
	calendarWrapNames: false,
	// Stored inverted from the "Emojis on mobile" checkbox it backs (see
	// CalendarView/EventsView) — `true` here is emojis *off* by default.
	calendarNarrowNames: true,
	calendarHiddenCategories: [],
	calendarColorByGroup: true,
	calendarCustomCategoryColors: true,
	calendarColorByType: true,
	calendarFadePastEvents: false,
	calendarColorBackgrounds: false,
	calendarGroupColors: { plan: "", birthday: "", event: "", categories: {}, types: {} },
	eventsCalWrapNames: false,
	eventsCalHideDateTime: false,
	// Same inversion as calendarNarrowNames above.
	eventsCalNarrowNames: true,
	eventsCalShowPlans: true,
	eventsCalHiddenCategories: [],
	eventsCalColorByGroup: true,
	eventsCalUseCategoryColors: true,
	eventsCalColorByType: true,
	eventsCalFadePastEvents: false,
	eventsCalColorBackgrounds: false,
	showGettingStarted: true,
	gettingStartedCollapsed: false,
	gettingStartedDone: [],
	secretActionsCollapsed: true,
	weekStartsOn: 1,
	upcomingShowPlans: true,
	upcomingShowEvents: true,
	upcomingHiddenCategories: [],
	upcomingHiddenTypes: [],
	eventsShowPlans: true,
	somedaySort: "recommended",
	eventSort: "natural",
	ribbonDashboard: true,
	ribbonDiary: false,
	ribbonAddIdea: false,
	ribbonSomedays: false,
	ribbonEvents: false,
	ribbonReminder: false,
	nativeNotesEditor: false,
};
