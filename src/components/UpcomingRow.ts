import { setIcon } from "obsidian";
import type { RowTone } from "@/utils/upcomingWhen";

export interface UpcomingRowOpts {
	icon: string;
	date: string;
	time?: string;
	name: string;
	suffix: string;
	relative: string;
	/** Emphasis for the relative text (right-hand side) */
	tone?: RowTone;
	/** Emphasis for the date/when line (top-left) — a birthday that's today */
	whenTone?: RowTone;
	/** Emphasis for the suffix — rows whose timing lives there */
	suffixTone?: RowTone;
	/** Called off: the name is struck and the suffix reads "Cancelled". */
	cancelled?: boolean;
	onClick: () => void;
	/** Right-hand button, shown in place of the relative text */
	action?: {
		icon: string;
		label: string;
		ariaLabel: string;
		onClick: (e: MouseEvent) => void;
		/** Filled accent style — a birthday due today, not Missed's muted one */
		accent?: boolean;
	};
}

/**
 * The two-line "when / what" row: date above, name and whoever's involved
 * below, with how far off it is pinned right.
 *
 * Shared by the dashboard's Upcoming section and the Events page, so the
 * same event looks the same in both places.
 */
export function buildUpcomingRow(
	section: HTMLElement,
	opts: UpcomingRowOpts
): HTMLElement {
	const row = section.createDiv({
		cls: "dashboard-row dashboard-row-clickable dashboard-upcoming-row",
	});
	const mainCol = row.createDiv({ cls: "dashboard-upcoming-main" });
	// Rows without a date (missed birthdays) are single-line — skip the
	// when line entirely rather than leaving an empty gap above the name
	if (opts.icon || opts.date || opts.time) {
		// Joined rather than templated, so a row without a date — a
		// calendar's day list, where the heading already says the day —
		// doesn't open its line on a stray separator.
		const when = [opts.date, opts.time].filter(Boolean).join(" · ");
		mainCol.createDiv({
			cls: [
				"dashboard-upcoming-when",
				opts.whenTone ? `dashboard-rel-${opts.whenTone}` : "",
			]
				.filter(Boolean)
				.join(" "),
			text: [opts.icon, when].filter(Boolean).join(" "),
		});
	}
	const nameEl = mainCol.createDiv({ cls: "dashboard-upcoming-name" });
	nameEl.createSpan({
		cls: opts.cancelled ? "is-cancelled" : undefined,
		text: opts.name,
	});
	if (opts.suffix) {
		nameEl.createSpan({
			cls: [
				"dashboard-upcoming-person",
				opts.suffixTone ? `dashboard-rel-${opts.suffixTone}` : "",
				opts.cancelled ? "is-cancelled-note" : "",
			]
				.filter(Boolean)
				.join(" "),
			text: ` • ${opts.suffix}`,
		});
	}
	if (opts.action) {
		const button = row.createEl("button", {
			cls: [
				"callander-button",
				"dashboard-row-action",
				opts.action.accent ? "button-primary" : "",
			]
				.filter(Boolean)
				.join(" "),
			attr: { "aria-label": opts.action.ariaLabel },
		});
		setIcon(button, opts.action.icon);
		button.createSpan({ text: opts.action.label });
		button.addEventListener("click", opts.action.onClick);
	} else if (opts.relative) {
		row.createSpan({
			cls: `dashboard-upcoming-rel${
				opts.tone ? ` dashboard-rel-${opts.tone}` : ""
			}`,
			text: opts.relative,
		});
	}
	row.addEventListener("click", opts.onClick);
	return row;
}
