import { ItemView, Platform, WorkspaceLeaf, setIcon } from "obsidian";
import type CallanderPlugin from "@/main";
import type { ContactWithCountdown, EventInfo, PlanInfo } from "@/types";
import { applyPageWidth } from "@/components/pageWidth";
import {
	eventBoardItem,
	planBoardItem,
	renderCalendarBoard,
	type BoardItem,
	type BoardState,
} from "@/components/calendarBoard";
import { buildUpcomingRow } from "@/components/UpcomingRow";
import { EventModal } from "@/modals/EventModal";
import { EventViewModal } from "@/modals/EventViewModal";
import { GlanceModal } from "@/modals/GlanceModal";
import { PlanGlanceModal } from "@/modals/PlanGlanceModal";
import { monthGrid, weekGrid, weekStartsOn } from "@/utils/calendarGrid";
import { eventRowFields } from "@/utils/eventRow";
import { displayZone } from "@/utils/timezone";
import { parseFlexDate, todayISO } from "@/utils/flexdate";
import { birthdaysOnDays, turnsLabel } from "@/utils/friendTimeline";
import { summarisePeople } from "@/utils/nameFormat";
import { planRowFields } from "@/utils/planRow";
import { registerPageRefresh } from "@/utils/vaultRefresh";
import {
	appendDrawer,
	appendDrawerToggle,
	CALENDAR_PAGE_DRAWER,
	colorOptions,
	displayOptions,
	type DrawerSection,
} from "@/components/calendarDrawer";
import {
	categoryShown,
	setCategoryShown,
	shownByCategory,
	visibleCategoryCount,
} from "@/utils/eventCategories";
import {
	NO_COLOR_FALLBACK,
	calendarEventColor,
	categoryColors,
	groupColorFor,
} from "@/utils/categoryColor";
import { CalendarColorsModal } from "@/modals/CalendarColorsModal";
import { appendTimezoneBanner } from "@/components/timezoneBanner";
import { FocusKeeper } from "@/components/activatable";

export const VIEW_TYPE_CALENDAR = "callander-calendar";

/**
 * The drawer's calendars — what can be ticked on and off. The drawer is
 * also where narrower filters, like a Sports calendar, will go.
 */
const DRAWER_CALENDARS = [
	{ id: "events", label: "Events" },
	{ id: "plans", label: "Plans" },
	{ id: "birthdays", label: "Birthdays" },
] as const;

type CalendarId = (typeof DRAWER_CALENDARS)[number]["id"];

/**
 * Everything with a date, on one calendar: events, plans and birthdays.
 *
 * The Events page's Calendar tab is the same board (calendarBoard) with
 * just the events and plans; this is the whole picture, full width by
 * default since a month of three kinds of thing needs the columns. A drawer
 * beside it ticks each kind of thing on and off.
 */
export class CalendarView extends ItemView {
	private events: EventInfo[] = [];
	private plans: PlanInfo[] = [];
	private contacts: ContactWithCountdown[] = [];
	private cal: BoardState;
	/** Open for this view only; every page open starts with it shut. */
	private drawerOpen = false;
	/** Whether the drawer's category list is unfolded past "Show N more" —
	 * kept here because the drawer itself is redrawn on every tick. */
	private categoriesExpanded = false;
	private boardEl: HTMLElement | null = null;
	/** Keyboard focus across a redraw — see FocusKeeper. */
	private readonly focusKeeper = new FocusKeeper();

	constructor(leaf: WorkspaceLeaf, private plugin: CallanderPlugin) {
		super(leaf);
		this.navigation = true;
		this.cal = {
			mode: plugin.settings.calendarMode ?? "month",
			cursor: new Date(),
			selected: todayISO(),
		};
	}

	getViewType(): string {
		return VIEW_TYPE_CALENDAR;
	}

	getDisplayText(): string {
		return "Calendar";
	}

	getIcon(): string {
		return "calendar-days";
	}

	async onOpen() {
		// The Getting started step for this page. Remembered here, since
		// opening a page leaves nothing in the vault to notice it by.
		const done = this.plugin.settings.gettingStartedDone;
		if (!done.includes("calendar")) {
			this.plugin.settings.gettingStartedDone = [...done, "calendar"];
			void this.plugin.saveSettings();
		}
		// Events, plans and people all live under the base folder, which is
		// the helper's default scope — a birthday edited on someone's page
		// has to land here as surely as a new event does.
		registerPageRefresh(this, this.plugin, () => void this.refresh());
		await this.refresh();
	}

	async refresh() {
		// Timeline entries are records kept on a person's page, not things
		// on your calendar — the Events page leaves them out for the same
		// reason.
		this.events = this.plugin.eventOperations
			.getEvents()
			.filter((e) => e.variant !== "timeline");
		this.plans = this.plugin.planOperations.getPlans();
		this.contacts = await this.plugin.contactOperations.getContacts();
		this.render();
	}

	private render() {
		const container = this.contentEl;
		const scrollTop = container.scrollTop;
		this.focusKeeper.hold(container);
		container.empty();
		container.addClass("dashboard-container", "fullcal-container");

		const header = container.createDiv({ cls: "dashboard-header" });
		header.createEl("h2", { text: "Calendar" });
		const actions = header.createDiv({ cls: "dashboard-actions" });
		const newBtn = actions.createEl("button", { cls: "callander-button" });
		setIcon(newBtn, "plus");
		newBtn.createSpan({ text: "New event" });
		newBtn.addEventListener("click", () => this.openEditor());

		appendTimezoneBanner(container, this.plugin, () => this.render());

		this.boardEl = container.createDiv({ cls: "fullcal" });
		this.renderBoard();

		// Wide from the start, with no button to offer: a month of events,
		// plans and birthdays is what the columns are for, and the reading
		// column would squeeze every chip down to its first few letters.
		applyPageWidth(container, this.plugin, true, () => {});

		container.scrollTop = scrollTop;
		this.focusKeeper.restore(container);
	}

	/**
	 * This month, with today picked — where the page opens. Today being the
	 * picked day is what a phone lists under the grid, so the first thing it
	 * shows is what's on now rather than "Pick a day".
	 */
	public goToToday() {
		this.cal.cursor = new Date();
		this.cal.selected = todayISO();
		this.renderBoard();
	}

	private renderBoard() {
		const el = this.boardEl;
		if (!el) return;
		// Emptying the board collapses the page for a moment, which clamps
		// the scroll to the top — and it stayed there once the board was
		// back, so every tick in the drawer or tap on a day jumped the page.
		// Held and put back, the same way render() does for a full redraw.
		const scroller = this.contentEl;
		const scrollTop = scroller.scrollTop;
		el.empty();
		el.toggleClass("is-drawer-open", this.drawerOpen);
		renderCalendarBoard(el, {
			state: this.cal,
			items: this.items(),
			weekStartsOn: weekStartsOn(this.plugin.settings),
			rerender: () => this.renderBoard(),
			onModeChange: (mode) => {
				this.plugin.settings.calendarMode = mode;
				void this.plugin.saveSettings();
			},
			onAdd: (date) => this.openEditor({ date }),
			hideDateTime: this.plugin.settings.calendarHideDateTime,
			wrapNames: this.plugin.settings.calendarWrapNames,
			narrowNames: this.plugin.settings.calendarNarrowNames,
			// A week here is a row per day, its events side by side.
			weekRows: true,
			colorBackgrounds: this.plugin.settings.calendarColorBackgrounds,
			fadePastEvents: this.plugin.settings.calendarFadePastEvents,
			lead: (title) =>
				appendDrawerToggle(title, this.drawerOpen, () => {
					this.drawerOpen = !this.drawerOpen;
					this.renderBoard();
				}),
			// The drawer sits beside the grid rather than the whole board, so
			// the bar — and the button that opened it — stays put.
			body: (wrap) => {
				const body = wrap.createDiv({ cls: "fullcal-body" });
				if (this.drawerOpen) appendDrawer(body, this.drawerSections());
				return body.createDiv({ cls: "fullcal-main" });
			},
		});
		scroller.scrollTop = scrollTop;
	}

	/** Events, plans and the birthdays falling in the days on screen. */
	private items(): BoardItem[] {
		const now = new Date();
		const byGroup = this.plugin.settings.calendarColorByGroup;
		const byCategory = this.plugin.settings.calendarCustomCategoryColors;
		const colors = this.plugin.settings.calendarGroupColors;
		// Every category's place in the palette — from the full list, not
		// just what's on screen, so a colour doesn't change with the month.
		const palette = categoryColors(
			this.plugin.eventOperations.getEventCategories()
		);
		const hiddenCategories = this.plugin.settings.calendarHiddenCategories;
		// The zone times are read in — settings if one's pinned, else this
		// machine's. Constant for the whole draw, so it's worked out once.
		const viewerZone = displayZone(this.plugin.settings.displayTimezone);
		const events = this.events
			.filter((event) => shownByCategory(event.categories, hiddenCategories))
			.map((event) => {
			const people = this.peopleSummary(event);
			const open = () => this.openEvent(event);
			const item = eventBoardItem(
				event,
				people,
				open,
				(row) =>
					this.appendRow(
						row,
						// These rows only show in the day list, whose heading
						// already names the day — the date would repeat it. A
						// plan's row keeps its own, as it may have started
						// days before the one picked.
						{
							...eventRowFields(event, now, people, {
								viewerZone,
							}),
							date: "",
						},
						event.status === "cancelled",
						open
					),
				viewerZone
			);
			item.colour = calendarEventColor(event, {
				byGroup,
				byCategory,
				byType: this.plugin.settings.calendarColorByType,
				custom: colors,
				palette,
			});
			return item;
		});
		const plans = this.plans.map((plan) => {
			const people = this.peopleSummary({
				people: plan.members,
				file: plan.file,
			});
			const open = () => this.openPlan(plan);
			const item = planBoardItem(plan, people, open, (row) =>
				this.appendRow(
					row,
					planRowFields(plan, now, people),
					plan.status === "cancelled",
					open
				)
			);
			if (byGroup) item.colour = groupColorFor("plan", colors);
			return item;
		});
		// Birthdays after plans and before events: all-day things lead a
		// day's square, and a plan is the container for the day.
		return [
			...(this.shows("plans") ? plans : []),
			...(this.shows("birthdays") ? this.birthdayItems() : []),
			...(this.shows("events") ? events : []),
		];
	}

	/** Is this calendar ticked in the drawer? */
	private shows(id: CalendarId): boolean {
		return !this.plugin.settings.calendarHidden.includes(id);
	}

	/**
	 * A birthday for every day of the grid it falls on — only those, since a
	 * birthday is a date in every year and the board needs actual days.
	 */
	private birthdayItems(): BoardItem[] {
		const startsOn = weekStartsOn(this.plugin.settings);
		const days = (
			this.cal.mode === "month"
				? monthGrid(this.cal.cursor, new Date(), startsOn)
				: weekGrid(this.cal.cursor, new Date(), startsOn)
		).map((d) => d.date);
		// Alphabetical in, so a shared birthday reads A-Z in its square.
		const people = [...this.contacts].sort((a, b) =>
			a.displayName.localeCompare(b.displayName)
		);
		const items: BoardItem[] = [];
		for (const [date, born] of birthdaysOnDays(people, days)) {
			for (const person of born) {
				const year = parseFlexDate(person.birthday)?.year;
				// "Turns 32", counted against the year on screen, so paging
				// forward ages people rather than repeating this year's number.
				// Inside a phone's square it's just "32"; the day's list under
				// the grid has a whole row, so it keeps the words.
				const age = year != null ? Number(date.slice(0, 4)) - year : null;
				const when =
					age !== null ? turnsLabel(age, Platform.isMobile) : "";
				const turns = age !== null ? turnsLabel(age) : "";
				const open = () => this.openBirthday(person);
				// Off, a birthday is the same flat accent everything else
				// falls back to — not the friend's own group colour, which
				// used to leave "Color by group" only half a switch.
				const colour = this.plugin.settings.calendarColorByGroup
					? groupColorFor(
							"birthday",
							this.plugin.settings.calendarGroupColors
					  )
					: NO_COLOR_FALLBACK;
				items.push({
					key: `${person.file.path}#${date}`,
					kind: "birthday",
					name: person.displayName,
					days: [date],
					time: "",
					glyph: "🎂",
					colour,
					cancelled: false,
					when,
					people: "",
					location: "",
					open,
					row: (row) =>
						buildUpcomingRow(row, {
							icon: "🎂",
							date: "Birthday",
							name: person.displayName,
							suffix: turns,
							relative: "",
							onClick: open,
						}),
				});
			}
		}
		return items;
	}

	/** People links as the rows show them: full for one, shortened beyond.
	 * Resolved from the note they're written in, as links are. */
	private peopleSummary(item: {
		people: string[];
		file: { path: string };
	}): string {
		const paths = this.plugin.eventOperations.peoplePaths(item);
		return summarisePeople(
			paths.map((path) => {
				const match = this.contacts.find((c) => c.file.path === path);
				return {
					displayName:
						match?.displayName ??
						path.split("/").pop()?.replace(/\.md$/, "") ??
						path,
					shortName: match?.shortName ?? "",
				};
			})
		);
	}

	private appendRow(
		container: HTMLElement,
		fields: ReturnType<typeof eventRowFields>,
		cancelled: boolean,
		onClick: () => void
	) {
		const row = buildUpcomingRow(container, {
			...fields,
			// As on the Events page: most of a calendar is history, so the
			// "past" emphasis would pick out nothing. "soon" still applies.
			tone: fields.tone === "past" ? undefined : fields.tone,
			onClick,
		});
		if (cancelled) row.addClass("is-cancelled-row");
	}

	// ---- The drawer ----

	/**
	 * The drawer's sections: which calendars, which event categories, and
	 * how the month grid draws. Everything is remembered across opens, like
	 * the page's other choices — somebody who never wants birthdays here
	 * shouldn't have to untick them every visit.
	 */
	private drawerSections(): DrawerSection[] {
		const settings = this.plugin.settings;
		// Redrawn on each tick rather than on the settings broadcast the
		// save sends, so the grid answers without a beat's wait.
		const apply = () => {
			this.renderBoard();
			void this.plugin.saveSettings();
		};
		const sections: DrawerSection[] = [
			{
				heading: "Calendars",
				options: DRAWER_CALENDARS.map(({ id, label }) => ({
					label,
					checked: this.shows(id),
					onChange: (checked) => {
						const others = settings.calendarHidden.filter(
							(h) => h !== id
						);
						settings.calendarHidden = checked ? others : [...others, id];
						apply();
					},
				})),
			},
			{
				heading: "Event category",
				fold: {
					visible: visibleCategoryCount(
						this.plugin.eventOperations.getEventCategories().length
					),
					open: this.categoriesExpanded,
					onToggle: () => {
						this.categoriesExpanded = !this.categoriesExpanded;
						this.renderBoard();
					},
				},
				options: this.plugin.eventOperations
					.getEventCategories()
					.map((category) => ({
						label: category,
						checked: categoryShown(
							settings.calendarHiddenCategories,
							category
						),
						onChange: (checked) => {
							settings.calendarHiddenCategories = setCategoryShown(
								settings.calendarHiddenCategories,
								category,
								checked
							);
							apply();
						},
					})),
			},
		];
		// Month-only, because that's the grid these are for: a week has the
		// room these settings borrow from a cramped month cell. So they're
		// only offered while the month is showing, rather than sitting there
		// doing nothing with a note saying so.
		if (this.cal.mode === "month") {
			sections.push({
				heading: "Display",
				options: displayOptions(settings, CALENDAR_PAGE_DRAWER, apply),
			});
			sections.push({
				heading: "Colors",
				options: colorOptions(
					settings,
					CALENDAR_PAGE_DRAWER,
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
									section
							  )
						).open()
				),
			});
		}
		return sections;
	}

	// ---- Opening things ----

	private openEvent(event: EventInfo) {
		new EventViewModal(this.app, this.plugin, event).open();
	}

	private openPlan(plan: PlanInfo) {
		new PlanGlanceModal(
			this.app,
			plan,
			() => void this.plugin.openContactPage(plan.file)
		).open();
	}

	private openBirthday(person: ContactWithCountdown) {
		new GlanceModal(this.app, this.plugin, person).open();
	}

	private openEditor(prefill?: { date: string }) {
		new EventModal(this.app, this.plugin, null, undefined, prefill).open();
	}

	// ---- Layout ----

}
