import { setIcon } from "obsidian";

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
			for (const option of section.options) {
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
		});
}
