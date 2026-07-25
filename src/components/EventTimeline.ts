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

		// Newest first; coarser dates sort after finer ones in the same period
		const sorted = events
			.map((event, index) => ({ event, index }))
			.sort((a, b) => {
				const keyA = flexSortKey(
					parseFlexDate(a.event.date) ?? {
						year: null,
						month: null,
						day: null,
					}
				);
				const keyB = flexSortKey(
					parseFlexDate(b.event.date) ?? {
						year: null,
						month: null,
						day: null,
					}
				);
				return keyB - keyA;
			});

		let currentYearLabel: string | null = null;

		for (const { event, index } of sorted) {
			const parsed = parseFlexDate(event.date);
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

			this.renderEventItem(timeline, event, index, parsed);
		}

		// The origin point: where the friendship began
		const metFlex = parseFlexDate(met);
		if (metFlex && metFlex.year !== null) {
			const origin = timeline.createEl("div", {
				cls: "contact-timeline-item contact-timeline-origin",
			});
			origin.createEl("div", { cls: "contact-timeline-dot" });
			origin.createEl("div", {
				cls: "contact-timeline-date",
				text: `Met — ${formatFlexDate(metFlex)}`,
			});
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
				text: ` · 📍 ${event.location}`,
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
