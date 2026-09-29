import type { Hemisphere, SomedaySort } from "@/constants";
import type { GroupColors } from "@/utils/categoryColor";
import type { EventSort } from "@/utils/eventRow";

export interface FriendTrackerSettings {
	/** Holds all Callander data: the People, Groups, Plans, Somedays and
	 * Events folders plus the dashboard file. */
	baseFolder: string;
	diaryFolder: string;
	/** Basename of the note (in the base folder) that opens the Callander
	 * dashboard and carries the idea inbox in its properties. */
	dashboardFileName: string;
	relationshipTypes: string[];
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

export const DEFAULT_SETTINGS: FriendTrackerSettings = {
	baseFolder: "Friends",
	diaryFolder: "Friends/Diary",
	dashboardFileName: "Dashboard",
	relationshipTypes: ["family", "friend", "colleague", "pet"],
	belatedBirthdayDays: 14,
	dashboardSomedayCount: 10,
	dashboardFriendSuggestionCount: 9,
	receiptTaxPercent: 6.25,
	receiptTipPercent: 20,
	receiptTaxEnabled: true,
	receiptTipEnabled: true,
	showBirthdayReminders: true,
	birthdayReminderDays: 7,
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
