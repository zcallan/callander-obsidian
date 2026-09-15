import {
	ItemView,
	WorkspaceLeaf,
	setIcon,
	type ViewStateResult,
} from "obsidian";
import { fieldOf } from "@/utils/fm";
import type FriendTracker from "@/main";
import { applyPageWidth, observePageRoom } from "@/components/pageWidth";
import type {
	CalendarMode,
	ContactWithCountdown,
	EventInfo,
	FriendListTab,
	PlanInfo,
} from "@/types";
import { EventModal } from "@/modals/EventModal";
import { EventViewModal } from "@/modals/EventViewModal";
import { EVENT_TYPES, eventColour, type EventType } from "@/constants";
import {
	EVENT_SORTS,
	EVENT_WHEN_FILTERS,
	applyEventSort,
	calendarChipMeta,
	eventRowFields,
	eventSortOf,
	matchesEventWhen,
	type EventSort,
	type EventWhen,
	type SortableEvent,
} from "@/utils/eventRow";
import { buildUpcomingRow } from "@/components/UpcomingRow";
import { registerVaultRefresh } from "@/utils/vaultRefresh";
import { groupEventsByPeriod } from "@/utils/eventGroups";
import { formatShortWeekdayDate, todayISO } from "@/utils/flexdate";
import type { CalendarDay } from "@/utils/calendarGrid";
import {
	assignSpanLanes,
	eventsByDay,
	monthGrid,
	spanRun,
	monthLabel,
	weekGrid,
	weekLabel,
	type SpanRun,
} from "@/utils/calendarGrid";
import { splitLeadingEmoji } from "@/utils/emoji";
import { summarisePeople } from "@/utils/nameFormat";
import { PlanGlanceModal } from "@/modals/PlanGlanceModal";
import {
	PLAN_ICON,
	planDays,
	planRowFields,
	planSpanLabel,
	planWhenDate,
	plansForEventsPage,
} from "@/utils/planRow";

export const VIEW_TYPE_EVENTS = "callander-events";

/** Chips a month cell shows before it says "+N more". */
const CAL_CHIPS = 3;
/** Dots a narrow cell shows; past four they stop being countable anyway. */
/** Glyphs a narrow cell can hold — see the measurement in appendCalCell. */
const CAL_DOTS = 3;
/**
 * Pane width, in px, below which a month cell can't hold a readable chip.
 * Must match the container query in base.css — the stylesheet decides what
 * is drawn, this decides what a tap does.
 */
const CAL_NARROW = 620;
/** Indexed by Date.getDay(), so Sunday leads whatever the week opens on. */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * One row on the page — an event, or a plan shown among them.
 *
 * Carries the fields applyEventSort reads, so the two sort as one list by
 * whichever sort is picked rather than as two lists stapled together. A
 * plan's type is "plan", which no type chip matches: picking a type narrows
 * to events of that type, and a plan isn't one.
 */
type PageItem = SortableEvent & {
	time: string;
	location: string;
	/** Wikilinks — an event's people, a plan's members. */
	people: string[];
	description: string;
	/** What Upcoming / Past judges it by — see planWhenDate. */
	whenDate: string;
} & ({ kind: "event"; event: EventInfo } | { kind: "plan"; plan: PlanInfo });

function eventItem(event: EventInfo): PageItem {
	return {
		kind: "event",
		event,
		file: event.file,
		name: event.name,
		date: event.date,
		type: event.type,
		status: event.status,
		created: event.created,
		updated: event.updated,
		time: event.time,
		location: event.location,
		people: event.people,
		description: event.description,
		whenDate: event.date,
	};
}

function planItem(plan: PlanInfo): PageItem {
	return {
		kind: "plan",
		plan,
		file: plan.file,
		name: plan.name,
		date: plan.date,
		type: "plan",
		status: plan.status,
		// Plans carry no stamps, so Oldest and Last updated sink them to
		// the end — the same place an unstamped event goes.
		created: "",
		updated: "",
		time: "",
		location: plan.location,
		people: plan.members,
		description: "",
		whenDate: planWhenDate(plan),
	};
}

/** "8pm", "7:30pm" — compact enough for a chip, where "7:30 PM" wraps. */
function shortTime(time: string): string {
	const [h, m] = time.split(":").map(Number);
	if (Number.isNaN(h)) return time;
	const period = h < 12 ? "am" : "pm";
	const hour = h % 12 || 12;
	return m ? `${hour}:${String(m).padStart(2, "0")}${period}` : `${hour}${period}`;
}

/**
 * The full page of Events — everything on the calendar, past and future.
 * Each event is a plain row; clicking one opens its view modal.
 *
 * Built to match the Somedays page, with the filters the two pages don't
 * share swapped out: an event is a fixed thing that happened (or will),
 * so there's nothing to ask about weekdays, seasons or party size. What's
 * worth narrowing by is what kind of thing it was and who was there.
 */
export class EventsView extends ItemView {
	private items: PageItem[] = [];
	/** Fetched alongside the events, to turn people wikilinks into names. */
	private contacts: ContactWithCountdown[] = [];
	private searchQuery = "";
	private focusPath: string | null = null;
	private listEl: HTMLElement | null = null;

	// Filters — one type and one person at a time, like the Somedays page's
	// own single-pick facets.
	private type: EventType | "" = "";
	private personPath = "";
	// Which half of the timeline. Out in the open rather than in the filter
	// panel — it's the first question you ask of a list of events, the same
	// way the Somedays page keeps Today/Tomorrow to hand.
	//
	// Starts on Upcoming and can never be cleared: what's ahead is what you
	// open this page for, and "everything, all at once" isn't a view worth
	// landing on.
	private when: EventWhen = "upcoming";
	// The filter panel is opt-in chrome — closed on every page open, to keep
	// the list high; the toggle's badge keeps active filters visible while
	// it's shut.
	private filtersOpen = false;
	/** Widened for this view only, until it closes. */
	private pageWide = false;
	/**
	 * Which presentation is showing, remembered across sessions the same
	 * way All friends remembers its own.
	 */
	private tab: FriendListTab;
	/** Month or week on the Calendar tab; remembered like the tab itself. */
	private calMode: CalendarMode;
	/**
	 * Which month or week the calendar is showing. Not remembered: paging
	 * away and coming back to March would be a puzzle, and "today" is the
	 * only defensible place to open on.
	 */
	private calCursor = new Date();
	/** The day whose events list under a narrow month grid. */
	/**
	 * The day whose events are listed under a narrow month grid.
	 *
	 * Empty once you page to another month: the day you picked isn't on
	 * screen any more, so listing its events under a grid that doesn't
	 * contain it reads as a bug.
	 */
	private calSelected = todayISO();
	/**
	 * Which line each plan's bar runs on, and the days it covers — built
	 * with the grid, read by every cell the bar crosses.
	 */
	private calLanes = new Map<string, number>();
	private calSpanDays = new Map<string, string[]>();

	constructor(leaf: WorkspaceLeaf, private plugin: FriendTracker) {
		super(leaf);
		this.navigation = true;
		// Off the parameter, not `this.plugin` — parameter properties are
		// assigned before field initialisers, but not before this line.
		this.tab = plugin.settings.eventsTab ?? "timeline";
		this.calMode = plugin.settings.eventsCalendarMode ?? "month";
	}

	getViewType(): string {
		return VIEW_TYPE_EVENTS;
	}

	getDisplayText(): string {
		return "Events";
	}

	getIcon(): string {
		return "calendar-days";
	}

	async onOpen() {
		// Once for the life of the view, not per render — it only has to
		// know whether there's room beside the column.
		this.register(observePageRoom(this));
		const folder = this.plugin.eventOperations.getEventsFolderPath();
		// Settings are read at render time, so a change to one has to be
		// heard rather than waited on — otherwise it only lands on reopen.
		this.registerEvent(
			this.plugin.events.on("settings-changed", () => void this.refresh())
		);
		// The Plans folder too, since plans show here as well — without it a
		// re-dated plan would sit stale until some event happened to change.
		const plansFolder = this.plugin.planOperations.getPlansFolderPath();
		const inScope = (path: string) =>
			[folder, plansFolder].some(
				(f) => path === f || path.startsWith(f + "/")
			);
		registerVaultRefresh(this, this.plugin, () => void this.refresh(), {
			scope: inScope,
		});
		await this.refresh();
	}

	// Opening an Event file routes here with its path → open its view modal.
	async setState(state: unknown, result: ViewStateResult) {
		const focusPath = fieldOf(state, "focusPath");
		this.focusPath = typeof focusPath === "string" ? focusPath : null;
		await super.setState(state, result);
		await this.refresh();
	}

	getState() {
		return {
			type: VIEW_TYPE_EVENTS,
			focusPath: this.focusPath ?? undefined,
		};
	}

	async refresh() {
		// Timeline entries are records of a person, kept to their page —
		// this is your calendar, so they never reach the list or the
		// filters built from it.
		const events = this.plugin.eventOperations
			.getEvents()
			.filter((e) => e.variant !== "timeline")
			.map(eventItem);
		// Plans sit among the events for the same reason they do in the
		// dashboard's Upcoming: a trip is the biggest thing on the calendar.
		// Off by setting, or one plan at a time from its glance.
		const plans = this.plugin.settings.eventsShowPlans
			? plansForEventsPage(this.plugin.planOperations.getPlans()).map(
					planItem
			  )
			: [];
		this.items = [...events, ...plans];
		this.contacts = await this.plugin.contactOperations.getContacts();
		this.render();
	}

	// ---- People ----

	/** An event's people links resolved to vault paths (dead links drop). */
	private peoplePaths(e: PageItem): string[] {
		return this.plugin.eventOperations.peoplePaths(e);
	}

	private displayName(path: string): string {
		const match = this.contacts.find((c) => c.file.path === path);
		if (match) return match.displayName;
		// A group page, or someone outside the People folder — the file name
		// is still a better answer than the raw path.
		return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
	}

	/**
	 * Every name in full, joined — what the search reads.
	 *
	 * Deliberately not the summarised form the rows show: searching for
	 * somebody has to find them on a busy event too, and a roster that
	 * ended in "+3 more" would quietly stop matching the three.
	 */
	private peopleNames(e: PageItem): string {
		return this.peoplePaths(e)
			.map((p) => this.displayName(p))
			.join(", ");
	}

	/**
	 * The same roster as a row shows it — full for one person, shortened
	 * beyond that, and a count past three. A row has one line to spend on
	 * this, and an event with the whole book club on it would otherwise
	 * push its own name off the end.
	 */
	private peopleSummary(e: PageItem): string {
		return summarisePeople(
			this.peoplePaths(e).map((path) => {
				const match = this.contacts.find((c) => c.file.path === path);
				return {
					displayName: this.displayName(path),
					// Only a contact has one; a group page or a link out of
					// the People folder has nothing to shorten to.
					shortName: match?.shortName ?? "",
				};
			})
		);
	}

	/**
	 * Everyone who appears on at least one in-scope event, by name. This
	 * is the Person filter's roster — built from the events themselves
	 * rather than the friends list, so it never offers a name that would
	 * return nothing.
	 */
	private personRoster(scope: PageItem[]): { path: string; label: string }[] {
		const seen = new Map<string, string>();
		for (const e of scope) {
			for (const path of this.peoplePaths(e)) {
				if (!seen.has(path)) seen.set(path, this.displayName(path));
			}
		}
		return [...seen.entries()]
			.map(([path, label]) => ({ path, label }))
			.sort((a, b) => a.label.localeCompare(b.label));
	}

	// ---- Filtering ----

	/**
	 * Does an event pass the active filters? `over` swaps a single facet
	 * for a hypothetical value while the others stay live — which is how
	 * each chip prices itself: "picked, how many rows would you see?"
	 */
	private matchesFilters(
		e: PageItem,
		over: { type?: EventType; personPath?: string } = {}
	): boolean {
		const type = over.type ?? this.type;
		if (type && e.type !== type) return false;

		const personPath = over.personPath ?? this.personPath;
		if (personPath && !this.peoplePaths(e).includes(personPath)) {
			return false;
		}
		return true;
	}

	private matchesSearch(e: PageItem, q: string): boolean {
		if (!q) return true;
		return (
			e.name.toLowerCase().includes(q) ||
			e.description.toLowerCase().includes(q) ||
			e.location.toLowerCase().includes(q) ||
			this.peopleNames(e).toLowerCase().includes(q)
		);
	}

	/**
	 * List size with one facet swapped out — what a chip advertises.
	 *
	 * Runs the whole pipeline rather than just the facet tests: Upcoming
	 * and Past narrow the list too, and a chip promising 8 rows that then
	 * shows 3 would be worse than no count at all.
	 */
	private countWith(over: {
		type?: EventType;
		personPath?: string;
	}): number {
		return this.pipeline(over).length;
	}

	private sorted(): PageItem[] {
		return this.pipeline({});
	}

	/**
	 * What the chip rosters are built from: everything the when pills leave
	 * on the table, before any facet or search narrows it further.
	 *
	 * Upcoming and Past each hide half the timeline, so the chips have to
	 * follow — offering "🎸 Concert • 0" under Upcoming when every concert
	 * is in the past is just a dead end. But they stop there: a chip
	 * vanishing because of a filter you just applied (possibly the chip
	 * next to it) is disorienting, and would strand you with no way back.
	 */
	private inScope(): PageItem[] {
		return this.items.filter((e) =>
			matchesEventWhen(e.whenDate, this.when, new Date())
		);
	}

	/** Which day the grid opens on — 1 Monday, 0 Sunday. */
	private weekStartsOn(): 0 | 1 {
		return this.plugin.settings.weekStartsOn === 0 ? 0 : 1;
	}

	/** The column headings, rotated to match. */
	private weekdayNames(): string[] {
		const from = this.weekStartsOn();
		return WEEKDAYS.slice(from).concat(WEEKDAYS.slice(0, from));
	}

	private pipeline(over: {
		type?: EventType;
		personPath?: string;
		/** Skip the Upcoming / Past / All filter — the Calendar's arrows
		 * are its own, and a "when" on top of them would blank out half
		 * the month being looked at. */
		anyWhen?: boolean;
	}): PageItem[] {
		const q = this.searchQuery.trim().toLowerCase();
		const now = new Date();
		const matches = this.items.filter(
			(e) =>
				(over.anyWhen || matchesEventWhen(e.whenDate, this.when, now)) &&
				this.matchesFilters(e, over) &&
				this.matchesSearch(e, q)
		);
		// Looking back, the natural order runs the other way: the most
		// recent thing is the near end of the list, the way the next thing
		// is when looking forward.
		return applyEventSort(matches, this.plugin.settings.eventSort, {
			recentFirst: this.when === "past",
		});
	}

	// ---- Rendering ----

	private render() {
		const container = this.containerEl.children[1] as HTMLElement;
		const scrollTop = container.scrollTop;
		container.empty();
		container.addClass("dashboard-container", "somedays-container");

		const header = container.createDiv({ cls: "dashboard-header" });
		header.createEl("h2", { text: "Events" });
		const actions = header.createDiv({ cls: "dashboard-actions" });
		const newBtn = actions.createEl("button", { cls: "callander-button" });
		setIcon(newBtn, "plus");
		newBtn.createSpan({ text: "New event" });
		newBtn.addEventListener("click", () => this.openEditor());

		// What this page is — but only while it's empty. Once there are
		// events on screen they say what the page is far better than a
		// sentence does, and it becomes a line to scroll past every visit.
		if (this.items.length === 0) {
			container.createDiv({
				cls: "section-helper-text someday-intro-note",
				text: "Everything on the calendar — what's coming up, and everything you've already done together.",
			});
		}

		if (this.items.length > 0) {
			this.renderToolbar(container);
			// Upcoming / Past / All is a time filter, and on the Calendar
			// the arrows already are one. Leaving it up would let "Upcoming"
			// blank out the first half of the month you're looking at.
			if (this.tab !== "calendar") this.renderWhenStrip(container);
			else this.renderFilterRow(container);
			// Narrow first, then pick a view of what's left — the same order
			// the All friends page puts these in.
			this.renderTabs(container);
		}

		this.listEl = container.createDiv({ cls: "someday-list" });
		this.renderContent();

		applyPageWidth(container, this.plugin, this.pageWide, () => {
			this.pageWide = true;
			this.render();
		});

		container.scrollTop = scrollTop;
	}

	private filterPill(
		row: HTMLElement,
		label: string,
		active: boolean,
		onClick: () => void,
		/** Omitted for the when pills — a mode, not a facet worth pricing. */
		count?: number
	) {
		const pill = row.createEl("button", {
			cls: `someday-filter-pill${active ? " is-active" : ""}`,
			text: count === undefined ? label : `${label} • ${count}`,
			attr: { type: "button" },
		});
		pill.addEventListener("click", onClick);
		return pill;
	}

	private activeFilterCount(): number {
		return (this.type ? 1 : 0) + (this.personPath ? 1 : 0);
	}

	/**
	 * Upcoming / Past, on their own line under the toolbar — the same shape
	 * as the Somedays page's Today / Tomorrow strip, but mandatory: one is
	 * always on, and clicking the active one is a no-op rather than a way
	 * to clear it.
	 *
	 * Deliberately uncounted, like those: which half you're looking at is a
	 * mode, not a facet you'd want priced.
	 */
	private renderWhenStrip(container: HTMLElement) {
		// Which half of the timeline on the left, the filter toggle hard
		// right: both narrow the same list, so they belong on one line
		// rather than in two separate strips.
		const row = container.createDiv({ cls: "events-when-row" });
		const strip = row.createDiv({
			cls: "someday-filter-options someday-quick-days",
		});
		for (const { id, label } of EVENT_WHEN_FILTERS) {
			this.filterPill(strip, label, this.when === id, () => {
				if (this.when === id) return;
				this.when = id;
				this.render();
			});
		}

		this.appendFilterToggle(row);
		// Opens directly under the button rather than above the pills,
		// which is where it landed when it belonged to the toolbar.
		this.maybeFilterPanel(container);
	}

	/**
	 * The Filters button on its own line, for the Calendar tab — which has
	 * no when-pills to share a row with, but still filters by type, person
	 * and search like every other tab.
	 */
	/**
	 * The Calendar tab: a month or week grid with events in the cells.
	 *
	 * Deliberately not an hour grid, which is what a calendar of this shape
	 * usually is. Every event in Google Calendar has a start and an end;
	 * Callander's carry a flex date, often no time at all, and "Anytime" is
	 * a real value. A week of mostly-empty hour rows would assert a
	 * precision the notes don't have, so a week here is seven day columns.
	 */
	private renderCalendar() {
		const listEl = this.listEl;
		if (!listEl) return;
		listEl.empty();
		const wrap = listEl.createDiv({ cls: "cal" });

		// The calendar navigates time itself, so it reads past the when
		// filter — but still honours type, person and search.
		const shown = this.pipeline({ anyWhen: true });
		// A plan lands on every day it spans, not just the one it starts on —
		// a weekend away is the whole weekend. Plans go in first so that,
		// among the untimed, a day's plan leads its events: it's the
		// container for the day, the same tie the dashboard breaks.
		const placed = [
			...shown.filter((i) => i.kind === "plan"),
			...shown.filter((i) => i.kind === "event"),
		].flatMap((item): { item: PageItem; day: string }[] =>
			item.kind === "plan"
				? planDays(item.plan).map((day) => ({ item, day }))
				: [{ item, day: item.date }]
		);
		const byDay = new Map(
			[
				...eventsByDay(
					placed,
					(p) => p.day,
					(p) => p.item.time
				),
			].map(([day, list]) => [day, list.map((p) => p.item)])
		);

		// A plan keeps one line across every cell it crosses — see
		// assignSpanLanes.
		const spans = shown
			.filter((i) => i.kind === "plan")
			.map((i) => ({ key: i.file.path, days: planDays(i.plan) }))
			.filter((s) => s.days.length > 0);
		this.calLanes = assignSpanLanes(spans);
		this.calSpanDays = new Map(spans.map((s) => [s.key, s.days]));

		this.appendCalBar(wrap);
		const days =
			this.calMode === "month"
				? monthGrid(this.calCursor, new Date(), this.weekStartsOn())
				: weekGrid(this.calCursor, new Date(), this.weekStartsOn());

		if (this.calMode === "month") {
			const head = wrap.createDiv({ cls: "cal-weekdays" });
			for (const d of this.weekdayNames()) {
				head.createSpan({ text: d });
			}
		}

		const grid = wrap.createDiv({
			cls: this.calMode === "month" ? "cal-grid" : "cal-week",
		});
		for (const day of days) {
			this.appendCalCell(grid, day, byDay.get(day.date) ?? []);
		}

		// Always built, never conditionally: the container query decides
		// whether it shows, and rebuilding on resize is not something a
		// stylesheet can ask a view to do.
		if (this.calMode === "month") this.appendDayAgenda(wrap, byDay);
	}

	/** Period label on the left, navigation and the month/week pair right. */
	private appendCalBar(wrap: HTMLElement) {
		const bar = wrap.createDiv({ cls: "cal-bar" });
		bar.createSpan({
			cls: "cal-period",
			// Abbreviated on a phone, where the bar has four buttons beside
			// it and a nine-letter month pushed them onto a second row.
			text:
				this.calMode === "month"
					? monthLabel(this.calCursor, this.isNarrow())
					: weekLabel(
							this.calCursor,
							this.weekStartsOn(),
							this.isNarrow()
					  ),
		});

		const nav = bar.createDiv({ cls: "cal-nav" });
		const step = (by: number) => {
			const next = new Date(this.calCursor);
			if (this.calMode === "month") next.setMonth(next.getMonth() + by);
			else next.setDate(next.getDate() + by * 7);
			this.calCursor = next;
			// The day you'd picked is in the month you just left.
			this.calSelected = "";
			this.renderContent();
		};
		const button = (
			label: string,
			aria: string,
			onClick: () => void
		): HTMLElement => {
			const b = nav.createEl("button", {
				cls: "callander-button cal-nav-button",
				text: label,
				attr: { type: "button", "aria-label": aria },
			});
			b.addEventListener("click", onClick);
			return b;
		};
		button("‹", "Previous", () => step(-1));
		button("Today", "Today", () => {
			this.calCursor = new Date();
			this.calSelected = todayISO();
			this.renderContent();
		});
		button("›", "Next", () => step(1));

		const modes = nav.createDiv({ cls: "cal-modes" });
		for (const mode of ["month", "week"] as CalendarMode[]) {
			const active = this.calMode === mode;
			const b = modes.createEl("button", {
				cls: `callander-button cal-mode${active ? " is-active" : ""}`,
				text: mode === "month" ? "Month" : "Week",
				attr: { type: "button", "aria-pressed": String(active) },
			});
			b.addEventListener("click", () => {
				if (this.calMode === mode) return;
				this.calMode = mode;
				this.renderContent();
				this.plugin.settings.eventsCalendarMode = mode;
				void this.plugin.saveSettings();
			});
		}
	}

	private appendCalCell(
		grid: HTMLElement,
		day: CalendarDay,
		events: PageItem[]
	) {
		const cls = ["cal-cell"];
		if (!day.inMonth) cls.push("is-outside");
		if (day.isToday) cls.push("is-today");
		if (day.date === this.calSelected) cls.push("is-selected");
		const cell = grid.createDiv({ cls: cls.join(" ") });

		const head = cell.createDiv({ cls: "cal-cell-head" });
		head.createSpan({ cls: "cal-daynum", text: String(day.day) });
		if (this.calMode === "week") {
			head.createSpan({
				cls: "cal-dow",
				text: WEEKDAYS[new Date(day.date + "T00:00:00").getDay()],
			});
		}

		// Plans lead, each held to its own lane so a bar crossing several
		// days stays on one line. A lane whose plan doesn't reach this day
		// gets an empty slot rather than letting the ones below it rise.
		const plans = events.filter((e) => e.kind === "plan");
		const rest = events.filter((e) => e.kind !== "plan");
		const laneOf = (item: PageItem) =>
			this.calLanes.get(item.file.path) ?? 0;
		const lanes =
			plans.length === 0 ? 0 : Math.max(...plans.map(laneOf)) + 1;
		for (let lane = 0; lane < lanes; lane++) {
			const held = plans.find((p) => laneOf(p) === lane);
			const run = held
				? spanRun(
						this.calSpanDays.get(held.file.path) ?? [],
						day.date,
						this.weekStartsOn()
				  )
				: null;
			// The bar is drawn once per row, by the cell that opens the run,
			// and spans the columns it covers — so its title reads across the
			// whole thing rather than truncating inside the first square.
			// Every other cell of the run holds an empty slot instead.
			if (held && run?.opens) this.appendCalChip(cell, held, run);
			else {
				const slot = cell.createDiv({
					cls: "cal-chip is-stacked cal-span-spacer",
				});
				slot.createDiv({ cls: "cal-chip-name", text: "\u00a0" });
				slot.createDiv({ cls: "cal-chip-meta", text: "\u00a0" });
			}
		}

		// Chips on a wide pane; the dots below are what a narrow one shows.
		const room = Math.max(0, CAL_CHIPS - lanes);
		for (const event of rest.slice(0, room)) {
			this.appendCalChip(cell, event);
		}
		if (rest.length > room) {
			cell.createDiv({
				cls: "cal-more",
				text: `+${rest.length - room} more`,
			});
		}
		// What a narrow pane shows in place of the chips. An emoji says what
		// kind of thing is on that day where a coloured dot only says
		// "something is" — at roughly 46px a column there's room for a
		// glyph and none for a word, so it's the most a cell can carry.
		//
		// A cancelled event is left out of it entirely: a glyph can't be
		// faded into meaning "not happening" at that size, and one of three
		// slots is too much to spend saying a thing is off. It's still in
		// the day's list underneath, which is where it can say so.
		const live = events.filter((e) => e.status !== "cancelled");
		if (live.length > 0) {
			const dots = cell.createDiv({ cls: "cal-dots" });
			// Measured against a padded phone column of ~46px: a glyph is
			// 11px and a "+N" is 12.
			// Three glyphs fit; three and a count do not. So a quiet day
			// shows all three and a busy one trades the third for the count,
			// which is the only arrangement that always fits and always
			// tells the truth about how much is there.
			const room = live.length <= CAL_DOTS ? CAL_DOTS : CAL_DOTS - 1;
			for (const event of live.slice(0, room)) {
				const glyph = this.eventGlyph(event);
				if (glyph) {
					dots.createSpan({ cls: "cal-glyph", text: glyph });
					continue;
				}
				// An untyped event with no emoji of its own still has to
				// register — the dot is what it falls back to.
				const dot = dots.createSpan({ cls: "cal-dot" });
				dot.style.backgroundColor = this.itemColour(event);
			}
			if (live.length > room) {
				dots.createSpan({
					cls: "cal-glyph-more",
					text: `+${live.length - room}`,
				});
			}
		}

		// Empty space in a cell adds an event on that day. The chips stop
		// their own clicks, so this only fires where nothing was hit.
		cell.addEventListener("click", () => {
			// A narrow week is already every day stacked with its events
			// under it — there is no agenda to point at, so picking a day
			// would redraw the same screen and highlight one row of it for
			// no reason.
			if (this.isNarrow() && this.calMode === "week") return;
			this.calSelected = day.date;
			// On a narrow pane a tap picks the day rather than opening a
			// modal — the day's events are what you're reaching for, and
			// they're right underneath.
			if (this.isNarrow()) this.renderContent();
			else this.openEditor({ date: day.date });
		});
	}

	/**
	 * One event in a calendar square, over two lines.
	 *
	 * The name gets a line to itself, the way the B'day Calendar gives a
	 * person theirs: on one line the icon and the time ate the front of it
	 * and every chip in a busy week truncated to the same few characters.
	 *
	 * An emoji the name already leads with stands in for the type icon —
	 * somebody who typed one chose it for this event, where the type emoji
	 * is the same on every hangout. It moves to the meta line so the name
	 * reads as words and the icon stays in one place down the column.
	 */
	/**
	 * The one character that stands for an event: its own leading emoji if
	 * it has one, else its type's. Shared by the chip and the narrow grid so
	 * the same event reads the same at both widths.
	 */
	private eventGlyph(event: PageItem): string | undefined {
		return (
			splitLeadingEmoji(event.name)?.emoji ??
			(event.kind === "plan"
				? PLAN_ICON
				: EVENT_TYPES.find((t) => t.id === event.type)?.emoji)
		);
	}

	private appendCalChip(cell: HTMLElement, event: PageItem, run?: SpanRun) {
		// A plan covering more than a day draws as a bar across them rather
		// than as the same chip repeated in each square.
		const days = this.calSpanDays.get(event.file.path) ?? [];
		const span = run && run.length + (run.continues ? 1 : 0) > 1;

		const cls = ["cal-chip", "is-stacked"];
		// Still on the calendar, because a day you'd kept free is worth
		// seeing — just faded, so it doesn't read as something happening.
		if (event.status === "cancelled") cls.push("is-cancelled");
		if (span) {
			cls.push("is-span");
			// Squared off where the bar carries on into the next row, so the
			// week break doesn't read as the end of the trip.
			if (run.continues) cls.push("is-span-open-end");
		}
		const chip = cell.createDiv({ cls: cls.join(" ") });
		chip.style.setProperty("--cal-chip", this.itemColour(event));
		if (span) chip.style.setProperty("--span-cols", String(run.length));

		const own = splitLeadingEmoji(event.name);
		chip.createDiv({
			cls: "cal-chip-name",
			text: own ? own.rest : event.name,
		});

		// Second line: the glyph, and then what places the thing in time —
		// an event's start time, or the days a plan runs across. A bar broken
		// over a week boundary carries the whole span on both halves.
		//
		// A cancelled event keeps its name and nothing else: what kind of
		// thing it was and what time it would have started are details of an
		// evening that isn't happening.
		const meta =
			event.status === "cancelled"
				? ""
				: calendarChipMeta(
						this.eventGlyph(event),
						span
							? planSpanLabel(days)
							: event.time
							? shortTime(event.time)
							: "",
						// Whose evening it is, the same summarised roster the
						// rows show. A plan's line is already spoken for by
						// the days it runs across.
						span ? "" : this.peopleSummary(event)
				  );
		if (meta) chip.createDiv({ cls: "cal-chip-meta", text: meta });

		chip.addEventListener("click", (e) => {
			e.stopPropagation();
			this.openItem(event);
		});
	}

	/**
	 * The selected day's events, listed under a narrow month grid.
	 *
	 * Seven columns of chips don't fit a phone, so the grid keeps its shape
	 * and drops to dots while the detail moves here — the same answer Google
	 * Calendar, Apple and Fantastical all arrive at.
	 */
	private appendDayAgenda(wrap: HTMLElement, byDay: Map<string, PageItem[]>) {
		const agenda = wrap.createDiv({ cls: "cal-agenda" });
		// Nothing picked in this month yet — say so rather than showing a
		// day from the one before it.
		if (!this.calSelected) {
			agenda.createDiv({
				cls: "section-helper-text",
				text: "Pick a day to see what's on.",
			});
			return;
		}
		const day = new Date(this.calSelected + "T00:00:00");
		const head = agenda.createDiv({ cls: "cal-agenda-head" });
		head.createSpan({ text: formatShortWeekdayDate(day) });
		const add = head.createEl("button", {
			cls: "callander-button cal-agenda-add",
			text: "+ Add",
			attr: { type: "button" },
		});
		add.addEventListener("click", () =>
			this.openEditor({ date: this.calSelected })
		);

		const events = byDay.get(this.calSelected) ?? [];
		if (events.length === 0) {
			agenda.createDiv({
				cls: "section-helper-text",
				text: "Nothing on this day",
			});
			return;
		}
		for (const event of events) this.renderRow(agenda, event);
	}

	/** Whether the pane is too narrow for chips — matches the CSS breakpoint. */
	private isNarrow(): boolean {
		const el = this.containerEl.children[1] as HTMLElement;
		return el.clientWidth > 0 && el.clientWidth <= CAL_NARROW;
	}

	private renderFilterRow(container: HTMLElement) {
		const row = container.createDiv({ cls: "events-when-row" });
		row.createSpan();
		this.appendFilterToggle(row);
		this.maybeFilterPanel(container);
	}

	/** Labelled rather than icon-only: out here it has no toolbar around it
	 * to lend it context. */
	private appendFilterToggle(row: HTMLElement) {
		const filterBtn = row.createEl("button", {
			cls: `callander-button someday-filter-toggle${
				this.filtersOpen ? " is-open" : ""
			}`,
			attr: {
				type: "button",
				"aria-expanded": String(this.filtersOpen),
			},
		});
		setIcon(filterBtn, "filter");
		filterBtn.createSpan({ text: "Filters" });
		const active = this.activeFilterCount();
		if (active > 0) {
			filterBtn.createSpan({
				cls: "someday-filter-count",
				text: String(active),
			});
		}
		filterBtn.addEventListener("click", () => {
			this.filtersOpen = !this.filtersOpen;
			this.render();
		});
	}

	/**
	 * One line of chrome: Search stretching left, Sort and Filters pinned
	 * right — the Somedays page's toolbar, minus the quick-day strip that
	 * has no meaning for a fixed date.
	 */
	private renderToolbar(container: HTMLElement) {
		const toolbar = container.createDiv({ cls: "someday-toolbar" });

		const searchInput = toolbar.createEl("input", {
			attr: { type: "text", placeholder: "Search events…" },
			cls: "contact-field-input someday-toolbar-search",
		});
		searchInput.value = this.searchQuery;
		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value;
			this.renderList();
		});

		// Sorting only means something on the List. The timeline is
		// chronological by definition, so rather than leave a dropdown that
		// changes nothing, it isn't drawn. Only the sort is skipped — the
		// filters below apply to every tab.
		if (this.tab !== "list") return;

		const sortSel = toolbar.createEl("select", {
			cls: "dropdown someday-filter-select",
		});
		EVENT_SORTS.forEach((s) =>
			sortSel.createEl("option", { value: s.id, text: s.label })
		);
		// A vault saved earlier may still hold "upcoming" or "past" (before
		// they became filters) or "soonest"/"nearest" (this sort's old
		// names); all
		// fall back to Natural rather than leaving the select blank.
		sortSel.value = eventSortOf(this.plugin.settings.eventSort);
		const handleSortChange = async () => {
			this.plugin.settings.eventSort = sortSel.value as EventSort;
			await this.plugin.saveSettings();
			this.render();
		};
		sortSel.addEventListener("change", () => void handleSortChange());

	}

	private maybeFilterPanel(container: HTMLElement) {
		if (this.filtersOpen) this.renderFilterPanel(container);
	}

	/** List / Timeline / Calendar, as on All friends. */
	private renderTabs(container: HTMLElement) {
		const tabs = container.createDiv({
			cls: "callander-tabs",
			attr: { role: "tablist" },
		});
		const TABS: Array<{ id: FriendListTab; label: string }> = [
			{ id: "timeline", label: "Timeline" },
			{ id: "list", label: "List" },
			{ id: "calendar", label: "Calendar" },
		];
		for (const { id, label } of TABS) {
			const active = this.tab === id;
			const button = tabs.createEl("button", {
				cls: `callander-tab${active ? " active" : ""}`,
				text: label,
				attr: {
					type: "button",
					role: "tab",
					"aria-selected": String(active),
				},
			});
			button.addEventListener("click", () => {
				if (this.tab === id) return;
				this.tab = id;
				this.render();
				// After the redraw: the write fires settings-changed and a
				// refresh of its own, and the tab has to look switched now.
				this.plugin.settings.eventsTab = id;
				void this.plugin.saveSettings();
			});
		}
	}

	/**
	 * Rebuild just the list, keeping where you were reading.
	 *
	 * Every one of these empties the list before refilling it, and an empty
	 * list is short enough that the browser clamps the scroll position to
	 * fit — so picking a day in the calendar threw you back to the top and
	 * made you scroll down again to see what you'd picked. Restoring after
	 * the rebuild is enough: the content is back to full height by then, so
	 * the position is still reachable.
	 */
	private renderContent() {
		const container = this.containerEl.children[1] as HTMLElement;
		const scrollTop = container.scrollTop;
		if (this.tab === "timeline") {
			this.renderTimeline();
		} else if (this.tab === "calendar") {
			this.renderCalendar();
		} else {
			this.renderList();
		}
		container.scrollTop = scrollTop;
	}

	/**
	 * The same events the List would show, under a heading per week.
	 *
	 * Headings name the near future by how soon it is — This week, Next
	 * week, Later this month — and everything past that by its month. Only
	 * groups holding something are drawn: this follows the Upcoming / Past
	 * / All mode, and on Past that reaches back years, where empty headings
	 * would bury the real ones. Rows are the List's own, so an event looks
	 * the same whichever tab you're on.
	 */
	private renderTimeline() {
		const listEl = this.listEl;
		if (!listEl) return;
		listEl.empty();

		const list = this.sorted();
		if (list.length === 0) {
			listEl.createDiv({
				cls: "section-helper-text",
				text: this.emptyMessage(),
			});
			return;
		}

		const wrap = listEl.createDiv({ cls: "events-timeline" });
		// Looking backwards, every month heading carries its year: a bare
		// "August" next to "August 2025" reads as two different kinds of
		// thing when both are simply months that have been. Upcoming keeps
		// the bare form, where this year needs no saying.
		const groups = groupEventsByPeriod(list, (e) => e.date, new Date(), {
			alwaysYear: this.when !== "upcoming",
			weekStartsOn: this.weekStartsOn(),
			// Looking back, the headings run latest-first too — the rows
			// inside them already do, and a timeline whose months descend
			// while its rows ascend reads as neither order.
			recentFirst: this.when === "past",
		});
		for (const period of groups) {
			wrap.createDiv({
				cls: "contact-timeline-year events-timeline-week",
				text: period.label,
			});
			for (const event of period.items) this.renderRow(wrap, event);
		}
	}

	private renderFilterPanel(container: HTMLElement) {
		const wrap = container.createDiv({ cls: "someday-filters" });

		// Both rows are built from what the SORT leaves in scope (see
		// inScope) and go no further: a chip renders when any in-scope
		// event satisfies its facet, whatever the other live filters say.
		// Chips vanishing as you filter — especially the selected one — is
		// jarring and can strand a selection you can no longer clear. The
		// counts, by contrast, are live: each chip prices itself as if it
		// were the only filter in its group, with search and the other
		// group still applied, so a roster chip can honestly read 0.
		const scope = this.inScope();

		const typeRow = wrap.createDiv({ cls: "someday-filter-row" });
		typeRow.createSpan({ cls: "someday-filter-label", text: "Type" });
		const typeOpts = typeRow.createDiv({ cls: "someday-filter-options" });
		EVENT_TYPES.forEach((t) => {
			// The current pick always renders, even once it's out of scope —
			// otherwise changing the sort could leave it applied invisibly.
			if (!scope.some((e) => e.type === t.id) && this.type !== t.id) {
				return;
			}
			this.filterPill(
				typeOpts,
				`${t.emoji} ${t.label}`,
				this.type === t.id,
				() => {
					this.type = this.type === t.id ? "" : t.id;
					this.render();
				},
				this.countWith({ type: t.id })
			);
		});

		const roster = this.personRoster(scope);
		// Keep the current pick on the row even when the sort has taken
		// their last event out of scope — otherwise the filter stays
		// applied with nothing left to unclick it.
		if (this.personPath && !roster.some((p) => p.path === this.personPath)) {
			roster.push({
				path: this.personPath,
				label: this.displayName(this.personPath),
			});
			roster.sort((a, b) => a.label.localeCompare(b.label));
		}
		if (roster.length === 0) return;
		const personRow = wrap.createDiv({ cls: "someday-filter-row" });
		personRow.createSpan({ cls: "someday-filter-label", text: "Person" });
		const personOpts = personRow.createDiv({
			cls: "someday-filter-options",
		});
		for (const person of roster) {
			this.filterPill(
				personOpts,
				person.label,
				this.personPath === person.path,
				() => {
					this.personPath =
						this.personPath === person.path ? "" : person.path;
					this.render();
				},
				this.countWith({ personPath: person.path })
			);
		}
	}

	private renderList() {
		const listEl = this.listEl;
		if (!listEl) return;
		listEl.empty();

		const list = this.sorted();

		// A narrowed list says how narrowed it is — search and filters can
		// hide a lot, and the count keeps that honest. The ghost ✕ beside
		// it resets the lot.
		const narrowed =
			this.searchQuery.trim().length > 0 || this.activeFilterCount() > 0;
		if (narrowed && this.items.length > 0) {
			const head = listEl.createDiv({ cls: "someday-results-head" });
			head.createEl("h3", {
				cls: "someday-results-heading",
				text: `Results (${list.length})`,
			});
			const clear = head.createEl("button", {
				cls: "someday-clear-button",
				text: "✕ Clear",
				attr: {
					type: "button",
					"aria-label": "Clear search and filters",
				},
			});
			clear.addEventListener("click", () => {
				this.searchQuery = "";
				this.type = "";
				this.personPath = "";
				this.render();
			});
		}
		if (list.length === 0) {
			listEl.createDiv({
				cls: "section-helper-text",
				text: this.emptyMessage(),
			});
			return;
		}

		for (const event of list) this.renderRow(listEl, event);

		// A row opened directly (via its file) → open its view modal, once.
		if (this.focusPath) {
			const target = list.find((e) => e.file.path === this.focusPath);
			this.focusPath = null;
			if (target) this.openItem(target);
		}
	}

	/**
	 * Why the list is empty. Upcoming and Past each hide half the
	 * timeline, so an empty list under one of them usually means "look at
	 * the other half" rather than "you have nothing" — blaming the
	 * filters would send you hunting for a filter you never set.
	 */
	private emptyMessage(): string {
		if (this.items.length === 0) {
			return "No events yet. Add the first thing worth remembering.";
		}
		const narrowed =
			this.searchQuery.trim().length > 0 || this.activeFilterCount() > 0;
		if (narrowed) return "Nothing matches these filters.";
		// The when pills are the only thing left that can empty a full list,
		// and each one's way out is the other.
		if (this.when === "upcoming") {
			return "Nothing coming up — try Past to see what you've already done.";
		}
		if (this.when === "past") {
			return "Nothing has happened yet — try Upcoming to see what's ahead.";
		}
		return "Nothing matches these filters.";
	}

	private renderRow(container: HTMLElement, event: PageItem) {
		const now = new Date();
		const people = this.peopleSummary(event);
		const fields =
			event.kind === "plan"
				? planRowFields(event.plan, now, people)
				: eventRowFields(event.event, now, people);
		const row = buildUpcomingRow(container, {
			...fields,
			// The "past" emphasis earns its keep on the dashboard, where a
			// gone-by date among upcoming ones means something slipped. Here
			// most of the page is history, so it would shout on every second
			// row and pick out nothing. "soon" still applies — that's the
			// one thing worth catching your eye on a calendar.
			tone: fields.tone === "past" ? undefined : fields.tone,
			onClick: () => this.openItem(event),
		});
		// The day list under a narrow grid is where a cancelled event gets
		// read, since its cell has no room to say so — see the glyphs.
		if (event.status === "cancelled") row.addClass("is-cancelled-row");
	}

	private openItem(item: PageItem) {
		if (item.kind === "plan") this.openPlanGlance(item.plan);
		else this.openViewModal(item.event);
	}

	/**
	 * A plan opens at a glance rather than navigating away — the modal the
	 * dashboard's Upcoming uses, with its "Hide from this list" taking the
	 * plan off this page only. The dashboard's Plans section puts it back.
	 */
	private openPlanGlance(plan: PlanInfo) {
		new PlanGlanceModal(
			this.app,
			plan,
			() => void this.plugin.openContactPage(plan.file),
			(hidden) =>
				this.plugin.planOperations.setHiddenFrom(
					plan.file,
					"events",
					hidden
				)
		).open();
	}

	/** A plan has no type to take a colour from, so it borrows the accent —
	 * it's the one thing on the grid that isn't an event. */
	private itemColour(item: PageItem): string {
		return item.kind === "plan"
			? "var(--interactive-accent)"
			: eventColour(item.type);
	}

	private openViewModal(event: EventInfo) {
		new EventViewModal(this.app, this.plugin, event, () =>
			this.refresh()
		).open();
	}

	private openEditor(prefill?: { date: string }) {
		new EventModal(
			this.app,
			this.plugin,
			null,
			() => this.refresh(),
			prefill
		).open();
	}
}
