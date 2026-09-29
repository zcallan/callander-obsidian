import { setIcon } from "obsidian";
import type { FriendTrackerSettings } from "@/types";

/**
 * The calendar drawer: a ☰ beside the month that opens a panel of
 * checkboxes next to the grid. Shared by the Calendar page and the Events
 * page's Calendar tab, so the two draw and behave identically — each page
 * decides which sections to offer and what a tick does.
 */

export interface DrawerOption {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	/** A settings button at the end of the row, for an option that has
	 * more to configure than on and off. */
	action?: { label: string; onClick: () => void };
}

export interface DrawerSection {
	heading: string;
	options: DrawerOption[];
	/**
	 * Fold all but the first `visible` options behind "Show N more". The
	 * drawer is rebuilt on every tick, so whether it's open is the page's to
	 * remember and pass back in, not something the drawer can hold.
	 */
	fold?: { visible: number; open: boolean; onToggle: () => void };
}

/**
 * The ☰ ahead of the period label. Drawn rather than named, like the
 * page-width button: setIcon renders nothing for a name Obsidian doesn't
 * ship, and none on CLAUDE.md's verified list means "menu".
 */
export function appendDrawerToggle(
	title: HTMLElement,
	open: boolean,
	onToggle: () => void
) {
	const button = title.createEl("button", {
		cls: `callander-button fullcal-menu${open ? " is-active" : ""}`,
		attr: {
			type: "button",
			"aria-label": open ? "Hide options" : "Show options",
			"aria-expanded": String(open),
		},
	});
	const svg = button.createSvg("svg", {
		attr: {
			width: "16",
			height: "16",
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "2",
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
		},
	});
	for (const y of [6, 12, 18]) {
		svg.createSvg("line", {
			attr: { x1: "4", x2: "20", y1: String(y), y2: String(y) },
		});
	}
	button.addEventListener("click", onToggle);
}

/** The panel itself: a heading and a column of checkboxes per section.
 * A section with nothing to offer is left out entirely. */
export function appendDrawer(body: HTMLElement, sections: DrawerSection[]) {
	const drawer = body.createDiv({ cls: "fullcal-drawer" });
	sections
		.filter((section) => section.options.length > 0)
		.forEach((section, i) => {
			drawer.createDiv({
				cls: `fullcal-drawer-heading${
					i > 0 ? " fullcal-drawer-heading-display" : ""
				}`,
				text: section.heading,
			});
			const fold = section.fold;
			const folded = fold ? section.options.length - fold.visible : 0;
			const listed =
				fold && folded > 0 && !fold.open
					? section.options.slice(0, fold.visible)
					: section.options;
			for (const option of listed) {
				const row = drawer.createEl("label", {
					cls: "fullcal-drawer-option",
				});
				const box = row.createEl("input", { attr: { type: "checkbox" } });
				box.checked = option.checked;
				row.createSpan({ text: option.label });
				box.addEventListener("change", () => option.onChange(box.checked));
				const action = option.action;
				if (action) {
					const button = row.createEl("button", {
						cls: "clickable-icon fullcal-drawer-action",
						attr: { type: "button", "aria-label": action.label },
					});
					setIcon(button, "settings-2");
					// Inside the label, so a click would otherwise also tick
					// the box beside it.
					button.addEventListener("click", (e) => {
						e.preventDefault();
						e.stopPropagation();
						action.onClick();
					});
				}
			}
			if (fold && folded > 0) {
				const more = drawer.createEl("button", {
					cls: `fullcal-drawer-more${fold.open ? " is-open" : ""}`,
					attr: { type: "button", "aria-expanded": String(fold.open) },
				});
				setIcon(
					more.createSpan({ cls: "fullcal-drawer-more-icon" }),
					"chevron-down"
				);
				more.createSpan({
					text: fold.open ? "Show less" : `Show ${folded} more`,
				});
				more.addEventListener("click", fold.onToggle);
			}
		});
}

// ---- The options both calendars offer ----

/** A settings key that holds a boolean. */
export type FlagKey = {
	[K in keyof FriendTrackerSettings]-?: FriendTrackerSettings[K] extends boolean
		? K
		: never;
}[keyof FriendTrackerSettings];

/**
 * Where one calendar keeps its drawer's choices. The Calendar page and the
 * Events page's Calendar tab offer the same options but remember them
 * apart, under different (persisted, so unrenamed) keys.
 */
export interface DrawerKeys {
	wrapNames: FlagKey;
	/** Stored as the hide it always was; the drawer asks "show". */
	hideDateTime: FlagKey;
	/** Stored as names-instead-of-emoji; the drawer asks "emojis". */
	narrowNames: FlagKey;
	fadePast: FlagKey;
	colorBackgrounds: FlagKey;
	byCategory: FlagKey;
	byType: FlagKey;
	byGroup: FlagKey;
}

export const CALENDAR_PAGE_DRAWER: DrawerKeys = {
	wrapNames: "calendarWrapNames",
	hideDateTime: "calendarHideDateTime",
	narrowNames: "calendarNarrowNames",
	fadePast: "calendarFadePastEvents",
	colorBackgrounds: "calendarColorBackgrounds",
	byCategory: "calendarCustomCategoryColors",
	byType: "calendarColorByType",
	byGroup: "calendarColorByGroup",
};

export const EVENTS_TAB_DRAWER: DrawerKeys = {
	wrapNames: "eventsCalWrapNames",
	hideDateTime: "eventsCalHideDateTime",
	narrowNames: "eventsCalNarrowNames",
	fadePast: "eventsCalFadePastEvents",
	colorBackgrounds: "eventsCalColorBackgrounds",
	byCategory: "eventsCalUseCategoryColors",
	byType: "eventsCalColorByType",
	byGroup: "eventsCalColorByGroup",
};

/** A checkbox bound to one boolean setting; `inverted` when the drawer
 * asks the opposite of what's stored. `apply` redraws and saves. */
export function flagOption(
	settings: FriendTrackerSettings,
	key: FlagKey,
	label: string,
	apply: () => void,
	{ inverted = false }: { inverted?: boolean } = {}
): DrawerOption {
	return {
		label,
		checked: inverted ? !settings[key] : settings[key],
		onChange: (checked) => {
			settings[key] = inverted ? !checked : checked;
			apply();
		},
	};
}

/** The Display section's options: how the month grid draws. */
export function displayOptions(
	settings: FriendTrackerSettings,
	keys: DrawerKeys,
	apply: () => void
): DrawerOption[] {
	return [
		flagOption(settings, keys.wrapNames, "Wrap event names", apply),
		flagOption(settings, keys.hideDateTime, "Show second line", apply, {
			inverted: true,
		}),
		flagOption(settings, keys.narrowNames, "Emojis on mobile", apply, {
			inverted: true,
		}),
		flagOption(settings, keys.fadePast, "Fade past events", apply),
	];
}

/** Which colour list a Colors option's button opens. */
export type ColorSection = "categories" | "types" | "kinds";

/** The Colors section's options, each colouring rule with its button. */
export function colorOptions(
	settings: FriendTrackerSettings,
	keys: DrawerKeys,
	apply: () => void,
	openColors: (section: ColorSection) => void
): DrawerOption[] {
	const withColors = (
		option: DrawerOption,
		label: string,
		section: ColorSection
	): DrawerOption => ({
		...option,
		action: { label, onClick: () => openColors(section) },
	});
	return [
		flagOption(settings, keys.colorBackgrounds, "Color backgrounds", apply),
		withColors(
			flagOption(settings, keys.byCategory, "Color by category", apply),
			"Choose category colors",
			"categories"
		),
		withColors(
			flagOption(settings, keys.byType, "Color by type", apply),
			"Choose type colors",
			"types"
		),
		withColors(
			flagOption(settings, keys.byGroup, "Color by group", apply),
			"Choose group colors",
			"kinds"
		),
	];
}
