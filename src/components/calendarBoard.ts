import type { CalendarMode, EventInfo, PlanInfo } from "@/types";
import { EVENT_TYPES, eventColour, specialEventTime } from "@/constants";
import { calendarChipMeta, eventTimeOrigin } from "@/utils/eventRow";
import { formatShortWeekdayDate, todayISO } from "@/utils/flexdate";
import {
	assignSpanLanes,
	eventsByDay,
	monthGrid,
	monthLabel,
	shortTime,
	spanRun,
	weekGrid,
	weekLabel,
	type CalendarDay,
	type SpanRun,
} from "@/utils/calendarGrid";
import { splitLeadingEmoji } from "@/utils/emoji";
import { needsDarkText } from "@/utils/contrastColor";
import { PLAN_ICON, planDays, planSpanLabel } from "@/utils/planRow";

/**
 * The month / week calendar, shared by the Events page's Calendar tab and the
 * full Calendar page — one grid, so the two can't drift apart in how a chip,
 * a plan's bar or a narrow pane's dots behave.
 *
 * The board knows nothing about where its items come from. A page turns its
 * events, plans and birthdays into BoardItems (the helpers at the bottom
 * build the common ones) and hands them over with somewhere to draw.
 */

/** Chips a month cell shows before it says "+N more". */
const CAL_CHIPS = 3;
/** Glyphs a narrow cell can hold — see the measurement in appendCell. */
const CAL_DOTS = 3;
/**
 * Pane width, in px, below which a month cell can't hold a readable chip.
 * Must match the container query in base.css — the stylesheet decides what
 * is drawn, this decides what a tap does.
 */
const CAL_NARROW = 620;
/** Indexed by Date.getDay(), so Sunday leads whatever the week opens on. */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** For a week's day headings, which have the room to spell it out —
 * unless the pane is narrow, where the abbreviation above still applies. */
const WEEKDAYS_FULL = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

/** One thing on the calendar, however it came to be there. */
export interface BoardItem {
	/** Unique on the board — what links a plan's bars across rows. */
	key: string;
	/** A plan runs as a bar in a lane of its own; the rest are chips. */
	kind: "event" | "plan" | "birthday";
	/** As written. A leading emoji moves to the second line as the glyph. */
	name: string;
	/** The days it's drawn on — every day of a plan, one for the rest. */
	days: string[];
	/** Start time, for ordering within a day; "" for anytime. */
	time: string;
	/** The one character that stands for it — see eventGlyph. */
	glyph: string | undefined;
	colour: string;
	cancelled: boolean;
	/** The second line's first fact: a start time, "Turns 32". A plan's
	 * bar uses the days it spans instead. */
	when: string;
	/** Who it's with, already summarised. */
	people: string;
	/** Where it is, if anywhere — shown as its own line in week view. */
	location: string;
	/** A click on its chip or its row. */
	open: () => void;
	/** Its row in the day list under a narrow month. */
	row: (container: HTMLElement) => void;
}

/** What the page keeps between renders; the board reads and updates it. */
export interface BoardState {
	mode: CalendarMode;
	/** Which month or week is showing. */
	cursor: Date;
	/** The day whose items list under a narrow month; "" for none. */
	selected: string;
}

export interface BoardOptions {
	state: BoardState;
	items: BoardItem[];
	weekStartsOn: 0 | 1;
	/** Draw again after the board changed its state — a new month, a
	 * picked day. */
	rerender: () => void;
	/** The month / week switch, for the page to remember. */
	onModeChange: (mode: CalendarMode) => void;
	/** Offer the Month / Week switch. On unless a page turns it off. */
	showModes?: boolean;
	/** Add something on this day — an empty square, or the day list's Add. */
	onAdd: (date: string) => void;
	/** Suppress a chip's whole second line — time, glyph and who's coming,
	 * or a plan's day range — on the month grid. */
	hideDateTime?: boolean;
	/** Wrap a chip's name on the month grid instead of truncating it. */
	wrapNames?: boolean;
	/** On a narrow month grid, list names in each cell instead of glyphs. */
	narrowNames?: boolean;
	/** Fade anything dated before today to 70% opacity — a cancelled event
	 * keeps its own, stronger fade instead. */
	fadePastEvents?: boolean;
	/**
	 * Draw a week as a row per day, its items side by side and wrapping,
	 * rather than seven columns — the phone's stacked week, at any width.
	 */
	weekRows?: boolean;
	/** Fill a chip with its own colour rather than just a left border —
	 * see contrastColor for how its text stays readable either way. */
	colorBackgrounds?: boolean;
	/** Put something ahead of the period label, like a menu button. */
	lead?: (bar: HTMLElement) => void;
	/**
	 * Where the grid itself goes, below the bar. Defaults to the board;
	 * a page that lays something out beside the grid returns its own box.
	 */
	body?: (wrap: HTMLElement) => HTMLElement;
}

/**
 * Draw the calendar into `host`.
 *
 * Deliberately not an hour grid, which is what a calendar of this shape
 * usually is. Every event in Google Calendar has a start and an end;
 * Callander's carry a flex date, often no time at all, and "Anytime" is a
 * real value. A week of mostly-empty hour rows would assert a precision the
 * notes don't have, so a week here is seven day columns.
 */
export function renderCalendarBoard(host: HTMLElement, opts: BoardOptions) {
	const { state } = opts;
	const wrap = host.createDiv({ cls: "cal" });
	if (opts.weekRows && state.mode === "week") wrap.addClass("is-week-rows");
	if (opts.colorBackgrounds) wrap.addClass("is-bg-colored");
	if (opts.fadePastEvents) wrap.addClass("is-fade-past");
	// The stylesheet swaps the glyphs for the names only when narrow; wide,
	// the chips are showing and the names block stays hidden.
	if (opts.narrowNames && state.mode === "month") {
		wrap.addClass("is-narrow-names");
	}
	watchWidth(host, wrap, opts);

	// Bars go in first so that, among the untimed, a day's plan leads the
	// rest: it's the container for the day, the same tie the dashboard
	// breaks.
	const bars = opts.items.filter((i) => i.kind === "plan");
	const placed = [
		...bars,
		...opts.items.filter((i) => i.kind !== "plan"),
	].flatMap((item) => item.days.map((day) => ({ item, day })));
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
	const spans = bars
		.map((i) => ({ key: i.key, days: i.days }))
		.filter((s) => s.days.length > 0);
	const board: Board = {
		opts,
		wrap,
		narrow: isNarrow(wrap),
		rows: opts.weekRows === true && state.mode === "week",
		lanes: assignSpanLanes(spans),
		spanDays: new Map(spans.map((s) => [s.key, s.days])),
	};

	appendBar(board);
	const body = opts.body?.(wrap) ?? wrap;
	const days =
		state.mode === "month"
			? monthGrid(state.cursor, new Date(), opts.weekStartsOn)
			: weekGrid(state.cursor, new Date(), opts.weekStartsOn);

	if (state.mode === "month") {
		const head = body.createDiv({ cls: "cal-weekdays" });
		const from = opts.weekStartsOn;
		for (const d of WEEKDAYS.slice(from).concat(WEEKDAYS.slice(0, from))) {
			head.createSpan({ text: d });
		}
	}

	const grid = body.createDiv({
		cls: state.mode === "month" ? "cal-grid" : "cal-week",
	});
	days.forEach((day, i) => {
		// The week row a cell sits in — what pairs a plan's bar with the
		// spacers holding its lane open in the cells it passes over.
		const cell = appendCell(board, grid, day, byDay.get(day.date) ?? []);
		cell.dataset.row = String(Math.floor(i / 7));
	});
	syncSpanHeights(grid);
	watchSpanHeights(host, grid);
	trackChipHover(grid);

	// Always built, never conditionally: the container query decides
	// whether it shows, and rebuilding on resize is not something a
	// stylesheet can ask a view to do.
	if (state.mode === "month") appendDayAgenda(board, body, byDay);
}

/**
 * Too narrow for chips? The .cal root is what the stylesheet's container
 * query measures, so this is the same question asked of the same box — the
 * stylesheet decides what's drawn, this decides what a tap does. Zero means
 * not laid out yet, which is no answer; it counts as wide until it is.
 */
function isNarrow(wrap: HTMLElement): boolean {
	const width = wrap.clientWidth;
	return width > 0 && width <= CAL_NARROW;
}

/** The observer watching each host's current board, so a redraw replaces
 * the last one's rather than piling up beside it. */
const widthWatchers = new WeakMap<HTMLElement, ResizeObserver>();

/**
 * Redraw once the board crosses the narrow breakpoint — including the first
 * time it's laid out at all, on a page drawn before it had a width. The
 * stylesheet swaps chips for dots on its own; this catches up what it
 * can't, like the month label shortening to fit a phone's bar.
 */
function watchWidth(host: HTMLElement, wrap: HTMLElement, opts: BoardOptions) {
	widthWatchers.get(host)?.disconnect();
	const drawnNarrow = isNarrow(wrap);
	const observer = new ResizeObserver(() => {
		if (!wrap.isConnected) {
			observer.disconnect();
			return;
		}
		if (wrap.clientWidth === 0 || isNarrow(wrap) === drawnNarrow) return;
		observer.disconnect();
		opts.rerender();
	});
	observer.observe(wrap);
	widthWatchers.set(host, observer);
}

/** One render's worth of working state. */
interface Board {
	opts: BoardOptions;
	/** The .cal root — where linked bars are looked up. */
	wrap: HTMLElement;
	/** Whether it was narrow when drawn — what the label was sized for. */
	narrow: boolean;
	/** A week drawn as a row per day — see BoardOptions.weekRows. */
	rows: boolean;
	/** Which line each plan's bar runs on, and the days it covers. */
	lanes: Map<string, number>;
	spanDays: Map<string, string[]>;
}

/** Period label on the left, navigation and the month/week pair right. */
function appendBar(board: Board) {
	const { opts } = board;
	const { state } = opts;
	const bar = board.wrap.createDiv({ cls: "cal-bar" });
	const title = bar.createDiv({ cls: "cal-bar-title" });
	opts.lead?.(title);
	title.createSpan({
		cls: "cal-period",
		// Abbreviated on a phone, where the bar has four buttons beside it
		// and a nine-letter month pushed them onto a second row.
		text:
			state.mode === "month"
				? monthLabel(state.cursor, board.narrow)
				: weekLabel(state.cursor, opts.weekStartsOn, board.narrow),
	});

	const nav = bar.createDiv({ cls: "cal-nav" });
	const step = (by: number) => {
		const next = new Date(state.cursor);
		if (state.mode === "month") next.setMonth(next.getMonth() + by);
		else next.setDate(next.getDate() + by * 7);
		state.cursor = next;
		// The day you'd picked is in the month you just left.
		state.selected = "";
		opts.rerender();
	};
	const button = (
		label: string,
		aria: string,
		onClick: () => void,
		/** Shown instead of `label` on a narrow pane, where the full word
		 * doesn't fit alongside the rest of the bar; `aria` still says the
		 * whole word either way. */
		narrowLabel?: string
	) => {
		const b = nav.createEl("button", {
			cls: "callander-button cal-nav-button",
			text: narrowLabel && board.narrow ? narrowLabel : label,
			attr: { type: "button", "aria-label": aria },
		});
		b.addEventListener("click", onClick);
	};
	button("‹", "Previous", () => step(-1));
	button(
		"Today",
		"Today",
		() => {
			state.cursor = new Date();
			state.selected = todayISO();
			opts.rerender();
		},
		"T"
	);
	button("›", "Next", () => step(1));

	if (opts.showModes === false) return;
	const modes = nav.createDiv({ cls: "cal-modes" });
	for (const mode of ["month", "week"] as CalendarMode[]) {
		const active = state.mode === mode;
		const full = mode === "month" ? "Month" : "Week";
		const b = modes.createEl("button", {
			cls: `callander-button cal-mode${active ? " is-active" : ""}`,
			text: board.narrow ? full[0] : full,
			attr: {
				type: "button",
				"aria-label": full,
				"aria-pressed": String(active),
			},
		});
		b.addEventListener("click", () => {
			if (state.mode === mode) return;
			state.mode = mode;
			opts.rerender();
			opts.onModeChange(mode);
		});
	}
}

function appendCell(
	board: Board,
	grid: HTMLElement,
	day: CalendarDay,
	items: BoardItem[]
): HTMLElement {
	const { opts } = board;
	const { state } = opts;
	const cls = ["cal-cell"];
	if (!day.inMonth) cls.push("is-outside");
	if (day.isToday) cls.push("is-today");
	if (day.date === state.selected) cls.push("is-selected");
	const cell = grid.createDiv({ cls: cls.join(" ") });

	const head = cell.createDiv({ cls: "cal-cell-head" });
	head.createSpan({ cls: "cal-daynum", text: String(day.day) });
	if (state.mode === "week") {
		const dow = new Date(day.date + "T00:00:00").getDay();
		head.createSpan({
			cls: "cal-dow",
			text: board.narrow ? WEEKDAYS[dow] : WEEKDAYS_FULL[dow],
		});
	}

	// Plans lead, each held to its own lane so a bar crossing several days
	// stays on one line. A lane whose plan doesn't reach this day gets an
	// empty slot rather than letting the ones below it rise.
	//
	// In a week of rows there are no lanes to keep: a plan can't stretch
	// across a row the way it does across columns, so it's a chip like the
	// rest, on every day it covers, saying which days those are.
	const plans = board.rows ? [] : items.filter((e) => e.kind === "plan");
	const rest = board.rows ? items : items.filter((e) => e.kind !== "plan");
	const laneOf = (item: BoardItem) => board.lanes.get(item.key) ?? 0;
	const lanes = plans.length === 0 ? 0 : Math.max(...plans.map(laneOf)) + 1;
	for (let lane = 0; lane < lanes; lane++) {
		const held = plans.find((p) => laneOf(p) === lane);
		const run = held
			? spanRun(
					board.spanDays.get(held.key) ?? [],
					day.date,
					opts.weekStartsOn
			  )
			: null;
		// The bar is drawn once per row, by the cell that opens the run,
		// and spans the columns it covers — so its title reads across the
		// whole thing rather than truncating inside the first square. Every
		// other cell of the run holds an empty slot instead.
		if (held && run?.opens) appendChip(board, cell, held, run);
		else {
			const slot = cell.createDiv({
				cls: "cal-chip is-stacked cal-span-spacer",
			});
			// Under a bar passing overhead: sized to it once laid out, so
			// a wrapped name can't run down over the chips below.
			if (held && run) slot.dataset.spanKey = held.key;
			slot.createDiv({ cls: "cal-chip-name", text: "\u00A0" });
			slot.createDiv({ cls: "cal-chip-meta", text: "\u00A0" });
		}
	}

	// Chips on a wide pane; the dots below are what a narrow one shows. A
	// row has the width to hold them all, wrapping as it needs to.
	const room = board.rows ? rest.length : Math.max(0, CAL_CHIPS - lanes);
	for (const item of rest.slice(0, room)) appendChip(board, cell, item);
	if (rest.length > room) {
		cell.createDiv({
			cls: "cal-more",
			text: `+${rest.length - room} more`,
		});
	}
	// A week of rows has room to say a day is free, where a month square
	// doesn't — an empty square already reads as free among a whole grid
	// of days, but an empty row beside a heading otherwise looks unfinished.
	if (board.rows && items.length === 0) {
		cell.createDiv({ cls: "cal-empty-day", text: "No events" });
	}
	// What a narrow pane shows in place of the chips. An emoji says what
	// kind of thing is on that day where a coloured dot only says
	// "something is" — at roughly 46px a column there's room for a glyph
	// and none for a word, so it's the most a cell can carry.
	//
	// A cancelled event is left out of it entirely: a glyph can't be faded
	// into meaning "not happening" at that size, and one of three slots is
	// too much to spend saying a thing is off. It's still in the day's list
	// underneath, which is where it can say so.
	const live = items.filter((e) => !e.cancelled);
	if (live.length > 0) {
		const dots = cell.createDiv({ cls: "cal-dots" });
		// Measured against a padded phone column of ~46px: a glyph is 11px
		// and a "+N" is 12. Three glyphs fit; three and a count do not. So a
		// quiet day shows all three and a busy one trades the third for the
		// count, which is the only arrangement that always fits and always
		// tells the truth about how much is there.
		const slots = live.length <= CAL_DOTS ? CAL_DOTS : CAL_DOTS - 1;
		for (const item of live.slice(0, slots)) {
			if (item.glyph) {
				dots.createSpan({ cls: "cal-glyph", text: item.glyph });
				continue;
			}
			// An untyped event with no emoji of its own still has to
			// register — the dot is what it falls back to.
			const dot = dots.createSpan({ cls: "cal-dot" });
			dot.style.backgroundColor = item.colour;
		}
		if (live.length > slots) {
			dots.createSpan({
				cls: "cal-glyph-more",
				text: `+${live.length - slots}`,
			});
		}
	}

	// The same slots again, as names — the narrow grid's alternative to
	// glyphs when the page asks for it. Built beside the dots rather than
	// instead of them, and the stylesheet shows whichever applies.
	//
	// It follows the month display settings the chips do: "Wrap event
	// names" lets a name run onto more lines, and unless "Hide second line"
	// is on, each name carries the chip's second line under it.
	if (opts.narrowNames && state.mode === "month" && items.length > 0) {
		const names = cell.createDiv({
			cls: `cal-names${opts.wrapNames ? " is-name-wrap" : ""}`,
		});
		// Plans lead, in their lanes, drawn once per week row as a bar
		// across the days they cover — the chips' scheme at phone size, so
		// a trip reads as one thing rather than its name in every square.
		for (let lane = 0; lane < lanes; lane++) {
			const held = plans.find((p) => laneOf(p) === lane);
			const run = held
				? spanRun(
						board.spanDays.get(held.key) ?? [],
						day.date,
						opts.weekStartsOn
				  )
				: null;
			if (held && !held.cancelled && run?.opens) {
				appendNameBar(board, day.date, names, held, run);
			} else {
				const slot = appendNameSpacer(names, opts.hideDateTime === true);
				if (held && !held.cancelled && run) slot.dataset.spanKey = held.key;
			}
		}
		const liveRest = rest.filter((e) => !e.cancelled);
		const room = Math.max(0, CAL_DOTS - lanes);
		const shown =
			liveRest.length <= room ? room : Math.max(0, room - 1);
		for (const item of liveRest.slice(0, shown)) {
			appendName(
				board,
				day.date,
				names,
				item,
				opts.hideDateTime === true,
				opts.colorBackgrounds === true
			);
		}
		if (liveRest.length > shown) {
			names.createDiv({
				cls: "cal-name-more",
				text: `+${liveRest.length - shown}`,
			});
		}
	}

	// Empty space in a cell adds something on that day. The chips stop
	// their own clicks, so this only fires where nothing was hit.
	cell.addEventListener("click", () => {
		// Measured now, not when the grid was drawn: a page drawn as it
		// opens hasn't been laid out yet and reads as zero wide, which used
		// to make every tap on a phone open the Add event modal.
		const narrow = isNarrow(board.wrap);
		// A narrow week is already every day stacked with its items under
		// it — there is no agenda to point at, so picking a day would redraw
		// the same screen and highlight one row of it for no reason.
		if (narrow && state.mode === "week") return;
		state.selected = day.date;
		// On a narrow pane a tap picks the day rather than opening a modal
		// — the day's items are what you're reaching for, and they're right
		// underneath.
		if (narrow) opts.rerender();
		else opts.onAdd(day.date);
	});
	return cell;
}

/**
 * Marks a day selected and redraws — what tapping its empty space already
 * does (see appendCell). Opening something from inside a narrow day's list
 * does the same, so closing the modal leaves that day showing underneath
 * rather than whatever was selected (or nothing) before the tap.
 */
function selectDay(board: Board, date: string) {
	board.opts.state.selected = date;
	board.opts.rerender();
}

/** A name in a narrow cell's list, with the chip's second line under it
 * unless that's hidden: its time, or with no time, who's coming. */
function appendName(
	board: Board,
	date: string,
	names: HTMLElement,
	item: BoardItem,
	hideSecond: boolean,
	/** Filled with its colour, as the chips are under "Color backgrounds". */
	filled: boolean
) {
	const own = splitLeadingEmoji(item.name);
	const cls = ["cal-name"];
	if (isPast(item)) cls.push("is-past-event");
	const name = names.createDiv({ cls: cls.join(" ") });
	name.style.setProperty("--cal-chip", item.colour);
	if (filled) applyReadableBackground(name);
	name.createDiv({ cls: "cal-name-text", text: own ? own.rest : item.name });
	// Same as appendChip/appendNameBar: a tap opens the event rather than
	// falling through to the cell's own click — but also selects this day
	// itself, so closing the modal leaves its other items in view instead
	// of whatever day was selected (or none) before the tap.
	name.addEventListener("click", (e) => {
		e.stopPropagation();
		selectDay(board, date);
		item.open();
	});
	if (hideSecond) return;
	const meta = calendarChipMeta(
		item.glyph,
		item.when,
		item.when ? "" : item.people
	);
	if (meta) name.createDiv({ cls: "cal-name-meta", text: meta });
}

/**
 * A plan in a narrow cell's list: a bar across the days of its run in this
 * week row, the way appendChip draws one on a wide grid — linked hover,
 * squared-off end where it carries on, a tap to open it.
 */
function appendNameBar(
	board: Board,
	date: string,
	names: HTMLElement,
	item: BoardItem,
	run: SpanRun
) {
	const days = board.spanDays.get(item.key) ?? [];
	const span = run.length + (run.continues ? 1 : 0) > 1;
	const cls = ["cal-name", "is-plan"];
	if (isPast(item)) cls.push("is-past-event");
	if (span) {
		cls.push("is-span");
		if (run.continues) cls.push("is-span-open-end");
	}
	const bar = names.createDiv({ cls: cls.join(" ") });
	bar.style.setProperty("--cal-chip", item.colour);
	if (board.opts.colorBackgrounds) applyReadableBackground(bar);
	if (span) {
		bar.style.setProperty("--span-cols", String(run.length));
		linkSpanHover(board, bar, item.key);
	}
	const own = splitLeadingEmoji(item.name);
	bar.createDiv({ cls: "cal-name-text", text: own ? own.rest : item.name });
	if (!board.opts.hideDateTime) {
		const meta = calendarChipMeta(
			item.glyph,
			span ? planSpanLabel(days) : item.when,
			span || item.when ? "" : item.people
		);
		if (meta) bar.createDiv({ cls: "cal-name-meta", text: meta });
	}
	bar.addEventListener("click", (e) => {
		e.stopPropagation();
		selectDay(board, date);
		item.open();
	});
}

/** Holds a plan's lane open in a cell its bar passes over, the same height
 * as the bar, so the names below stay on their own lines. */
function appendNameSpacer(
	names: HTMLElement,
	hideSecond: boolean
): HTMLElement {
	const slot = names.createDiv({ cls: "cal-name cal-name-spacer" });
	slot.createDiv({ cls: "cal-name-text", text: "\u00a0" });
	if (!hideSecond) slot.createDiv({ cls: "cal-name-meta", text: "\u00a0" });
	return slot;
}

/**
 * Give every spacer under a plan's bar the bar's height.
 *
 * A bar is one element, in the cell that opens its run, stretched across
 * the rest; the cells it passes over hold a spacer to keep its lane open.
 * With names wrapping, the bar can be taller than a spacer's fixed lines,
 * and without this it would hang down over those cells' own items. Bars
 * that aren't showing (the chips on a phone, the names on a wide grid)
 * measure zero and are skipped, so each spacer takes its own kind's bar.
 */
function syncSpanHeights(grid: HTMLElement) {
	const rowOf = (el: HTMLElement) =>
		el.closest<HTMLElement>(".cal-cell")?.dataset.row ?? "";
	const heights = new Map<string, number>();
	grid.querySelectorAll<HTMLElement>(".is-span[data-plan-path]").forEach((bar) => {
		const height = bar.offsetHeight;
		if (height === 0) return;
		const kind = bar.classList.contains("cal-name") ? "name" : "chip";
		heights.set(`${kind}|${bar.dataset.planPath}|${rowOf(bar)}`, height);
	});
	grid.querySelectorAll<HTMLElement>("[data-span-key]").forEach((slot) => {
		const kind = slot.classList.contains("cal-name") ? "name" : "chip";
		const height = heights.get(`${kind}|${slot.dataset.spanKey}|${rowOf(slot)}`);
		if (height) slot.style.height = `${height}px`;
		else slot.style.removeProperty("height");
	});
}

/**
 * Mark the cell a hovered chip belongs to, so the cell's own hover can
 * stand down — see the stylesheet's `.cal-cell:hover:not(.is-chip-hover)`.
 *
 * Delegated to the grid rather than listened for per chip, and a class
 * rather than the `:has(.cal-chip:hover)` this replaces: one pair of
 * listeners for a board of any size, and no selector that re-tests every
 * cell as the pointer moves.
 *
 * A plan's bar is a child of only the cell its run opens, so hovering
 * anywhere along it marks that cell — which is the one :hover reaches
 * through the bar, and so the only one to stand down.
 */
function trackChipHover(grid: HTMLElement) {
	let marked: HTMLElement | null = null;
	const mark = (cell: HTMLElement | null) => {
		if (cell === marked) return;
		// classList, not Obsidian's toggleClass: these come back from
		// closest() rather than createDiv, so this sticks to the one API
		// that works on them whatever patched what — as linkSpanHover does.
		marked?.classList.remove("is-chip-hover");
		cell?.classList.add("is-chip-hover");
		marked = cell;
	};
	grid.addEventListener("mouseover", (e) => {
		const chip = (e.target as HTMLElement | null)?.closest<HTMLElement>(
			".cal-chip"
		);
		mark(chip?.closest<HTMLElement>(".cal-cell") ?? null);
	});
	// Doesn't bubble, so this is the pointer leaving the board itself.
	grid.addEventListener("mouseleave", () => mark(null));
}

/** The observer re-syncing each host's grid, replaced on every redraw. */
const heightWatchers = new WeakMap<HTMLElement, ResizeObserver>();

/**
 * Re-sync when the grid changes width: the columns narrow or widen, so a
 * bar's name wraps differently. Width only — the sync itself changes the
 * grid's height, and reacting to that would feed back into itself.
 */
function watchSpanHeights(host: HTMLElement, grid: HTMLElement) {
	heightWatchers.get(host)?.disconnect();
	let width = grid.clientWidth;
	const observer = new ResizeObserver(() => {
		if (!grid.isConnected) {
			observer.disconnect();
			return;
		}
		if (grid.clientWidth === width) return;
		width = grid.clientWidth;
		syncSpanHeights(grid);
	});
	observer.observe(grid);
	heightWatchers.set(host, observer);
}

/**
 * A plan crossing a week boundary draws a separate bar on the row below —
 * same plan, two DOM elements with no relationship CSS :hover can see on
 * its own. Hovering either links them all by toggling a class across every
 * bar on the board that shares this key.
 */
function linkSpanHover(board: Board, el: HTMLElement, key: string) {
	el.dataset.planPath = key;
	const setLinked = (on: boolean) => {
		board.wrap
			.querySelectorAll<HTMLElement>(".is-span[data-plan-path]")
			.forEach((other) => {
				// classList.toggle rather than Obsidian's own toggleClass:
				// these came back from a plain querySelectorAll rather than
				// createDiv/createEl, so this sticks to the one API
				// guaranteed to work on them regardless of what patched what.
				if (other.dataset.planPath === key) {
					other.classList.toggle("is-plan-hover", on);
				}
			});
	};
	el.addEventListener("mouseenter", () => setLinked(true));
	el.addEventListener("mouseleave", () => setLinked(false));
}

/** Its last day, before today — the one date a multi-day plan needs, and
 * a single-day item's only one. Empty (undated) is never "past". */
function isPast(item: BoardItem): boolean {
	if (item.days.length === 0) return false;
	return item.days[item.days.length - 1] < todayISO();
}

/**
 * With the chip's colour filling its background instead of just its left
 * edge, the fixed white/muted text this stylesheet otherwise gives it can
 * land wrong — dark text on the same dark grey it uses elsewhere reads
 * fine until the colour turns out to be movie-poster yellow. Read back
 * what the colour actually rendered as (`getComputedStyle`, since it's as
 * likely `var(--interactive-accent)` as it is a fixed hex) and mark the
 * chip when it needs dark text instead.
 */
function applyReadableBackground(chip: HTMLElement) {
	// Chips on a wide grid, and names and plan bars in a phone's squares —
	// the stylesheet fills both under .is-bg-colored.
	// Not the --cal-chip custom property directly — a browser's computed
	// value for a custom property doesn't reliably resolve its own var()
	// references into an rgb() the parser understands. background-color is
	// an ordinary property, and its computed value always does, whatever
	// --cal-chip turned out to be — a fixed hex, hsl(), or a theme's
	// var(--interactive-accent) — because the CSS rule below has already
	// applied it by the time this runs.
	if (needsDarkText(getComputedStyle(chip).backgroundColor)) {
		chip.addClass("is-bg-light");
	}
}

/**
 * One item in a calendar square, over two lines.
 *
 * The name gets a line to itself, the way the B'day Calendar gives a person
 * theirs: on one line the icon and the time ate the front of it and every
 * chip in a busy week truncated to the same few characters.
 *
 * An emoji the name already leads with stands in for the type icon —
 * somebody who typed one chose it for this event, where the type emoji is
 * the same on every hangout. It moves to the meta line so the name reads as
 * words and the icon stays in one place down the column.
 */
function appendChip(
	board: Board,
	cell: HTMLElement,
	item: BoardItem,
	run?: SpanRun
) {
	// A plan covering more than a day draws as a bar across them rather than
	// as the same chip repeated in each square.
	const days = board.spanDays.get(item.key) ?? [];
	const span = run && run.length + (run.continues ? 1 : 0) > 1;

	const cls = ["cal-chip", "is-stacked"];
	// Still on the calendar, because a day you'd kept free is worth seeing
	// — just faded, so it doesn't read as something happening.
	if (item.cancelled) cls.push("is-cancelled");
	if (isPast(item)) cls.push("is-past-event");
	if (board.opts.wrapNames && board.opts.state.mode === "month") {
		cls.push("is-name-wrap");
	}
	if (span) {
		cls.push("is-span");
		// Squared off where the bar carries on into the next row, so the
		// week break doesn't read as the end of the trip.
		if (run.continues) cls.push("is-span-open-end");
	}
	const chip = cell.createDiv({ cls: cls.join(" ") });
	chip.style.setProperty("--cal-chip", item.colour);
	if (board.opts.colorBackgrounds) applyReadableBackground(chip);
	if (span) {
		chip.style.setProperty("--span-cols", String(run.length));
		// Hovering one row's bar lights the plan's bars on every row.
		linkSpanHover(board, chip, item.key);
	}

	const own = splitLeadingEmoji(item.name);
	chip.createDiv({
		cls: "cal-chip-name",
		text: own ? own.rest : item.name,
	});

	// Second line: the glyph, and then what places the thing in time — a
	// start time, or the days a plan runs across. A bar broken over a week
	// boundary carries the whole span on both halves.
	//
	// A cancelled event keeps its name and nothing else: what kind of thing
	// it was and what time it would have started are details of an evening
	// that isn't happening.
	// Week view has the whole width of a day to spend, so location and
	// people each get their own line below the glyph/time one — every one
	// truncated rather than wrapped, since three or four wrapped lines a
	// chip would make the column read more like a form than a calendar.
	const weekDetail = board.opts.state.mode === "week" && !span;
	// A plan's days, where it's a chip rather than a bar across them — a
	// week of rows draws it on each day, and its range is the useful fact.
	const range = span || (item.kind === "plan" && days.length > 1);
	// The month display setting drops the whole second line, plan bars
	// included: their day range is what it shows there, and hiding it is
	// the same "just the name and colour" ask as for anything else.
	const hideSecondLine =
		board.opts.hideDateTime === true && board.opts.state.mode === "month";
	const meta =
		item.cancelled || hideSecondLine
			? ""
			: calendarChipMeta(
					item.glyph,
					range ? planSpanLabel(days) : item.when,
					// Whose evening it is — but only when there's no time to
					// share the line with instead. The two compete for the
					// same handful of characters, and a start time is the
					// more useful of the two to lead with. A plan's line is
					// already spoken for by the days it runs across, and a
					// week chip gets people its own line below regardless.
					range || weekDetail || item.when ? "" : item.people
			  );
	if (meta) chip.createDiv({ cls: "cal-chip-meta", text: meta });
	if (weekDetail && !item.cancelled) {
		if (item.location) {
			chip.createDiv({ cls: "cal-chip-location", text: item.location });
		}
		if (item.people) {
			chip.createDiv({ cls: "cal-chip-people", text: item.people });
		}
	}

	chip.addEventListener("click", (e) => {
		e.stopPropagation();
		item.open();
	});
}

/**
 * The selected day's items, listed under a narrow month grid.
 *
 * Seven columns of chips don't fit a phone, so the grid keeps its shape and
 * drops to dots while the detail moves here — the same answer Google
 * Calendar, Apple and Fantastical all arrive at.
 */
function appendDayAgenda(
	board: Board,
	wrap: HTMLElement,
	byDay: Map<string, BoardItem[]>
) {
	const { opts } = board;
	const { state } = opts;
	const agenda = wrap.createDiv({ cls: "cal-agenda" });
	// Nothing picked in this month yet — say so rather than showing a day
	// from the one before it.
	if (!state.selected) {
		agenda.createDiv({
			cls: "section-helper-text",
			text: "Pick a day to see what's on.",
		});
		return;
	}
	const selected = state.selected;
	const day = new Date(selected + "T00:00:00");
	const head = agenda.createDiv({ cls: "cal-agenda-head" });
	head.createSpan({ text: formatShortWeekdayDate(day) });
	const add = head.createEl("button", {
		cls: "callander-button cal-agenda-add",
		text: "+ Add",
		attr: { type: "button" },
	});
	add.addEventListener("click", () => opts.onAdd(selected));

	const items = byDay.get(selected) ?? [];
	if (items.length === 0) {
		agenda.createDiv({
			cls: "section-helper-text",
			text: "Nothing on this day",
		});
		return;
	}
	for (const item of items) item.row(agenda);
}

// ---- Building items ----

/**
 * The one character that stands for an event or plan: its own leading
 * emoji if it has one, else its type's (or the plan icon). Shared by the
 * chip and the narrow grid so the same thing reads the same at both widths.
 */
function eventGlyph(
	name: string,
	kind: "event" | "plan",
	type: string
): string | undefined {
	return (
		splitLeadingEmoji(name)?.emoji ??
		(kind === "plan"
			? PLAN_ICON
			: EVENT_TYPES.find((t) => t.id === type)?.emoji)
	);
}

/** An event as the board draws it. */
export function eventBoardItem(
	event: EventInfo,
	people: string,
	open: () => void,
	row: (container: HTMLElement) => void,
	/** The zone the board is read in, so a converted chip can say where
	 * its time came from. */
	viewerZone = ""
): BoardItem {
	const origin = viewerZone ? eventTimeOrigin(event, viewerZone) : "";
	return {
		key: event.file.path,
		kind: "event",
		name: event.name,
		days: [event.date],
		// Only a clock time orders a day's list; "Anytime" and "TBD" sit
		// with the untimed at its head, which is where a thing with no
		// hour belongs. The label below still says which it is.
		time: specialEventTime(event.time) ? "" : event.time,
		glyph: eventGlyph(event.name, "event", event.type),
		// Its own colour if one was picked for it, on either calendar.
		colour: event.color || eventColour(event.type),
		cancelled: event.status === "cancelled",
		// Cramped as a chip is, a converted time says so here too — a "1pm"
		// you entered as 12pm CT is otherwise indistinguishable from a
		// typo, and the calendar is where most of them are read.
		when: event.time
			? [shortTime(event.time), origin && `(${origin})`]
					.filter(Boolean)
					.join(" ")
			: "",
		people,
		location: event.location,
		open,
		row,
	};
}

/**
 * A plan as the board draws it: every day it spans. A plan has no type to
 * take a colour from, so it borrows the accent — it's the one thing on the
 * grid that isn't an event.
 */
export function planBoardItem(
	plan: PlanInfo,
	people: string,
	open: () => void,
	row: (container: HTMLElement) => void
): BoardItem {
	return {
		key: plan.file.path,
		kind: "plan",
		name: plan.name,
		days: planDays(plan),
		time: "",
		glyph: eventGlyph(plan.name, "plan", ""),
		colour: "var(--interactive-accent)",
		cancelled: plan.status === "cancelled",
		when: "",
		people,
		location: plan.location,
		open,
		row,
	};
}
