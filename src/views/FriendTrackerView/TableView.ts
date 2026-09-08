import { setIcon } from "obsidian";
import type { FriendTrackerView } from "./index";
import type {
	ContactWithCountdown,
	FriendListSort,
	FriendListTab,
} from "@/types";
import {
	parseFlexDate,
	flexSortKey,
	formatShortFlexDate,
	formatShortWeekdayDate,
	monthName,
} from "@/utils/flexdate";
import {
	birthdayMonths,
	calendarBirthdayKey,
	dayKeyOf,
	indexBirthdays,
	nextBirthdayOccurrence,
} from "@/utils/friendTimeline";
import { monthGrid, monthLabel } from "@/utils/calendarGrid";
import { GlanceModal } from "@/modals/GlanceModal";

const SORT_OPTIONS: Array<{ id: FriendListSort; label: string }> = [
	// "Next" rather than plain "Birthday": the two calendar orderings below
	// are birthday sorts too, and the difference between them is the whole
	// reason all three exist.
	{ id: "birthday", label: "Next birthday" },
	{ id: "birthdayJanDec", label: "Birthday (Jan-Dec)" },
	{ id: "birthdayDecJan", label: "Birthday (Dec-Jan)" },
	{ id: "alphabetical", label: "Name (A-Z)" },
	{ id: "alphabeticalDesc", label: "Name (Z-A)" },
	{ id: "newest", label: "Newest added" },
	{ id: "oldest", label: "Oldest added" },
	{ id: "lastEvent", label: "Last event" },
	{ id: "youngest", label: "Youngest" },
	{ id: "eldest", label: "Oldest" },
	{ id: "modified", label: "Last modified" },
];

// Labels only — the ids are what's stored in settings, so renaming a tab
// can't strand anyone on a view that no longer resolves. Both non-list
// tabs say "B'day" because that's all either shows: the Events page has
// its own Timeline, and without the qualifier the two read as the same
// thing under different menus.
const TABS: Array<{ id: FriendListTab; label: string }> = [
	{ id: "list", label: "List" },
	{ id: "timeline", label: "B'day Timeline" },
	{ id: "calendar", label: "B'day Calendar" },
];

/**
 * The All friends page: search, group-pill filtering and a remembered sort
 * over three presentations of the same people — a two-line list in the
 * dashboard's visual language, a year of birthdays as a timeline, and a
 * calendar grid still to come.
 */
export class TableView {
	private searchQuery = "";
	private contacts: ContactWithCountdown[] = [];
	private groupColors = new Map<string, string | null>();
	/** Group key → the spelling its page uses; see ContactOperations.labelOf. */
	private groupLabels = new Map<string, string>();
	/** Which presentation is showing; seeded from the remembered choice. */
	private tab: FriendListTab;
	/** Which month the B'day Calendar is showing. Not remembered: paging away
	 * and coming back to March would be a puzzle. */
	private calCursor = new Date();
	/** The day whose birthdays list under a narrow grid. */
	private calSelected = "";
	private tabsEl: HTMLElement | null = null;
	private sortEl: HTMLElement | null = null;
	private contentEl: HTMLElement | null = null;

	constructor(private view: FriendTrackerView) {
		// Read off the parameter rather than `this.view`, which isn't
		// assigned until the parameter properties are, and fall back in
		// case a vault predates the setting.
		this.tab = view.settings.friendListTab ?? "list";
	}

	async render(container: HTMLElement, contacts: ContactWithCountdown[]) {
		this.contacts = contacts;
		const wrap = container.createDiv({
			cls: "friend-list-container",
		});

		// Header
		const header = wrap.createDiv({
			cls: "dashboard-section-header",
		});
		header.createEl("h2", { text: "All friends" });
		const addButton = header.createEl("button", {
			cls: "callander-button friend-list-add-button",
		});
		setIcon(addButton, "user-plus");
		addButton.createSpan({ text: "Add friend" });
		addButton.addEventListener("click", () =>
			void this.view.openAddContactModal()
		);

		// Narrow the people first, then pick a view of them: search and
		// sort, group chips, and the tabs last so they sit directly above
		// the thing they switch.
		this.renderToolbar(wrap);
		this.renderGroupPills(wrap, contacts);
		this.renderTabs(wrap);

		this.contentEl = wrap.createDiv({ cls: "friend-list-content" });
		this.renderContent();
	}

	/**
	 * Which view of the page — underlined rather than pill-shaped, so they
	 * never read as another row of group chips sitting just below them.
	 */
	private renderTabs(wrap: HTMLElement) {
		const tabs = wrap.createDiv({
			cls: "callander-tabs",
			attr: { role: "tablist" },
		});
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
			button.addEventListener("click", () => this.selectTab(id));
		}
		this.tabsEl = tabs;
	}

	/** Search and sort share a line — the tabs above need the room. */
	private renderToolbar(wrap: HTMLElement) {
		const toolbar = wrap.createDiv({ cls: "friend-list-toolbar" });

		const searchInput = toolbar.createEl("input", {
			attr: { type: "text", placeholder: "Search friends…" },
			cls: "contact-field-input friend-list-search",
		});
		searchInput.value = this.searchQuery;
		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value;
			this.renderContent();
		});

		// No "Sort" label: the options name themselves, and the row is
		// carrying the search box now.
		const sort = toolbar.createDiv({
			cls: `friend-list-sort${this.tab === "list" ? "" : " is-hidden"}`,
		});
		const select = sort.createEl("select", {
			cls: "dropdown",
			attr: { "aria-label": "Sort friends" },
		});
		SORT_OPTIONS.forEach((o) =>
			select.createEl("option", { value: o.id, text: o.label })
		);
		select.value = this.view.settings.friendListSort;
		const handleSortChange = async () => {
			await this.view.setFriendListSort(select.value as FriendListSort);
			this.renderContent();
		};
		select.addEventListener("change", () => void handleSortChange());
		this.sortEl = sort;
	}

	private renderGroupPills(
		wrap: HTMLElement,
		contacts: ContactWithCountdown[]
	) {
		const ops = this.view.contactOperations;
		const infos = ops.getGroupInfos(contacts);
		this.groupColors = new Map(infos.map((i) => [i.name, i.color]));
		this.groupLabels = new Map(infos.map((i) => [i.name, ops.labelOf(i)]));
		if (infos.length === 0) return;

		const pills = wrap.createDiv({
			cls: "contact-group-chips friend-list-groups",
		});
		for (const info of infos) {
			const chip = pills.createEl("button", {
				cls: `contact-group-chip ${
					this.view.groupFilter === info.name ? "selected" : ""
				}`,
			});
			const dot = chip.createSpan({ cls: "group-dot" });
			dot.style.backgroundColor =
				info.color ?? "var(--background-modifier-border)";
			chip.createSpan({ text: ops.labelOf(info) });
			chip.addEventListener("click", () => {
				this.view.groupFilter =
					this.view.groupFilter === info.name ? "" : info.name;
				pills
					.findAll(".contact-group-chip")
					.forEach((el) => el.removeClass("selected"));
				if (this.view.groupFilter === info.name) {
					chip.addClass("selected");
				}
				this.renderContent();
			});
		}
	}

	/**
	 * Swap presentations without a full re-render: rebuilding the toolbar
	 * would replace the search box mid-typing and take the caret with it.
	 */
	private selectTab(tab: FriendListTab) {
		if (this.tab === tab) return;
		this.tab = tab;
		this.tabsEl?.findAll(".callander-tab").forEach((el, i) => {
			const active = TABS[i].id === tab;
			el.toggleClass("active", active);
			el.setAttribute("aria-selected", String(active));
		});
		// Sorting is a List-only question. A timeline is chronological by
		// definition, so a dropdown that changed nothing would read as broken.
		this.sortEl?.toggleClass("is-hidden", tab !== "list");
		this.renderContent();
		// Saved after the swap, not before it. The write is what makes the
		// choice stick between sessions, but it also fires settings-changed
		// and a full refresh a beat later — the tab has to look switched
		// now, not once the disk catches up.
		void this.view.setFriendListTab(tab);
	}

	private renderContent() {
		if (!this.contentEl) return;
		this.contentEl.empty();
		if (this.tab === "timeline") {
			this.renderTimeline();
		} else if (this.tab === "calendar") {
			this.renderCalendar();
		} else {
			this.renderList();
		}
	}

	/** Group pill + search, shared by every tab. */
	private filtered(): ContactWithCountdown[] {
		const q = this.searchQuery.trim().toLowerCase();
		return this.contacts.filter(
			(c) =>
				(!this.view.groupFilter ||
					c.groups.includes(this.view.groupFilter)) &&
				(!q ||
					c.displayName.toLowerCase().includes(q) ||
					c.name.toLowerCase().includes(q))
		);
	}

	private sortedFiltered(): ContactWithCountdown[] {
		const list = this.filtered();

		// Unknown sorts past December in either direction.
		const calendarRank = (c: ContactWithCountdown): number =>
			calendarBirthdayKey(c.birthday) ?? 99_99;

		const lastEventKey = (c: ContactWithCountdown): number => {
			let max = -1;
			for (const e of c.events) {
				const parsed = parseFlexDate(e.date);
				if (parsed) max = Math.max(max, flexSortKey(parsed));
			}
			return max;
		};

		// Days to the next birthday, counting a month-only one as the 1st of
		// that month so it sorts with its month rather than falling to the
		// bottom with the people who have no birthday at all. The dashboard
		// countdown deliberately doesn't do this — see OccurrenceOptions.
		const now = new Date();
		const untilBirthday = (c: ContactWithCountdown): number =>
			nextBirthdayOccurrence(c.birthday, now, {
				assumeFirstOfMonth: true,
			})?.days ?? 9999;

		switch (this.view.settings.friendListSort) {
			case "newest":
				list.sort((a, b) => b.file.stat.ctime - a.file.stat.ctime);
				break;
			case "oldest":
				list.sort((a, b) => a.file.stat.ctime - b.file.stat.ctime);
				break;
			case "birthday":
				list.sort((a, b) => untilBirthday(a) - untilBirthday(b));
				break;
			// Calendar position, not proximity: January first whatever the
			// date is today. Anyone with no month recorded has no place in
			// that order and goes last in both directions, rather than
			// leading the reverse.
			case "birthdayJanDec":
				list.sort((a, b) => calendarRank(a) - calendarRank(b));
				break;
			case "birthdayDecJan":
				list.sort((a, b) => {
					const ka = calendarBirthdayKey(a.birthday);
					const kb = calendarBirthdayKey(b.birthday);
					if (ka === null || kb === null) {
						return calendarRank(a) - calendarRank(b);
					}
					return kb - ka;
				});
				break;
			case "lastEvent":
				list.sort((a, b) => lastEventKey(b) - lastEventKey(a));
				break;
			case "youngest":
				list.sort((a, b) => (a.age ?? 999) - (b.age ?? 999));
				break;
			case "eldest":
				list.sort((a, b) => (b.age ?? -1) - (a.age ?? -1));
				break;
			case "modified":
				list.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
				break;
			case "alphabeticalDesc":
				list.sort((a, b) => b.displayName.localeCompare(a.displayName));
				break;
			default:
				list.sort((a, b) => a.displayName.localeCompare(b.displayName));
		}
		return list;
	}

	/** "Nothing here" — which of the two depends on why. */
	private renderEmptyState(parent: HTMLElement) {
		parent.createDiv({
			cls: "section-helper-text",
			text:
				this.contacts.length === 0
					? "No friends yet. Add your first — a first name is all you need."
					: "No friends match.",
		});
	}

	/** The dot-and-name group tags carried by both the list and the timeline. */
	private appendGroupTags(parent: HTMLElement, contact: ContactWithCountdown) {
		for (const g of contact.groups) {
			const tag = parent.createSpan({ cls: "friend-list-group-tag" });
			const dot = tag.createSpan({ cls: "group-dot" });
			dot.style.backgroundColor =
				this.groupColors.get(g) ?? "var(--background-modifier-border)";
			tag.createSpan({
				text:
					this.groupLabels.get(g) ??
					this.view.contactOperations.prettyGroupName(g),
			});
		}
	}

	private renderList() {
		if (!this.contentEl) return;
		const listEl = this.contentEl.createDiv({ cls: "friend-list" });
		const list = this.sortedFiltered();

		if (list.length === 0) {
			this.renderEmptyState(listEl);
			return;
		}

		for (const contact of list) {
			const row = listEl.createDiv({
				cls: "friend-list-row",
			});
			row.addEventListener("click", () =>
				void this.view.openContact(contact.file)
			);

			const info = row.createDiv({ cls: "friend-list-info" });

			// Line 1: name + group dots
			const main = info.createDiv({ cls: "friend-list-main" });
			main.createSpan({
				cls: "friend-list-name",
				text: contact.displayName,
			});
			this.appendGroupTags(main, contact);

			// Line 2: birthday as a plain date, then age
			const parts: string[] = [];
			const bday = this.birthdayDate(contact);
			if (bday) parts.push(bday);
			if (contact.age !== null) parts.push(`Age ${contact.age}`);
			if (parts.length > 0) {
				info.createDiv({
					cls: "friend-list-detail",
					text: parts.join(" • "),
				});
			}

			// Quick overview without leaving the list
			this.appendGlanceButton(row, contact);
		}
	}

	/**
	 * A quick overview without leaving the page, on both the list and the
	 * timeline — the same friend offering the same thing either way.
	 */
	private appendGlanceButton(
		row: HTMLElement,
		contact: ContactWithCountdown
	) {
		const glanceButton = row.createEl("button", {
			cls: "callander-button friend-list-glance",
			attr: { type: "button", "aria-label": `Glance at ${contact.displayName}` },
		});
		setIcon(glanceButton, "eye");
		glanceButton.createSpan({
			cls: "friend-list-glance-label",
			text: "Glance",
		});
		// The row opens the person's page; the button has its own job.
		glanceButton.addEventListener("click", (e) => {
			e.stopPropagation();
			new GlanceModal(
				this.view.app,
				this.view.callander,
				contact
			).open();
		});
	}

	/**
	 * A month of birthdays, one square per day.
	 *
	 * Month only — a week of birthdays is almost always empty, and the seven
	 * columns would cost as much room as the month does to say much less.
	 * The grid, the chips and the narrow behaviour are the Events calendar's,
	 * so the two read as the same object with different contents.
	 */
	private renderCalendar() {
		if (!this.contentEl) return;
		// Alphabetical in, so a shared birthday reads A-Z in its square.
		const people = this.filtered().sort((a, b) =>
			a.displayName.localeCompare(b.displayName)
		);
		if (people.length === 0) {
			this.renderEmptyState(this.contentEl);
			return;
		}

		const wrap = this.contentEl.createDiv({ cls: "cal" });
		const { byDay, monthOnly } = indexBirthdays(people);
		const cursorMonth = this.calCursor.getMonth() + 1;

		const bar = wrap.createDiv({ cls: "cal-bar" });
		bar.createSpan({
			cls: "cal-period",
			text: monthLabel(this.calCursor),
		});
		const nav = bar.createDiv({ cls: "cal-nav" });
		const step = (by: number) => {
			const next = new Date(this.calCursor);
			next.setMonth(next.getMonth() + by);
			this.calCursor = next;
			this.renderContent();
		};
		const button = (label: string, aria: string, onClick: () => void) => {
			const b = nav.createEl("button", {
				cls: "callander-button cal-nav-button",
				text: label,
				attr: { type: "button", "aria-label": aria },
			});
			b.addEventListener("click", onClick);
		};
		button("‹", "Previous month", () => step(-1));
		button("Today", "This month", () => {
			this.calCursor = new Date();
			this.calSelected = "";
			this.renderContent();
		});
		button("›", "Next month", () => step(1));

		const head = wrap.createDiv({ cls: "cal-weekdays" });
		for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
			head.createSpan({ text: d });
		}

		const grid = wrap.createDiv({ cls: "cal-grid" });
		for (const day of monthGrid(this.calCursor)) {
			const cls = ["cal-cell"];
			if (!day.inMonth) cls.push("is-outside");
			if (day.isToday) cls.push("is-today");
			if (day.date === this.calSelected) cls.push("is-selected");
			const cell = grid.createDiv({ cls: cls.join(" ") });
			cell
				.createDiv({ cls: "cal-cell-head" })
				.createSpan({ cls: "cal-daynum", text: String(day.day) });

			// Borrowed days belong to a neighbouring month; drawing their
			// birthdays would show the same person twice as you page.
			const birthdays = day.inMonth
				? byDay.get(dayKeyOf(day.date)) ?? []
				: [];
			for (const person of birthdays.slice(0, 3)) {
				this.appendCalBirthday(cell, person, day.date);
			}
			if (birthdays.length > 3) {
				cell.createDiv({
					cls: "cal-more",
					text: `+${birthdays.length - 3} more`,
				});
			}
			if (birthdays.length > 0) {
				const dots = cell.createDiv({ cls: "cal-dots" });
				for (const person of birthdays.slice(0, 4)) {
					const dot = dots.createSpan({ cls: "cal-dot" });
					dot.style.backgroundColor = this.dotColour(person);
				}
			}
			// No modal here: a birthday belongs to a person, not to a date,
			// so there is nothing to add to an empty square. Tapping picks
			// the day, which is what the narrow layout lists underneath.
			cell.addEventListener("click", () => {
				this.calSelected = day.date;
				this.renderContent();
			});
		}

		this.appendCalDayList(wrap, byDay);

		// Known to the month but not the day: they belong to this month and
		// to no square in it, so they're named under the grid rather than
		// dropped. The Timeline says "Unknown day" on the row; a grid has no
		// row to say it on.
		const vague = monthOnly.get(cursorMonth) ?? [];
		if (vague.length > 0) {
			const note = wrap.createDiv({ cls: "cal-month-only" });
			note.createDiv({
				cls: "cal-agenda-head",
				text: "Day unknown",
			});
			for (const person of vague) {
				this.appendTimelineRow(note, person, "", {
					onClick: () => this.openGlance(person),
					glanceButton: false,
				});
			}
		}
	}

	/**
	 * A person's birthday as a chip: their name on a line of its own, with
	 * the age they reach under it.
	 *
	 * Stacked rather than inline because the name is the thing you're
	 * scanning for. Sharing a line with a cake and a number, it was the part
	 * that got truncated first in a narrow column — which is the wrong way
	 * round when the whole question is whose birthday it is.
	 */
	private appendCalBirthday(
		cell: HTMLElement,
		person: ContactWithCountdown,
		isoDate: string
	) {
		const chip = cell.createDiv({ cls: "cal-chip is-stacked" });
		chip.style.setProperty("--cal-chip", this.dotColour(person));
		chip.createDiv({ cls: "cal-chip-name", text: person.displayName });
		// Counted against the year on screen, so paging forward ages people
		// rather than repeating this year's number.
		const born = parseFlexDate(person.birthday)?.year;
		chip.createDiv({
			cls: "cal-chip-meta",
			text:
				born != null
					? `🎂 ${Number(isoDate.slice(0, 4)) - born}`
					: "🎂",
		});
		chip.addEventListener("click", (e) => {
			e.stopPropagation();
			this.openGlance(person);
		});
	}

	/** The calendar's one action: a quick look, not a trip to their page. */
	private openGlance(contact: ContactWithCountdown) {
		new GlanceModal(this.view.app, this.view.callander, contact).open();
	}

	/** The selected day's birthdays, listed under a narrow grid. */
	private appendCalDayList(
		wrap: HTMLElement,
		byDay: Map<string, ContactWithCountdown[]>
	) {
		const agenda = wrap.createDiv({ cls: "cal-agenda" });
		if (!this.calSelected) {
			agenda.createDiv({
				cls: "section-helper-text",
				text: "Pick a day to see whose birthday it is.",
			});
			return;
		}
		const day = new Date(this.calSelected + "T00:00:00");
		agenda.createDiv({
			cls: "cal-agenda-head",
			text: formatShortWeekdayDate(day),
		});
		const birthdays = byDay.get(dayKeyOf(this.calSelected)) ?? [];
		if (birthdays.length === 0) {
			agenda.createDiv({
				cls: "section-helper-text",
				text: "No birthdays on this day",
			});
			return;
		}
		for (const person of birthdays) {
			this.appendTimelineRow(agenda, person, "", {
				onClick: () => this.openGlance(person),
				glanceButton: false,
			});
		}
	}

	/** First group's colour, or the theme's text colour when ungrouped —
	 * the same rule the timeline dots follow. */
	private dotColour(person: ContactWithCountdown): string {
		const first = person.groups[0];
		return (
			(first ? this.groupColors.get(first) : null) ??
			"var(--text-normal)"
		);
	}

	/**
	 * The year ahead, as birthdays. Every month the window touches gets a
	 * heading, quiet ones included — the point is to read the year as a
	 * continuous span rather than a dense list of the next few people.
	 */
	private renderTimeline() {
		if (!this.contentEl) return;
		// Alphabetical in, so friends sharing a date read A-Z out:
		// birthdayMonths orders by date and leaves ties as it found them.
		const people = this.filtered().sort((a, b) =>
			a.displayName.localeCompare(b.displayName)
		);

		if (people.length === 0) {
			this.renderEmptyState(this.contentEl);
			return;
		}

		const months = birthdayMonths(people, new Date());
		const timeline = this.contentEl.createDiv({
			cls: "contact-timeline friend-timeline",
		});
		const placed = new Set<ContactWithCountdown>();

		for (const month of months) {
			// Headings and rows are appended as direct children on purpose.
			// `.contact-timeline-year:first-child` drops the top margin on
			// the first heading only; wrapping each month in a div would
			// make every heading match it. Same trap as the plan timeline.
			timeline.createDiv({
				cls: "contact-timeline-year",
				text: month.label,
			});

			if (month.entries.length === 0) {
				const quiet = timeline.createDiv({
					cls: "contact-timeline-item plan-timeline-empty",
				});
				quiet.createSpan({
					cls: "plan-timeline-empty-text",
					text: "No birthdays",
				});
				continue;
			}

			for (const entry of month.entries) {
				placed.add(entry.person);
				// Date and age share the muted line, the way a list row
				// reads "26 Sep 1992 • Age 33". Over a year of these, a
				// third line each just to say "Turning 34" is a screenful.
				const on = new Date(`${entry.date}T00:00:00`);
				const when = [
					// A month-only birthday is filed under the right month
					// heading; what's missing is the day, and saying so is
					// more use than repeating the month back. The date on
					// the entry is the 1st, which is a sort position and
					// not something to print.
					entry.exact
						? `${on.getDate()} ${monthName(on.getMonth() + 1)}`
						: "Unknown day",
					// Past tense once the day has gone: the current month is
					// shown whole, so its earlier half is behind us and
					// "Turning" would be plainly wrong there.
					entry.turning === null
						? ""
						: `${entry.days < 0 ? "Turned" : "Turning"} ${
								entry.turning
						  }`,
				].filter(Boolean);
				this.appendTimelineRow(
					timeline,
					entry.person,
					when.join(" • ")
				);
			}
		}

		// Everyone the timeline can't place. A section rather than the
		// footnote this used to be: they're friends, not an error message,
		// and reading their names is what prompts you to go and fill one in.
		// Membership comes from what actually landed above, so it can't
		// drift from whatever birthdayMonths decides is placeable.
		const unknown = people.filter((p) => !placed.has(p));
		if (unknown.length === 0) return;

		this.contentEl.createDiv({ cls: "friend-timeline-divider" });
		const undated = this.contentEl.createDiv({
			cls: "contact-timeline friend-timeline friend-timeline-unknown",
		});
		undated.createDiv({
			cls: "contact-timeline-year",
			text: "Unknown birthdays",
		});
		for (const person of unknown) {
			this.appendTimelineRow(undated, person, "");
		}
	}

	/**
	 * One person on the timeline: a dot in their first group's colour, an
	 * optional date line, then name and group tags.
	 *
	 * Shared by the months and the unknown-birthday section so the two
	 * can't drift into looking like different kinds of thing — they're the
	 * same friends, and only the date separates them.
	 */
	private appendTimelineRow(
		parent: HTMLElement,
		person: ContactWithCountdown,
		when: string,
		options: {
			/** What the row does. The timeline opens their page; the calendar
			 * glances, so a month of birthdays never navigates away. */
			onClick?: () => void;
			/** Off where the row itself already glances — two ways to do the
			 * same thing on one row reads as two different things. */
			glanceButton?: boolean;
		} = {}
	) {
		const { onClick, glanceButton = true } = options;
		const row = parent.createDiv({
			cls: `contact-timeline-item friend-timeline-row${
				when ? "" : " is-undated"
			}`,
		});
		const dot = row.createSpan({ cls: "contact-timeline-dot" });
		// The first group's colour, so a run of the same group reads as a
		// band down the rail. Strictly the first, not the first that happens
		// to have a colour set — a dot in the second group's colour would be
		// a puzzle, not a hint. Ungrouped falls back to the theme's own text
		// colour: near-white on dark, near-black on light.
		const firstGroup = person.groups[0];
		dot.style.backgroundColor =
			(firstGroup ? this.groupColors.get(firstGroup) : null) ??
			"var(--text-normal)";
		// Date and name share a column so Glance can sit beside them rather
		// than under them, the same shape a list row has.
		const main = row.createDiv({ cls: "friend-timeline-main" });
		if (when) {
			main.createDiv({ cls: "contact-timeline-date", text: when });
		}
		const text = main.createDiv({ cls: "contact-timeline-text" });
		text.createSpan({
			cls: "friend-list-name",
			text: person.displayName,
		});
		this.appendGroupTags(text, person);
		if (glanceButton) this.appendGlanceButton(row, person);
		row.addEventListener(
			"click",
			onClick ?? (() => void this.view.openContact(person.file))
		);
	}

	/** Birthday as a plain date: "21 Aug 1997", "21 Aug", or "Aug 1997". */
	private birthdayDate(contact: ContactWithCountdown): string {
		const p = parseFlexDate(contact.birthday);
		return p ? formatShortFlexDate(p) : "";
	}
}
