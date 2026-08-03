import { App, Modal, setIcon } from "obsidian";
import type { PlanTimelineEntry } from "@/types";
import {
	ACCOMMODATION_TYPES,
	BOOKING_STATES,
	PLAN_IDEA_CATEGORIES,
	PLAN_PRIORITIES,
	TRAVEL_TYPES,
} from "@/constants";
import { ConfirmModal } from "@/modals/ConfirmModal";
import {
	formatItemCost,
	formatItemTime,
	formatTimelineDay,
	nightsSummary,
} from "@/utils/planFormat";

/**
 * A read view of one plan-timeline row — whatever it happens to be: an idea,
 * a travel leg or a stay — with Edit and Delete. Mirrors ReminderViewModal.
 * Routing back to the real item is the caller's job (it owns source + index).
 */
export class PlanTimelineViewModal extends Modal {
	constructor(
		app: App,
		private entry: PlanTimelineEntry,
		private onEdit: () => void,
		private onDelete: () => Promise<void>
	) {
		super(app);
	}

	/** Date, then either the clock time or a stay's "Sleeping at". */
	private whenLabel(): string {
		const parts = [formatTimelineDay(this.entry.date)];
		if (this.entry.source === "accommodation") parts.push("Sleeping at");
		else if (this.entry.time) parts.push(formatItemTime(this.entry.time));
		return parts.join(" · ");
	}

	/**
	 * Which kind of row this is, then what it is within that kind:
	 * "💡 Idea · 🍴 Restaurant · 🤔 Maybe", "🧭 Travel · 🚗 Driving",
	 * "🛏️ Accommodation · 🏡 Airbnb".
	 */
	private kindLabel(): string {
		const e = this.entry;
		const bits: string[] = [];
		if (e.source === "idea") {
			bits.push("💡 Idea");
			const cat = PLAN_IDEA_CATEGORIES.find((c) => c.id === e.category);
			if (cat) bits.push(`${cat.emoji} ${cat.label}`);
			const pri = PLAN_PRIORITIES.find((p) => p.id === e.priority);
			if (pri) bits.push(`${pri.emoji} ${pri.label}`);
		} else if (e.source === "accommodation") {
			bits.push("🛏️ Accommodation");
			const stay = ACCOMMODATION_TYPES.find((s) => s.id === e.stay);
			if (stay) bits.push(`${stay.emoji} ${stay.label}`);
		} else {
			bits.push("🧭 Travel");
			const mode = TRAVEL_TYPES.find((t) => t.id === e.travel);
			if (mode) bits.push(`${mode.emoji} ${mode.label}`);
		}
		return bits.join(" · ");
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("someday-view-modal");
		const e = this.entry;

		contentEl.createEl("h2", { text: e.text });
		contentEl.createDiv({
			cls: "someday-view-meta",
			text: this.whenLabel(),
		});

		const kind = this.kindLabel();
		if (kind) {
			contentEl.createDiv({ cls: "someday-view-meta", text: kind });
		}

		// Facts worth their own line, each only when it's actually set.
		const rows: string[] = [];
		if (e.people) rows.push(`👥 ${e.people}`);
		if (e.duration) rows.push(`⏳ ${e.duration}`);
		if (e.nights) rows.push(`🌙 ${nightsSummary(e.date, e.nights)}`);
		const booking = BOOKING_STATES.find((b) => b.id === e.booked);
		if (booking) rows.push(`${booking.emoji} ${booking.label}`);
		if (e.cost !== undefined) rows.push(`💵 ${formatItemCost(e.cost)}`);
		for (const row of rows) {
			contentEl.createDiv({ cls: "someday-view-cost", text: row });
		}

		// Address gets a Map button rather than a bare line — it's the thing
		// you actually want to act on mid-trip.
		if (e.address) {
			const addressRow = contentEl.createDiv({
				cls: "event-link-row reminder-view-linkrow",
			});
			addressRow.createSpan({
				cls: "reminder-view-link",
				text: `📍 ${e.address}`,
			});
			const mapBtn = addressRow.createEl("button", {
				cls: "callander-button event-link-open",
				text: "Map",
				attr: { type: "button" },
			});
			mapBtn.addEventListener("click", () =>
				window.open(
					`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
						e.address as string
					)}`,
					"_blank"
				)
			);
		}

		if (e.notes) {
			contentEl.createDiv({
				cls: "someday-view-notes",
				text: e.notes,
			});
		}

		// Actions
		const actions = contentEl.createDiv({ cls: "someday-view-actions" });

		const edit = actions.createEl("button", { cls: "callander-button" });
		setIcon(edit, "pencil");
		edit.createSpan({ text: "Edit" });
		edit.addEventListener("click", () => {
			this.close();
			this.onEdit();
		});

		const del = actions.createEl("button", {
			cls: "callander-button button-danger",
		});
		setIcon(del, "trash");
		del.createSpan({ text: "Delete" });
		del.addEventListener("click", () => {
			const preview =
				e.text.length > 80 ? e.text.slice(0, 80) + "…" : e.text;
			new ConfirmModal(
				this.app,
				"Delete from plan",
				`Delete "${preview}"?`,
				"Delete",
				async () => {
					await this.onDelete();
					this.close();
				}
			).open();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
