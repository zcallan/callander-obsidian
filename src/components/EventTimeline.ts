import { setIcon } from "obsidian";
import type { ContactPageView } from "@/views/ContactPageView";
import type { EventInfo, FriendEvent } from "@/types";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { eventColour, EVENT_TYPES } from "@/constants";
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
	// Three shapes, in order: a flag (a pair of regional-indicator letters —
	// 🇺🇸 is "U"+"S", which Unicode does NOT class as pictographic); a keycap
	// (starts with an ASCII digit/#/*); or a base pictographic plus any
	// joiners, variation selectors and skin tones that follow it.
	const match = trimmed.match(
		/^(\p{Regional_Indicator}{2}|[0-9#*]️?⃣|\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic}|[︀-️]|[\u{1F3FB}-\u{1F3FF}])*)/u
	);
	if (!match) return null;
	const emoji = match[1];
	return { emoji, rest: trimmed.slice(emoji.length).trimStart() };
}

/**
 * What one timeline row needs to draw itself — the common ground between
 * an event file and a row derived from a Plan (which isn't stored on this
 * page and so can't be edited or deleted here).
 */
interface RowContent {
	name: string;
	date: string;
	type: string;
	location: string;
	description: string;
	source: string;
	/** Wikilink to the plan a derived row came from; "" otherwise. */
	plan: string;
	/** The backing event file; null for derived plan rows. */
	event: EventInfo | null;
}

function fromEvent(e: EventInfo): RowContent {
	return {
		name: e.name,
		date: e.date,
		type: e.type,
		location: e.location,
		description: e.description,
		source: e.source,
		plan: "",
		event: e,
	};
}

function fromPlanRow(e: FriendEvent): RowContent {
	return {
		name: e.text,
		date: e.date,
		type: e.type ?? "",
		location: e.location ?? "",
		description: e.description ?? "",
		source: e.source ?? "",
		plan: e.plan ?? "",
		event: null,
	};
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
		events: EventInfo[],
		met: string | number | undefined,
		planEvents: FriendEvent[] = []
	) {
		const timeline = container.createDiv({
			cls: "contact-timeline",
		});

		const empty = { year: null, month: null, day: null };
		type Row =
			| {
					kind: "row";
					content: RowContent;
					parsed: ReturnType<typeof parseFlexDate>;
			  }
			| {
					kind: "met";
					parsed: NonNullable<ReturnType<typeof parseFlexDate>>;
			  };

		const rows: Row[] = [
			...events.map(
				(e): Row => ({
					kind: "row",
					content: fromEvent(e),
					parsed: parseFlexDate(e.date),
				})
			),
			...planEvents.map(
				(e): Row => ({
					kind: "row",
					content: fromPlanRow(e),
					parsed: parseFlexDate(e.date),
				})
			),
		];

		// The origin — where the friendship began — sorts in like any dated row
		// rather than being pinned to the bottom.
		const metFlex = parseFlexDate(met);
		if (metFlex && metFlex.year !== null) {
			rows.push({ kind: "met", parsed: metFlex });
		}

		// Future events (never the "met" origin) float to the top.
		const isUpcoming = (row: Row) =>
			row.kind !== "met" && !!row.parsed && isFlexUpcoming(row.parsed);
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
			if (row.kind === "row") {
				this.renderEventItem(timeline, row.content, row.parsed, true);
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

			if (row.kind === "row") {
				this.renderEventItem(timeline, row.content, row.parsed, false);
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
		content: RowContent,
		parsed: ReturnType<typeof parseFlexDate>,
		upcoming: boolean
	) {
		// A row derived from a Plan isn't stored on this page, so it can't
		// be edited or deleted here — it opens the plan instead.
		const derived = content.event === null;
		const item = container.createDiv({
			cls: `contact-timeline-item${upcoming ? " upcoming" : ""}${
				derived ? " contact-timeline-derived" : ""
			}`,
		});

		// Tapping the item opens the edit modal (the only path on mobile,
		// where the hover action buttons don't exist).
		item.addEventListener("click", () => {
			if (content.event) {
				this.view.openEditEventModal(content.event);
				return;
			}
			const target = content.plan.replace(/^\[\[|\]\]$/g, "");
			if (target) {
				void this.view.app.workspace.openLinkText(target, "", true);
			}
		});

		// Typed events get a coloured dot; untyped render neutral. The colour
		// comes from EVENT_TYPES rather than a `.type-x` CSS rule, so the
		// calendar chip and this dot can't drift apart.
		const type = EVENT_TYPES.find((t) => t.id === content.type);
		const dot = item.createDiv({ cls: "contact-timeline-dot" });
		dot.style.backgroundColor = eventColour(String(content.type ?? ""));

		// Upcoming items keep the full date (incl. year); past items sit inside
		// a year group so they drop the year: "May 12", "May", "Sometime that year".
		const dateLabel = upcoming
			? parsed
				? formatFlexDate(parsed)
				: String(content.date || "")
			: parsed
			? parsed.month !== null
				? formatFlexDate({ ...parsed, year: null })
				: "Sometime that year"
			: String(content.date || "");

		// A leading emoji in the text stands in for the type emoji.
		const lead = splitLeadingEmoji(content.name);
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
			text: lead ? lead.rest : content.name,
		});

		// Where it happened, as a bullet after the text
		if (content.location) {
			textEl.createSpan({
				cls: "contact-timeline-location",
				text: ` · ${content.location}`,
			});
		}

		// Details sit under the name, styled like the date line
		if (content.description) {
			item.createDiv({
				cls: "contact-timeline-desc",
				text: content.description,
			});
		}

		// Provenance badge: this event came from a plan being marked done.
		// The stored value is a wikilink, so strip the brackets to get the
		// link target Obsidian expects.
		if (content.plan) {
			const target = content.plan.replace(/^\[\[|\]\]$/g, "");
			const badgeEl = textEl.createSpan({
				cls: "contact-timeline-source",
				text: " 🗺️",
				attr: { "aria-label": "Open plan" },
			});
			badgeEl.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.view.app.workspace.openLinkText(target, "", true);
			});
		}

		// Provenance badge: this event came from a diary entry
		if (content.source) {
			const source = content.source;
			const badgeEl = textEl.createSpan({
				cls: "contact-timeline-source",
				text: " 📖",
				attr: { "aria-label": "Open diary entry" },
			});
			badgeEl.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.view.app.workspace.openLinkText(source, "", true);
			});
		}

		// Actions — a derived plan row has no stored event behind it, so
		// there's nothing here to edit or delete. Change it on the plan.
		const event = content.event;
		if (!event) return;

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
			this.view.openEditEventModal(event);
		});

		const deleteBtn = actions.createEl("button", {
			cls: "callander-button button-icon button-danger",
			attr: { "aria-label": "Delete event" },
		});
		setIcon(deleteBtn, "trash");
		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			const preview =
				event.name.length > 80
					? event.name.slice(0, 80) + "…"
					: event.name;
			new ConfirmModal(
				this.view.app,
				"Delete event",
				`Delete "${preview}" from the timeline?`,
				"Delete",
				() => void this.view.deleteEvent(event)
			).open();
		});
	}
}
