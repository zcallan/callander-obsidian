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
	monthName,
} from "@/utils/flexdate";
import {
	birthdayMonths,
	calendarBirthdayKey,
} from "@/utils/friendTimeline";
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

const TABS: Array<{ id: FriendListTab; label: string }> = [
	{ id: "list", label: "List" },
	{ id: "timeline", label: "Timeline" },
	{ id: "calendar", label: "Calendar" },
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
			cls: "friend-list-tabs",
			attr: { role: "tablist" },
		});
		for (const { id, label } of TABS) {
			const active = this.tab === id;
			const button = tabs.createEl("button", {
				cls: `friend-list-tab${active ? " active" : ""}`,
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
		this.tabsEl?.findAll(".friend-list-tab").forEach((el, i) => {
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
			this.contentEl.createDiv({
				cls: "section-helper-text",
				text: "Coming soon!",
			});
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

		switch (this.view.settings.friendListSort) {
			case "newest":
				list.sort((a, b) => b.file.stat.ctime - a.file.stat.ctime);
				break;
			case "oldest":
				list.sort((a, b) => a.file.stat.ctime - b.file.stat.ctime);
				break;
			case "birthday":
				list.sort(
					(a, b) =>
						(a.daysUntilBirthday ?? 9999) -
						(b.daysUntilBirthday ?? 9999)
				);
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
			const glanceButton = row.createEl("button", {
				cls: "callander-button friend-list-glance",
			});
			setIcon(glanceButton, "eye");
			glanceButton.createSpan({
				cls: "friend-list-glance-label",
				text: "Glance",
			});
			glanceButton.addEventListener("click", (e) => {
				e.stopPropagation();
				new GlanceModal(
					this.view.app,
					this.view.callander,
					contact
				).open();
			});
		}
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
					`${on.getDate()} ${monthName(on.getMonth() + 1)}`,
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
		when: string
	) {
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
		if (when) {
			row.createDiv({ cls: "contact-timeline-date", text: when });
		}
		const text = row.createDiv({ cls: "contact-timeline-text" });
		text.createSpan({
			cls: "friend-list-name",
			text: person.displayName,
		});
		this.appendGroupTags(text, person);
		row.addEventListener("click", () =>
			void this.view.openContact(person.file)
		);
	}

	/** Birthday as a plain date: "21 Aug 1997", "21 Aug", or "Aug 1997". */
	private birthdayDate(contact: ContactWithCountdown): string {
		const p = parseFlexDate(contact.birthday);
		return p ? formatShortFlexDate(p) : "";
	}
}
