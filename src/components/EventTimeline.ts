import { setIcon } from "obsidian";
import type { ContactPageView } from "@/views/ContactPageView";
import type { FriendEvent } from "@/types";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { EVENT_TYPES } from "@/constants";
import {
	parseFlexDate,
	formatFlexDate,
	flexSortKey,
	isFlexUpcoming,
} from "@/utils/flexdate";

/**
 * If the text opens with an emoji (incl. variation selectors, skin tones,
 * ZWJ sequences, flags and keycaps), split it off so it can stand in for
 * the type emoji.
 */
export function splitLeadingEmoji(
	text: string
): { emoji: string; rest: string } | null {
	const trimmed = text.trimStart();
	// Three shapes, in order: a flag (a pair of regional-indicator letters \u2014
	// \uD83C\uDDFA\uD83C\uDDF8 is "U"+"S", which Unicode does NOT class as pictographic); a keycap
	// (starts with an ASCII digit/#/*); or a base pictographic plus any
	// joiners, variation selectors and skin tones that follow it.
	const match = trimmed.match(
		/^(\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic}|[\uFE00-\uFE0F]|[\u{1F3FB}-\u{1F3FF}])*)/u
	);
	if (!match) return null;
	const emoji = match[1];
	return { emoji, rest: trimmed.slice(emoji.length).trimStart() };
}

/**
 * The story of the friendship so far: future events surface at the top under
 * an "Upcoming" heading (soonest first); everything past runs newest-first,
 * grouped by year, with the "met" date as the timeline's origin point.
 */
export class EventTimeline {
	constructor(private view: ContactPageView) {}

	render(
		container: HTMLElement,
		events: FriendEvent[],
		met: string | number | undefined
	) {
		const timeline = container.createDiv({
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

		// Future events (never the "met" origin) float to the top.
		const isUpcoming = (row: Row) =>
			row.kind === "event" && !!row.parsed && isFlexUpcoming(row.parsed);
		const upcoming = rows
			.filter(isUpcoming)
			.sort(
				(a, b) =>
					flexSortKey(a.parsed ?? empty) -
					flexSortKey(b.parsed ?? empty)
			);
		const past = rows
			.filter((r) => !isUpcoming(r))
			.sort(
				(a, b) =>
					flexSortKey(b.parsed ?? empty) -
					flexSortKey(a.parsed ?? empty)
			);

		// Upcoming events — soonest first, at the top, each tagged "Upcoming".
		for (const row of upcoming) {
			if (row.kind === "event") {
				this.renderEventItem(
					timeline,
					row.event,
					row.index,
					row.parsed,
					true
				);
			}
		}

		// Past — newest first, grouped by year, with the "met" origin folded in.
		let currentYearLabel: string | null = null;
		for (const row of past) {
			const parsed = row.parsed;
			const yearLabel =
				parsed?.year !== null && parsed?.year !== undefined
					? String(parsed.year)
					: "Undated";

			if (yearLabel !== currentYearLabel) {
				currentYearLabel = yearLabel;
				timeline.createDiv({
					cls: "contact-timeline-year",
					text: yearLabel,
				});
			}

			if (row.kind === "event") {
				this.renderEventItem(
					timeline,
					row.event,
					row.index,
					row.parsed,
					false
				);
			} else {
				const origin = timeline.createDiv({
					cls: "contact-timeline-item contact-timeline-origin",
				});
				origin.createDiv({ cls: "contact-timeline-dot" });
				origin.createDiv({
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
		parsed: ReturnType<typeof parseFlexDate>,
		upcoming: boolean
	) {
		const item = container.createDiv({
			cls: `contact-timeline-item${upcoming ? " upcoming" : ""}`,
		});

		// Tapping the item opens the edit modal (the only path on mobile,
		// where the hover action buttons don't exist)
		item.addEventListener("click", () => {
			void this.view.openEditEventModal(index, event);
		});

		// Typed events get a colored dot; untyped render neutral
		const type = EVENT_TYPES.find((t) => t.id === event.type);
		item.createDiv({
			cls: `contact-timeline-dot${type ? ` type-${type.id}` : ""}`,
		});

		// Upcoming items keep the full date (incl. year); past items sit inside
		// a year group so they drop the year: "May 12", "May", "Sometime that year".
		const dateLabel = upcoming
			? parsed
				? formatFlexDate(parsed)
				: String(event.date || "")
			: parsed
			? parsed.month !== null
				? formatFlexDate({ ...parsed, year: null })
				: "Sometime that year"
			: String(event.date || "");

		// A leading emoji in the text stands in for the type emoji.
		const lead = splitLeadingEmoji(event.text);
		const badge = lead ? lead.emoji : type ? type.emoji : "";

		const dateEl = item.createDiv({
			cls: "contact-timeline-date",
			text: badge ? `${badge} ${dateLabel}` : dateLabel,
		});
		if (upcoming) {
			dateEl.createSpan({
				cls: "contact-timeline-upcoming-tag",
				text: " • Upcoming",
			});
		}

		const textEl = item.createDiv({
			cls: "contact-timeline-text",
			text: lead ? lead.rest : event.text,
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
			const badgeEl = textEl.createSpan({
				cls: "contact-timeline-source",
				text: " 📖",
				attr: { "aria-label": "Open diary entry" },
			});
			badgeEl.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.view.app.workspace.openLinkText(
					event.source!,
					"",
					true
				);
			});
		}

		// Actions
		const actions = item.createDiv({
			cls: "contact-timeline-actions",
		});

		const editBtn = actions.createEl("button", {
			cls: "callander-button button-icon",
			attr: { "aria-label": "Edit event" },
		});
		setIcon(editBtn, "pencil");
		editBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.view.openEditEventModal(index, event);
		});

		const deleteBtn = actions.createEl("button", {
			cls: "callander-button button-icon button-danger",
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
