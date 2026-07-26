import { setIcon } from "obsidian";
import type { ContactPageView } from "@/views/ContactPageView";
import type { FriendEvent } from "@/types";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { EVENT_TYPES } from "@/constants";
import {
	parseFlexDate,
	formatFlexDate,
	flexSortKey,
} from "@/utils/flexdate";

/**
 * The story of the friendship so far: events newest-first, grouped by year,
 * with the "met" date as the timeline's origin point at the bottom.
 */
export class EventTimeline {
	constructor(private view: ContactPageView) {}

	render(
		container: HTMLElement,
		events: FriendEvent[],
		met: string | number | undefined
	) {
		const timeline = container.createEl("div", {
			cls: "contact-timeline",
		});

		const empty = { year: null, month: null, day: null };
		type Row =
			| {
					kind: "event";
					event: FriendEvent;
					index: number;
					parsed: ReturnType<typeof parseFlexDate>;
			  }
			| {
					kind: "met";
					parsed: NonNullable<ReturnType<typeof parseFlexDate>>;
			  };

		const rows: Row[] = events.map((event, index) => ({
			kind: "event",
			event,
			index,
			parsed: parseFlexDate(event.date),
		}));

		// The origin — where the friendship began — sorts in like any dated row
		// rather than being pinned to the bottom.
		const metFlex = parseFlexDate(met);
		if (metFlex && metFlex.year !== null) {
			rows.push({ kind: "met", parsed: metFlex });
		}

		// Newest first; coarser dates sort after finer ones in the same period
		rows.sort(
			(a, b) =>
				flexSortKey(b.parsed ?? empty) - flexSortKey(a.parsed ?? empty)
		);

		let currentYearLabel: string | null = null;
		for (const row of rows) {
			const parsed = row.parsed;
			const yearLabel =
				parsed?.year !== null && parsed?.year !== undefined
					? String(parsed.year)
					: "Undated";

			if (yearLabel !== currentYearLabel) {
				currentYearLabel = yearLabel;
				timeline.createEl("div", {
					cls: "contact-timeline-year",
					text: yearLabel,
				});
			}

			if (row.kind === "event") {
				this.renderEventItem(
					timeline,
					row.event,
					row.index,
					row.parsed
				);
			} else {
				const origin = timeline.createEl("div", {
					cls: "contact-timeline-item contact-timeline-origin",
				});
				origin.createEl("div", { cls: "contact-timeline-dot" });
				origin.createEl("div", {
					cls: "contact-timeline-date",
					text: `Met — ${formatFlexDate(row.parsed)}`,
				});
			}
		}
	}

	private renderEventItem(
		container: HTMLElement,
		event: FriendEvent,
		index: number,
		parsed: ReturnType<typeof parseFlexDate>
	) {
		const item = container.createEl("div", {
			cls: "contact-timeline-item",
		});

		// Tapping the item opens the edit modal (the only path on mobile,
		// where the hover action buttons don't exist)
		item.addEventListener("click", () => {
			this.view.openEditEventModal(index, event);
		});

		// Typed events get a colored dot + emoji; untyped render neutral
		const type = EVENT_TYPES.find((t) => t.id === event.type);
		item.createEl("div", {
			cls: `contact-timeline-dot${type ? ` type-${type.id}` : ""}`,
		});

		// Date within a year group: "May 12", "May", or "Sometime that year"
		const dateLabel = parsed
			? parsed.month !== null
				? formatFlexDate({ ...parsed, year: null })
				: "Sometime that year"
			: String(event.date || "");

		item.createEl("div", {
			cls: "contact-timeline-date",
			text: type ? `${type.emoji} ${dateLabel}` : dateLabel,
		});

		const textEl = item.createEl("div", {
			cls: "contact-timeline-text",
			text: event.text,
		});

		// Where it happened, as a bullet after the text
		if (event.location) {
			textEl.createSpan({
				cls: "contact-timeline-location",
				text: ` · ${event.location}`,
			});
		}

		// Provenance badge: this event came from a diary entry
		if (event.source) {
			const badge = textEl.createEl("span", {
				cls: "contact-timeline-source",
				text: " 📖",
				attr: { "aria-label": "Open diary entry" },
			});
			badge.addEventListener("click", (e) => {
				e.stopPropagation();
				this.view.app.workspace.openLinkText(
					event.source!,
					"",
					true
				);
			});
		}

		// Actions
		const actions = item.createEl("div", {
			cls: "contact-timeline-actions",
		});

		const editBtn = actions.createEl("button", {
			cls: "friend-tracker-button button-icon",
			attr: { "aria-label": "Edit event" },
		});
		setIcon(editBtn, "pencil");
		editBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.view.openEditEventModal(index, event);
		});

		const deleteBtn = actions.createEl("button", {
			cls: "friend-tracker-button button-icon button-danger",
			attr: { "aria-label": "Delete event" },
		});
		setIcon(deleteBtn, "trash");
		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			const preview =
				event.text.length > 80
					? event.text.slice(0, 80) + "…"
					: event.text;
			new ConfirmModal(
				this.view.app,
				"Delete event",
				`Delete "${preview}" from the timeline?`,
				"Delete",
				() => this.view.deleteEvent(index)
			).open();
		});
	}
}
