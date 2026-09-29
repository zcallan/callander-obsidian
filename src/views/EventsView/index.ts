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
	ContactWithCountdown,
	EventInfo,
	FriendListTab,
	PlanInfo,
} from "@/types";
import { EventModal } from "@/modals/EventModal";
import { EventViewModal } from "@/modals/EventViewModal";
import { EVENT_TYPES, type EventType } from "@/constants";
import { displayZone } from "@/utils/timezone";
import {
	EVENT_SORTS,
	EVENT_WHEN_FILTERS,
	eventRowFields,
	eventSortOf,
	matchesEventWhen,
	type EventSort,
	type EventWhen,
} from "@/utils/eventRow";
import { buildUpcomingRow } from "@/components/UpcomingRow";
import { inFolders, registerPageRefresh } from "@/utils/vaultRefresh";
import { groupEventsByPeriod } from "@/utils/eventGroups";
import { todayISO } from "@/utils/flexdate";
import {
	eventBoardItem,
	planBoardItem,
	renderCalendarBoard,
	type BoardState,
} from "@/components/calendarBoard";
import { summarisePeople } from "@/utils/nameFormat";
import {
	calendarEventColor,
	categoryColors,
	groupColorFor,
} from "@/utils/categoryColor";
import { CalendarColorsModal } from "@/modals/CalendarColorsModal";
import {
	appendDrawer,
	appendDrawerToggle,
	colorOptions,
	displayOptions,
	type DrawerSection,
	EVENTS_TAB_DRAWER,
} from "@/components/calendarDrawer";
import {
	categoryShown,
	filterableCategories,
	setCategoryShown,
	shownByCategory,
	visibleCategoryCount,
} from "@/utils/eventCategories";
import { PlanGlanceModal } from "@/modals/PlanGlanceModal";
import { appendTimezoneBanner } from "@/components/timezoneBanner";
import { planRowFields, plansForEventsPage } from "@/utils/planRow";
import {
	type EventPageItem,
	eventPageItem,
	eventPipeline,
	planPageItem,
} from "@/utils/eventList";
import { weekStartsOn } from "@/utils/calendarGrid";
import { SearchBox } from "@/components/searchBox";

export const VIEW_TYPE_EVENTS = "callander-events";

/**
 * Whether the Calendar tab offers a week view. Off for now: it's month
 * only, with no Month / Week switch. Everything behind the switch — the
 * week grid, the remembered eventsCalendarMode — is left in place, so
 * turning this back on is the whole of bringing it back.
 */
const WEEK_VIEW = false;

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
	private items: EventPageItem[] = [];
	/** Fetched alongside the events, to turn people wikilinks into names. */
	private contacts: ContactWithCountdown[] = [];
	private searchQuery = "";
	private readonly search = new SearchBox();
	private focusPath: string | null = null;
	private listEl: HTMLElement | null = null;

	// Filters — one type, one category and one person at a time, like the
	// Somedays page's own single-pick facets.
	private type: EventType | "" = "";
	private category = "";
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
	/**
	 * The Calendar tab's month or week, which of them is showing, and the
	 * day picked under a narrow month. The mode is remembered like the tab
	 * itself; the cursor isn't — paging away and coming back to March would
	 * be a puzzle, and "today" is the only defensible place to open on.
	 */
	private cal: BoardState;
	/** The Calendar tab's drawer. Open for this view only; every page
	 * open starts with it shut, as on the Calendar page. */
	private drawerOpen = false;
	/** Whether the drawer's category list is unfolded past "Show N more" —
	 * kept here because the drawer itself is redrawn on every tick. */
	private categoriesExpanded = false;

	constructor(leaf: WorkspaceLeaf, private plugin: FriendTracker) {
		super(leaf);
		this.navigation = true;
		// Off the parameter, not `this.plugin` — parameter properties are
		// assigned before field initialisers, but not before this line.
		this.tab = plugin.settings.eventsTab ?? "timeline";
		this.cal = {
			// Month while the week view is off, whatever was remembered — a
			// saved "week" would otherwise strand the tab with no switch.
			mode: WEEK_VIEW ? plugin.settings.eventsCalendarMode ?? "month" : "month",
			cursor: new Date(),
			selected: todayISO(),
		};
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
		// The Plans folder too, since plans show here as well — without it a
		// re-dated plan would sit stale until some event happened to change.
		// And People: rows name who's coming by their display names. Read
		// when an event arrives, so a changed base folder is heard too.
		registerPageRefresh(this, this.plugin, () => void this.refresh(), {
			scope: (path) =>
				inFolders(
					this.plugin.eventOperations.getEventsFolderPath(),
					this.plugin.planOperations.getPlansFolderPath(),
					this.plugin.contactOperations.getPeopleFolderPath()
				)(path),
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

	/**
	 * The Calendar tab back on this month with today picked — where it opens,
	 * and what a phone lists under the grid. Only redrawn when that tab is
	 * showing; the others don't read it.
	 */
	public goToToday() {
		this.cal.cursor = new Date();
		this.cal.selected = todayISO();
		if (this.tab === "calendar") this.renderContent();
	}

	async refresh() {
		// Timeline entries are records of a person, kept to their page —
		// this is your calendar, so they never reach the list or the
		// filters built from it.
		const events = this.plugin.eventOperations
			.getEvents()
			.filter((e) => e.variant !== "timeline")
			.map(eventPageItem);
		// Plans sit among the events for the same reason they do in the
		// dashboard's Upcoming: a trip is the biggest thing on the calendar.
		// Off by setting, or one plan at a time from its glance.
		const plans = this.plugin.settings.eventsShowPlans
			? plansForEventsPage(this.plugin.planOperations.getPlans()).map(
					planPageItem
			  )
			: [];
		this.items = [...events, ...plans];
		this.contacts = await this.plugin.contactOperations.getContacts();
		this.render();
		this.openFocused();
	}

	// ---- People ----

	/** An event's people links resolved to vault paths (dead links drop). */
	private peoplePaths(e: EventPageItem): string[] {
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
	private peopleNames(e: EventPageItem): string {
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
	private peopleSummary(e: EventPageItem): string {
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
	private personRoster(
		scope: EventPageItem[]
	): { path: string; label: string }[] {
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
	 * List size with one facet swapped out — what a chip advertises.
	 *
	 * Runs the whole pipeline rather than just the facet tests: Upcoming
	 * and Past narrow the list too, and a chip promising 8 rows that then
	 * shows 3 would be worse than no count at all.
	 */
	private countWith(over: {
		type?: EventType;
		category?: string;
		personPath?: string;
	}): number {
		return this.pipeline(over).length;
	}

	private sorted(): EventPageItem[] {
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
	private inScope(): EventPageItem[] {
		return this.items.filter((e) =>
			matchesEventWhen(e.whenDate, this.when, new Date())
		);
	}

	private pipeline(over: {
		type?: EventType;
		category?: string;
		personPath?: string;
		/** Skip the Upcoming / Past / All filter — the Calendar's arrows
		 * are its own, and a "when" on top of them would blank out half
		 * the month being looked at. */
		anyWhen?: boolean;
	}): EventPageItem[] {
		return eventPipeline(
			this.items,
			{
				when: this.when,
				anyWhen: over.anyWhen,
				type: over.type ?? this.type,
				category: over.category ?? this.category,
				personPath: over.personPath ?? this.personPath,
				query: this.searchQuery,
			},
			this.plugin.settings.eventSort,
			{
				paths: (e) => this.peoplePaths(e),
				names: (e) => this.peopleNames(e),
			},
			new Date()
		);
	}

	// ---- Rendering ----

	private render() {
		const container = this.contentEl;
		const scrollTop = container.scrollTop;
		this.search.hold();
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
			appendTimezoneBanner(container, this.plugin, () => this.render());
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
		return (
			(this.type ? 1 : 0) +
			(this.category ? 1 : 0) +
			(this.personPath ? 1 : 0)
		);
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
	 * The Calendar tab — the shared board (see calendarBoard), fed with
	 * what's left after the filters.
	 */
	private renderCalendar() {
		const listEl = this.listEl;
		if (!listEl) return;
		listEl.empty();
		// The calendar navigates time itself, so it reads past the when
		// filter — but still honours type, person and search, and then the
		// drawer's own choices: whether plans show, and which categories.
		const settings = this.plugin.settings;
		// The colours picked in either calendar's colour settings — shared,
		// so a category reads the same here as on the Calendar page.
		const colors = settings.calendarGroupColors;
		const palette = categoryColors(
			this.plugin.eventOperations.getEventCategories()
		);
		const items = this.pipeline({ anyWhen: true })
			.filter((item) =>
				item.kind === "plan"
					? settings.eventsCalShowPlans
					: shownByCategory(
							item.event.categories,
							settings.eventsCalHiddenCategories
					  )
			)
			.map((item) => {
			const people = this.peopleSummary(item);
			const open = () => this.openItem(item);
			const row = (el: HTMLElement) => this.renderRow(el, item, true);
			if (item.kind === "plan") {
				const plan = planBoardItem(item.plan, people, open, row);
				if (settings.eventsCalColorByGroup) {
					plan.colour = groupColorFor("plan", colors);
				}
				return plan;
			}
			const event = eventBoardItem(
				item.event,
				people,
				open,
				row,
				displayZone(settings.displayTimezone)
			);
			event.colour = calendarEventColor(item.event, {
				byGroup: settings.eventsCalColorByGroup,
				byCategory: settings.eventsCalUseCategoryColors,
				byType: settings.eventsCalColorByType,
				custom: colors,
				palette,
			});
			return event;
		});
		renderCalendarBoard(listEl, {
			state: this.cal,
			items,
			weekStartsOn: weekStartsOn(this.plugin.settings),
			rerender: () => this.renderContent(),
			onModeChange: (mode) => {
				this.plugin.settings.eventsCalendarMode = mode;
				void this.plugin.saveSettings();
			},
			onAdd: (date) => this.openEditor({ date }),
			showModes: WEEK_VIEW,
			wrapNames: settings.eventsCalWrapNames,
			hideDateTime: settings.eventsCalHideDateTime,
			narrowNames: settings.eventsCalNarrowNames,
			colorBackgrounds: settings.eventsCalColorBackgrounds,
			fadePastEvents: settings.eventsCalFadePastEvents,
			lead: (title) =>
				appendDrawerToggle(title, this.drawerOpen, () => {
					this.drawerOpen = !this.drawerOpen;
					this.renderContent();
				}),
			// The Calendar page's layout: the drawer beside the grid, under
			// the bar, so the ☰ that opened it stays put.
			body: (wrap) => {
				const body = wrap.createDiv({ cls: "fullcal-body" });
				if (this.drawerOpen) appendDrawer(body, this.drawerSections());
				return body.createDiv({ cls: "fullcal-main" });
			},
		});
	}

	/**
	 * The Calendar tab's drawer — the Calendar page's, less its Calendars
	 * section (this page is events, and plans have their own tick here):
	 * the categories to show, and how the month grid draws. Its choices are
	 * this tab's own, remembered apart from the Calendar page's.
	 */
	private drawerSections(): DrawerSection[] {
		const settings = this.plugin.settings;
		const apply = () => {
			this.renderContent();
			void this.plugin.saveSettings();
		};
		const display = displayOptions(settings, EVENTS_TAB_DRAWER, apply);
		// Only while plans are on this page at all — with the setting off
		// there are none here to show or hide.
		if (settings.eventsShowPlans) {
			display.push({
				label: "Show plans",
				checked: settings.eventsCalShowPlans,
				onChange: (checked) => {
					settings.eventsCalShowPlans = checked;
					apply();
				},
			});
		}
		// Leaves Birthdays out of the colour lists: this page is events.
		const colors = colorOptions(
			settings,
			EVENTS_TAB_DRAWER,
			apply,
			(section) =>
				(section === "categories"
					? new CalendarColorsModal(
							this.app,
							this.plugin,
							section,
							this.plugin.eventOperations.getEventCategories()
					  )
					: new CalendarColorsModal(
							this.app,
							this.plugin,
							section,
							[],
							false
					  )
				).open()
		);
		return [
			{
				heading: "Category",
				fold: {
					visible: visibleCategoryCount(
						this.plugin.eventOperations.getEventCategories().length
					),
					open: this.categoriesExpanded,
					onToggle: () => {
						this.categoriesExpanded = !this.categoriesExpanded;
						this.renderContent();
					},
				},
				options: this.plugin.eventOperations
					.getEventCategories()
					.map((category) => ({
						label: category,
						checked: categoryShown(
							settings.eventsCalHiddenCategories,
							category
						),
						onChange: (checked) => {
							settings.eventsCalHiddenCategories = setCategoryShown(
								settings.eventsCalHiddenCategories,
								category,
								checked
							);
							// Its pill leaves the Filters panel with it, so a
							// filter still set to it would have nothing left to
							// unclick.
							if (
								!checked &&
								this.category.toLowerCase() === category.toLowerCase()
							) {
								this.category = "";
							}
							apply();
						},
					})),
			},
			{ heading: "Display", options: display },
			{ heading: "Colors", options: colors },
		];
	}

	/**
	 * The Filters button on its own line, for the Calendar tab — which has
	 * no when-pills to share a row with, but still filters by type, person
	 * and search like every other tab.
	 */
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

		this.search.build(toolbar, {
			placeholder: "Search events…",
			cls: "contact-field-input someday-toolbar-search",
			value: this.searchQuery,
			onInput: (value) => {
				this.searchQuery = value;
				// Whichever tab is showing — renderList drew the List over the
				// Timeline or the Calendar while their tab stayed highlighted.
				this.renderContent();
			},
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
		// names); all fall back to Natural rather than leaving the select
		// blank.
		sortSel.value = eventSortOf(this.plugin.settings.eventSort);
		// Saving broadcasts the change, which redraws the page.
		const handleSortChange = () => {
			this.plugin.settings.eventSort = sortSel.value as EventSort;
			return this.plugin.saveSettings();
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
		const container = this.contentEl;
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
			weekStartsOn: weekStartsOn(this.plugin.settings),
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

		// Both rows are built from what Upcoming/Past leaves in scope (see
		// inScope) and go no further: a chip renders when any in-scope
		// event satisfies its facet, whatever the other live filters say.
		// Chips vanishing as you filter — especially the selected one — is
		// jarring and can strand a selection you can no longer clear. The
		// counts, by contrast, are live: each chip prices itself as if it
		// were the only filter in its group, with search and the other
		// group still applied, so a roster chip can honestly read 0.
		const scope = this.inScope();

		// Category first, as it leads the drawer's own list. Only drawn when
		// some event on the page has one — a vault that never uses them
		// shouldn't grow an empty row.
		const categories = filterableCategories(
			scope.map((e) => e.categories),
			this.plugin.settings.eventsCalHiddenCategories
		);
		// Keep the current pick even once the Upcoming / Past switch has
		// taken its last event out of scope, or the filter would stay
		// applied with nothing left to unclick it.
		if (
			this.category &&
			!categories.some((c) => c.toLowerCase() === this.category.toLowerCase())
		) {
			categories.push(this.category);
			categories.sort((a, b) =>
				a.localeCompare(b, undefined, { sensitivity: "base" })
			);
		}
		if (categories.length > 0) {
			const categoryRow = wrap.createDiv({ cls: "someday-filter-row" });
			categoryRow.createSpan({
				cls: "someday-filter-label",
				text: "Category",
			});
			const categoryOpts = categoryRow.createDiv({
				cls: "someday-filter-options",
			});
			for (const name of categories) {
				const active = this.category.toLowerCase() === name.toLowerCase();
				this.filterPill(
					categoryOpts,
					name,
					active,
					() => {
						this.category = active ? "" : name;
						this.render();
					},
					this.countWith({ category: name })
				);
			}
		}

		const typeRow = wrap.createDiv({ cls: "someday-filter-row" });
		typeRow.createSpan({ cls: "someday-filter-label", text: "Type" });
		const typeOpts = typeRow.createDiv({ cls: "someday-filter-options" });
		EVENT_TYPES.forEach((t) => {
			// The current pick always renders, even once it's out of scope —
			// otherwise switching Upcoming/Past could leave it applied
			// invisibly.
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
		// Keep the current pick on the row even when Upcoming/Past has
		// taken their last event out of scope — otherwise the filter stays
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
				this.category = "";
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
	}

	/**
	 * An event opened directly, through its file: its view modal, once.
	 * Looked for among everything the page holds, whatever the tab and
	 * filters — found only among the List's filtered rows, it never opened
	 * from the Timeline, or for a past event under Upcoming, and the path
	 * stayed in the saved state to pop the modal up some later day.
	 */
	private openFocused() {
		if (!this.focusPath) return;
		const target = this.items.find((e) => e.file.path === this.focusPath);
		this.focusPath = null;
		if (target) this.openItem(target);
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

	private renderRow(
		container: HTMLElement,
		event: EventPageItem,
		/** In the calendar's day list, under a heading that already names
		 * the day — an event's date there would only repeat it. A plan
		 * keeps its own: it may have started days before the one picked. */
		inDayList = false
	) {
		const now = new Date();
		const people = this.peopleSummary(event);
		const fields =
			event.kind === "plan"
				? planRowFields(event.plan, now, people)
				: {
						...eventRowFields(event.event, now, people, {
							viewerZone: displayZone(
								this.plugin.settings.displayTimezone
							),
						}),
						...(inDayList ? { date: "" } : {}),
				  };
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

	private openItem(item: EventPageItem) {
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

	private openViewModal(event: EventInfo) {
		new EventViewModal(this.app, this.plugin, event).open();
	}

	private openEditor(prefill?: { date: string }) {
		new EventModal(this.app, this.plugin, null, undefined, prefill).open();
	}
}
