import {
	ItemView,
	WorkspaceLeaf,
	setIcon,
	Notice,
	type ViewStateResult,
} from "obsidian";
import { fieldOf } from "@/utils/fm";
import type FriendTracker from "@/main";
import type { SomedayInfo } from "@/types";
import { SomedayModal } from "@/modals/SomedayModal";
import { SomedayViewModal } from "@/modals/SomedayViewModal";
import {
	SOMEDAY_DAYS,
	SOMEDAY_SEASONS,
	SOMEDAY_COMPANY,
	SOMEDAY_TYPES,
	SOMEDAY_SORTS,
	SomedayDay,
	SomedayCompany,
	SomedaySort,
	SomedayType,
} from "@/constants";
import {
	sortSomedays,
	possibleToday,
	WEEKDAY_BY_INDEX,
} from "@/utils/somedaySort";
import { somedayRowParts } from "@/utils/somedayRow";
import { buildSomedayRow } from "@/components/SomedayRow";
import { registerVaultRefresh } from "@/utils/vaultRefresh";

export const VIEW_TYPE_SOMEDAYS = "callander-somedays";

type DayFilter = "today" | "tomorrow" | "weekend";

/**
 * The full page of Somedays — the wishlist. Each idea is a plain row; clicking
 * one opens a view modal. A filter bar narrows by when (Today / Weekend / a
 * specific day / a season), by party (solo vs group) and by type, and a
 * sort the dashboard's own Somedays list follows.
 */
export class SomedaysView extends ItemView {
	private somedays: SomedayInfo[] = [];
	private searchQuery = "";
	private focusPath: string | null = null;
	private listEl: HTMLElement | null = null;

	// Filters — "when" (quick pill + specific-day + season, union) and party.
	// The quick pills are single-pick: Today, Tomorrow OR This weekend.
	private dayFilter: DayFilter | "" = "";
	private specificDay: SomedayDay | "" = "";
	private season = "";
	private company: SomedayCompany | "" = "";
	private type: SomedayType | "" = "";
	// The filter panel is opt-in chrome — closed on every page open, to keep
	// the list high; the toggle's badge keeps active filters visible while
	// it's shut.
	private filtersOpen = false;
	// Reshuffles the Random sort. Set once per page open (and when Random is
	// picked) rather than per render, so the list holds still while you type
	// in the search box or flip a filter.
	private randomSeed = Math.floor(Math.random() * 2 ** 31);

	constructor(leaf: WorkspaceLeaf, private plugin: FriendTracker) {
		super(leaf);
		this.navigation = true;
	}

	getViewType(): string {
		return VIEW_TYPE_SOMEDAYS;
	}

	getDisplayText(): string {
		return "Somedays";
	}

	getIcon(): string {
		return "sparkles";
	}

	async onOpen() {
		// A fresh shuffle each time the page is opened.
		this.randomSeed = Math.floor(Math.random() * 2 ** 31);
		// Settings are read at render time, so a change to one has to be
		// heard rather than waited on — otherwise it only lands on reopen.
		this.registerEvent(
			this.plugin.events.on("settings-changed", () => void this.refresh())
		);
		const folder = this.plugin.somedayOperations.getSomedaysFolderPath();
		const inScope = (path: string) =>
			path === folder || path.startsWith(folder + "/");
		registerVaultRefresh(this, this.plugin, () => void this.refresh(), {
			scope: inScope,
		});
		await this.refresh();
	}

	// Opening a Someday file routes here with its path → open its view modal.
	async setState(state: unknown, result: ViewStateResult) {
		const focusPath = fieldOf(state, "focusPath");
		this.focusPath = typeof focusPath === "string" ? focusPath : null;
		await super.setState(state, result);
		await this.refresh();
	}

	getState() {
		return {
			type: VIEW_TYPE_SOMEDAYS,
			focusPath: this.focusPath ?? undefined,
		};
	}

	async refresh() {
		this.somedays = this.plugin.somedayOperations.getSomedays();
		this.render();
	}

	// ---- Filtering ----

	private weekdayId(d: Date): SomedayDay {
		return WEEKDAY_BY_INDEX[d.getDay()];
	}

	/** The current weekend's actual dates — down to just Sunday once the
	 * weekend is underway. */
	private weekendDates(): Date[] {
		const now = new Date();
		if (now.getDay() === 0) return [now];
		const sat = new Date(now);
		sat.setDate(now.getDate() + (6 - now.getDay()));
		const sun = new Date(sat);
		sun.setDate(sat.getDate() + 1);
		return [sat, sun];
	}

	/** One quick pill's calendar test — shared by the live filter and the
	 * what-if counts the chips advertise. */
	private dayFilterPred(id: DayFilter): (s: SomedayInfo) => boolean {
		if (id === "weekend") {
			// "This weekend" means these two dates, not weekends at large —
			// so seasons, exact dates and from/until windows all get a say.
			const days = this.weekendDates();
			const hemisphere = this.plugin.settings.hemisphere;
			return (s) => days.some((d) => possibleToday(s, d, hemisphere));
		}
		const d = new Date();
		if (id === "tomorrow") d.setDate(d.getDate() + 1);
		const wd = this.weekdayId(d);
		return (s) => s.days.length === 0 || s.days.includes(wd);
	}

	/**
	 * Does a someday pass the active filters? `over` swaps a single facet
	 * for a hypothetical value while the others stay live — which is how
	 * each chip prices itself: "picked, how many rows would you see?"
	 */
	private matchesFilters(
		s: SomedayInfo,
		over: {
			when?: (x: SomedayInfo) => boolean;
			company?: SomedayCompany;
			type?: SomedayType;
		} = {}
	): boolean {
		// Type — the someday must carry it; unset is excluded like every
		// other filter here.
		const type = over.type ?? this.type;
		if (type && !s.types.includes(type)) return false;

		// Party — solo/group, with "either" matching both. Unset is excluded.
		const company = over.company ?? this.company;
		if (
			company === "solo" &&
			!(s.company === "solo" || s.company === "either")
		) {
			return false;
		}
		if (
			company === "group" &&
			!(s.company === "group" || s.company === "either")
		) {
			return false;
		}

		// "When" — union of active filters. An idea with no candidate days is
		// available any day, so it passes every day filter.
		if (over.when) return over.when(s);
		const preds: boolean[] = [];
		if (this.dayFilter) {
			preds.push(this.dayFilterPred(this.dayFilter)(s));
		}
		if (this.specificDay) {
			preds.push(
				s.days.length === 0 || s.days.includes(this.specificDay)
			);
		}
		if (this.season) preds.push(s.seasons.includes(this.season));
		if (preds.length === 0) return true;
		return preds.some((p) => p);
	}

	private matchesSearch(s: SomedayInfo, q: string): boolean {
		if (!q) return true;
		return (
			s.name.toLowerCase().includes(q) ||
			s.notes.toLowerCase().includes(q) ||
			s.people.some((p) => p.toLowerCase().includes(q)) ||
			s.subIdeas.some((sub) => sub.text.toLowerCase().includes(q))
		);
	}

	/** List size with one facet swapped out — what a chip advertises. */
	private countWith(over: {
		when?: (x: SomedayInfo) => boolean;
		company?: SomedayCompany;
		type?: SomedayType;
	}): number {
		const q = this.searchQuery.trim().toLowerCase();
		let n = 0;
		for (const s of this.somedays) {
			if (this.matchesSearch(s, q) && this.matchesFilters(s, over)) n++;
		}
		return n;
	}

	private sorted(): SomedayInfo[] {
		const q = this.searchQuery.trim().toLowerCase();
		const matches = this.somedays.filter(
			(s) => this.matchesFilters(s) && this.matchesSearch(s, q)
		);
		return sortSomedays(matches, this.plugin.settings.somedaySort, {
			randomSeed: this.randomSeed,
			hemisphere: this.plugin.settings.hemisphere,
		});
	}

	/** Open, un-converted somedays among the currently filtered set. */
	private openCandidates(): SomedayInfo[] {
		return this.sorted().filter(
			(s) => s.status !== "done" && !s.convertedTo
		);
	}

	private surpriseMe() {
		const open = this.openCandidates();
		if (open.length === 0) {
			new Notice("Nothing to surprise you with");
			return;
		}
		const pick = open[Math.floor(Math.random() * open.length)];
		this.openViewModal(pick);
	}

	// ---- Rendering ----

	private render() {
		const container = this.containerEl.children[1] as HTMLElement;
		const scrollTop = container.scrollTop;
		container.empty();
		container.addClass("dashboard-container", "somedays-container");

		// Header + New someday (+ Surprise me)
		const header = container.createDiv({ cls: "dashboard-header" });
		header.createEl("h2", { text: "Somedays" });
		const actions = header.createDiv({ cls: "dashboard-actions" });
		const newBtn = actions.createEl("button", {
			cls: "callander-button",
		});
		setIcon(newBtn, "plus");
		newBtn.createSpan({ text: "New someday" });
		newBtn.addEventListener("click", () => this.openEditor(null));

		if (this.openCandidates().length >= 2) {
			const surpriseBtn = actions.createEl("button", {
				cls: "callander-button someday-surprise",
				attr: { "aria-label": "Surprise me" },
			});
			setIcon(surpriseBtn, "dices");
			// Hidden on phones — the dice icon alone carries it there.
			surpriseBtn.createSpan({
				cls: "someday-surprise-label",
				text: "Surprise me",
			});
			surpriseBtn.addEventListener("click", () => this.surpriseMe());
		}

		// What this page is, right under its name.
		container.createDiv({
			cls: "section-helper-text someday-intro-note",
			text: "Loose ideas you want to do someday soon, but unsure of exact timing.",
		});

		// Search / sort / filters — one line of chrome above the list.
		if (this.somedays.length > 0) this.renderToolbar(container);

		this.listEl = container.createDiv({ cls: "someday-list" });
		this.renderList();

		container.scrollTop = scrollTop;
	}

	private filterPill(
		row: HTMLElement,
		label: string,
		active: boolean,
		onClick: () => void,
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

	/** How many of the panel's filters are narrowing the list — the Filters
	 * toggle wears this as a badge, so a filtered list is never a mystery
	 * while the panel is collapsed. Only counts what the panel hides; the
	 * day strip's pills advertise their own state. */
	private activeFilterCount(): number {
		return (
			(this.specificDay ? 1 : 0) +
			(this.season ? 1 : 0) +
			(this.company ? 1 : 0) +
			(this.type ? 1 : 0)
		);
	}

	/**
	 * One line of chrome: Search stretching left, Sort and Filters pinned
	 * right. The filters themselves live in a panel the Filters button
	 * expands — they're the bulkiest controls on the page and mostly sit
	 * untouched, so they stay folded away.
	 */
	private renderToolbar(container: HTMLElement) {
		const toolbar = container.createDiv({ cls: "someday-toolbar" });

		// Search — live, list-only re-render (the bar keeps its focus).
		const searchInput = toolbar.createEl("input", {
			attr: { type: "text", placeholder: "Search somedays…" },
			cls: "contact-field-input someday-toolbar-search",
		});
		searchInput.value = this.searchQuery;
		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value;
			this.renderList();
		});

		// Sort — persisted, because the dashboard's Somedays list follows it.
		const sortSel = toolbar.createEl("select", {
			cls: "dropdown someday-filter-select",
		});
		SOMEDAY_SORTS.forEach((s) =>
			sortSel.createEl("option", { value: s.id, text: s.label })
		);
		sortSel.value = this.plugin.settings.somedaySort;
		const handleSortChange = async () => {
			const next = sortSel.value as SomedaySort;
			// Re-picking Random deals a new order, rather than leaving the
			// same shuffle sitting there looking like nothing happened.
			if (next === "random") {
				this.randomSeed = Math.floor(Math.random() * 2 ** 31);
			}
			this.plugin.settings.somedaySort = next;
			await this.plugin.saveSettings();
			this.render();
			// The dashboard follows this sort, so bring it along.
			this.plugin.refreshDashboards();
		};
		sortSel.addEventListener("change", () => void handleSortChange());

		// Filters — a toggle for the panel below. No label column of its
		// own: the funnel explains itself, and the badge carries the state.
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

		this.renderDayStrip(container);
		if (this.filtersOpen) this.renderFilterPanel(container);
	}

	/** Today / Tomorrow / This weekend stay out in the open on their own
	 * line under the search bar — they're the in-the-moment filters ("what
	 * could we do today?"), too handy to fold into the panel. Single-pick,
	 * and deliberately uncounted: they're moods, not facets. */
	private renderDayStrip(container: HTMLElement) {
		const strip = container.createDiv({
			cls: "someday-filter-options someday-quick-days",
		});
		const dayPill = (id: DayFilter, label: string) =>
			this.filterPill(strip, label, this.dayFilter === id, () => {
				this.dayFilter = this.dayFilter === id ? "" : id;
				// The quick pills and the panel's Day chips answer the same
				// question two ways — picking one retires the other.
				if (this.dayFilter) this.specificDay = "";
				this.render();
			});
		dayPill("today", "Today");
		dayPill("tomorrow", "Tomorrow");
		dayPill("weekend", "This weekend");
	}

	private renderFilterPanel(container: HTMLElement) {
		const wrap = container.createDiv({ cls: "someday-filters" });

		// Every chip row keeps a FIXED roster: a chip renders when any
		// someday at all satisfies its facet, regardless of the other live
		// filters — chips vanishing (especially selected ones) as you
		// filter is jarring. The counts, by contrast, are live: each chip
		// prices itself as if it were the only filter in its group, with
		// search and the other groups still applied.

		// Day / Season — one chip per value, single-pick like Party and
		// Type; they join the strip's pills in the same "when" union.
		// Seasons deliberately don't give unseasoned somedays a pass
		// (unlike days, where no chosen days means any day suits).
		const dayRow = wrap.createDiv({ cls: "someday-filter-row" });
		dayRow.createSpan({ cls: "someday-filter-label", text: "Day" });
		const dayOpts = dayRow.createDiv({ cls: "someday-filter-options" });
		SOMEDAY_DAYS.forEach((d) => {
			const suits = (s: SomedayInfo) =>
				s.days.length === 0 || s.days.includes(d.id);
			if (!this.somedays.some(suits) && this.specificDay !== d.id) {
				return;
			}
			this.filterPill(
				dayOpts,
				d.label,
				this.specificDay === d.id,
				() => {
					this.specificDay =
						this.specificDay === d.id ? "" : d.id;
					// Mirror of the quick pills' rule: Day and the pills
					// never apply together.
					if (this.specificDay) this.dayFilter = "";
					this.render();
				},
				this.countWith({ when: suits })
			);
		});

		const seasonRow = wrap.createDiv({ cls: "someday-filter-row" });
		seasonRow.createSpan({ cls: "someday-filter-label", text: "Season" });
		const seasonOpts = seasonRow.createDiv({
			cls: "someday-filter-options",
		});
		SOMEDAY_SEASONS.forEach((sn) => {
			const suits = (s: SomedayInfo) => s.seasons.includes(sn.id);
			if (!this.somedays.some(suits) && this.season !== sn.id) return;
			this.filterPill(
				seasonOpts,
				`${sn.emoji} ${sn.label}`,
				this.season === sn.id,
				() => {
					this.season = this.season === sn.id ? "" : sn.id;
					this.render();
				},
				this.countWith({ when: suits })
			);
		});

		// Type — chips like Party's, one active at a time. Sixteen of them
		// wrap over a few lines, but the panel is opt-in now, so the height
		// is only spent when you're actually here to filter.
		const row3 = wrap.createDiv({ cls: "someday-filter-row" });
		row3.createSpan({ cls: "someday-filter-label", text: "Type" });
		const opts3 = row3.createDiv({ cls: "someday-filter-options" });
		SOMEDAY_TYPES.forEach((t) => {
			const suits = (s: SomedayInfo) => s.types.includes(t.id);
			if (!this.somedays.some(suits) && this.type !== t.id) return;
			this.filterPill(
				opts3,
				`${t.emoji} ${t.label}`,
				this.type === t.id,
				() => {
					this.type = this.type === t.id ? "" : t.id;
					this.render();
				},
				this.countWith({ type: t.id })
			);
		});

		// Party — solo / group (each a toggle; neither = everyone)
		const row2 = wrap.createDiv({ cls: "someday-filter-row" });
		row2.createSpan({ cls: "someday-filter-label", text: "Party" });
		const opts2 = row2.createDiv({ cls: "someday-filter-options" });
		(["group", "solo"] as const).forEach((id) => {
			const c = SOMEDAY_COMPANY.find((x) => x.id === id)!;
			const suits = (s: SomedayInfo) =>
				s.company === id || s.company === "either";
			if (!this.somedays.some(suits) && this.company !== id) return;
			this.filterPill(
				opts2,
				`${c.emoji} ${c.label}`,
				this.company === id,
				() => {
					this.company = this.company === id ? "" : id;
					this.render();
				},
				this.countWith({ company: id })
			);
		});
	}

	private renderList() {
		const listEl = this.listEl;
		if (!listEl) return;
		listEl.empty();

		const list = this.sorted();

		// A narrowed list says how narrowed it is — search and filters can
		// hide a lot, and the count keeps that honest. (Skipped when there
		// are no somedays at all: "Results (0)" over "No somedays yet"
		// would just be noise.) The ghost ✕ beside it resets the lot.
		const narrowed =
			this.searchQuery.trim().length > 0 ||
			this.dayFilter !== "" ||
			this.activeFilterCount() > 0;
		if (narrowed && this.somedays.length > 0) {
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
				this.dayFilter = "";
				this.specificDay = "";
				this.season = "";
				this.company = "";
				this.type = "";
				this.render();
			});
		}
		if (list.length === 0) {
			listEl.createDiv({
				cls: "section-helper-text",
				text:
					this.somedays.length === 0
						? "No somedays yet. Add the first thing you'd love to do."
						: "Nothing matches these filters.",
			});
			return;
		}

		for (const someday of list) this.renderRow(listEl, someday);

		// A row opened directly (via its file) → open its view modal, once.
		if (this.focusPath) {
			const target = list.find((s) => s.file.path === this.focusPath);
			this.focusPath = null;
			if (target) this.openViewModal(target);
		}
	}

	private renderRow(container: HTMLElement, someday: SomedayInfo) {
		const inactive = someday.status === "done" || !!someday.convertedTo;
		const row = container.createDiv({
			cls: `someday-card someday-row${
				inactive ? " someday-inactive" : ""
			}`,
		});
		buildSomedayRow(row, somedayRowParts(someday, new Date()));
		row.addEventListener("click", () => this.openViewModal(someday));
	}

	private openViewModal(someday: SomedayInfo) {
		new SomedayViewModal(this.app, this.plugin, someday, () =>
			this.refresh()
		).open();
	}

	private openEditor(someday: SomedayInfo | null) {
		new SomedayModal(
			this.app,
			this.plugin,
			someday,
			() => this.refresh(),
			() => this.refresh()
		).open();
	}
}
