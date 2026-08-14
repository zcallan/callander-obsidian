import {
	ItemView,
	WorkspaceLeaf,
	setIcon,
	type ViewStateResult,
} from "obsidian";
import { fieldOf } from "@/utils/fm";
import type FriendTracker from "@/main";
import type { ContactWithCountdown, EventInfo } from "@/types";
import { EventModal } from "@/modals/EventModal";
import { EventViewModal } from "@/modals/EventViewModal";
import { EVENT_TYPES, type EventType } from "@/constants";
import {
	EVENT_SORTS,
	EVENT_WHEN_FILTERS,
	applyEventSort,
	eventRowFields,
	eventSortOf,
	matchesEventWhen,
	type EventSort,
	type EventWhen,
} from "@/utils/eventRow";
import { buildUpcomingRow } from "@/components/UpcomingRow";
import { registerVaultRefresh } from "@/utils/vaultRefresh";

export const VIEW_TYPE_EVENTS = "callander-events";

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
	private events: EventInfo[] = [];
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

	constructor(leaf: WorkspaceLeaf, private plugin: FriendTracker) {
		super(leaf);
		this.navigation = true;
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
		const folder = this.plugin.eventOperations.getEventsFolderPath();
		// Settings are read at render time, so a change to one has to be
		// heard rather than waited on — otherwise it only lands on reopen.
		this.registerEvent(
			this.plugin.events.on("settings-changed", () => void this.refresh())
		);
		const inScope = (path: string) =>
			path === folder || path.startsWith(folder + "/");
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
		this.events = this.plugin.eventOperations
			.getEvents()
			.filter((e) => e.variant !== "timeline");
		this.contacts = await this.plugin.contactOperations.getContacts();
		this.render();
	}

	// ---- People ----

	/** An event's people links resolved to vault paths (dead links drop). */
	private peoplePaths(e: EventInfo): string[] {
		return this.plugin.eventOperations.peoplePaths(e);
	}

	private displayName(path: string): string {
		const match = this.contacts.find((c) => c.file.path === path);
		if (match) return match.displayName;
		// A group page, or someone outside the People folder — the file name
		// is still a better answer than the raw path.
		return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
	}

	private peopleNames(e: EventInfo): string {
		return this.peoplePaths(e)
			.map((p) => this.displayName(p))
			.join(", ");
	}

	/**
	 * Everyone who appears on at least one in-scope event, by name. This
	 * is the Person filter's roster — built from the events themselves
	 * rather than the friends list, so it never offers a name that would
	 * return nothing.
	 */
	private personRoster(scope: EventInfo[]): { path: string; label: string }[] {
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
		e: EventInfo,
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

	private matchesSearch(e: EventInfo, q: string): boolean {
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

	private sorted(): EventInfo[] {
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
	private inScope(): EventInfo[] {
		return this.events.filter((e) =>
			matchesEventWhen(e.date, this.when, new Date())
		);
	}

	private pipeline(over: {
		type?: EventType;
		personPath?: string;
	}): EventInfo[] {
		const q = this.searchQuery.trim().toLowerCase();
		const now = new Date();
		const matches = this.events.filter(
			(e) =>
				matchesEventWhen(e.date, this.when, now) &&
				this.matchesFilters(e, over) &&
				this.matchesSearch(e, q)
		);
		return applyEventSort(matches, this.plugin.settings.eventSort);
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

		// What this page is, right under its name.
		container.createDiv({
			cls: "section-helper-text someday-intro-note",
			text: "Everything on the calendar — what's coming up, and everything you've already done together.",
		});

		if (this.events.length > 0) {
			this.renderToolbar(container);
			this.renderWhenStrip(container);
		}

		this.listEl = container.createDiv({ cls: "someday-list" });
		this.renderList();

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
		const strip = container.createDiv({
			cls: "someday-filter-options someday-quick-days",
		});
		for (const { id, label } of EVENT_WHEN_FILTERS) {
			this.filterPill(strip, label, this.when === id, () => {
				if (this.when === id) return;
				this.when = id;
				this.render();
			});
		}
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

		const filterBtn = toolbar.createEl("button", {
			cls: `callander-button someday-filter-toggle${
				this.filtersOpen ? " is-open" : ""
			}`,
			attr: {
				type: "button",
				"aria-label": "Toggle filters",
				"aria-expanded": String(this.filtersOpen),
			},
		});
		setIcon(filterBtn, "filter");
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

		if (this.filtersOpen) this.renderFilterPanel(container);
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
		if (narrowed && this.events.length > 0) {
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
			if (target) this.openViewModal(target);
		}
	}

	/**
	 * Why the list is empty. Upcoming and Past each hide half the
	 * timeline, so an empty list under one of them usually means "look at
	 * the other half" rather than "you have nothing" — blaming the
	 * filters would send you hunting for a filter you never set.
	 */
	private emptyMessage(): string {
		if (this.events.length === 0) {
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

	private renderRow(container: HTMLElement, event: EventInfo) {
		const fields = eventRowFields(
			event,
			new Date(),
			this.peopleNames(event)
		);
		buildUpcomingRow(container, {
			...fields,
			// The "past" emphasis earns its keep on the dashboard, where a
			// gone-by date among upcoming ones means something slipped. Here
			// most of the page is history, so it would shout on every second
			// row and pick out nothing. "soon" still applies — that's the
			// one thing worth catching your eye on a calendar.
			tone: fields.tone === "past" ? undefined : fields.tone,
			onClick: () => this.openViewModal(event),
		});
	}

	private openViewModal(event: EventInfo) {
		new EventViewModal(this.app, this.plugin, event, () =>
			this.refresh()
		).open();
	}

	private openEditor() {
		new EventModal(this.app, this.plugin, null, () => this.refresh()).open();
	}
}
