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
	shortenPeopleList,
} from "@/utils/planFormat";

/**
 * A read view of one plan-timeline row — whatever it happens to be: an idea,
 * a travel leg or a stay — with an auto-saving notes field, Edit and Delete.
 * Routing back to the real item is the caller's job (it owns source + index).
 */
export class PlanTimelineViewModal extends Modal {
	private notesSaveTimer: number | null = null;
	private notesDirty = false;
	private pendingNotes: string;

	constructor(
		app: App,
		private entry: PlanTimelineEntry,
		private onEdit: () => void,
		private onDelete: () => Promise<void>,
		private onSaveNotes: (notes: string) => Promise<void>,
		/** Everyone on the plan — shortens people to first names, using the
		 * full roster so a shared first name disambiguates the same way here
		 * as it does on the timeline row. */
		private roster: string[] = [],
		/** Your own name from settings, rendered as "Me". */
		private yourName = ""
	) {
		super(app);
		this.pendingNotes = entry.notes ?? "";
	}

	/** What kind of row this is — the small muted label above the name. */
	private sourceLabel(): string {
		switch (this.entry.source) {
			case "idea":
				return "Idea";
			case "travel":
				return "Travel";
			default:
				return "Accommodation";
		}
	}

	/**
	 * When it happens. A stay spans nights rather than sitting at a clock
	 * time, so it reads "Thursday 30 Jul • 3 nights (Thu-Sun)"; everything
	 * else takes its time when it has one.
	 */
	private whenLabel(): string {
		const e = this.entry;
		const parts = [formatTimelineDay(e.date)];
		if (e.nights) {
			parts.push(nightsSummary(e.date, e.nights));
		} else if (e.time) {
			parts.push(formatItemTime(e.time));
		}
		return parts.join(" • ");
	}

	/**
	 * The specific type within this kind, with its own emoji: a stay's
	 * "🏡 Airbnb", a leg's "🚗 Driving", an idea's "🍴 Restaurant · 🤔 Maybe".
	 */
	private typeLabel(): string | null {
		const e = this.entry;
		if (e.source === "idea") {
			const bits: string[] = [];
			const cat = PLAN_IDEA_CATEGORIES.find((c) => c.id === e.category);
			if (cat) bits.push(`${cat.emoji} ${cat.label}`);
			const pri = PLAN_PRIORITIES.find((p) => p.id === e.priority);
			if (pri) bits.push(`${pri.emoji} ${pri.label}`);
			return bits.length > 0 ? bits.join(" · ") : null;
		}
		if (e.source === "accommodation") {
			const stay = ACCOMMODATION_TYPES.find((s) => s.id === e.stay);
			return stay ? `${stay.emoji} ${stay.label}` : null;
		}
		const mode = TRAVEL_TYPES.find((t) => t.id === e.travel);
		return mode ? `${mode.emoji} ${mode.label}` : null;
	}

	/** Debounced write: keeps typing from hitting disk on every keystroke. */
	private scheduleNotesSave(value: string) {
		this.pendingNotes = value;
		this.entry.notes = value || undefined;
		this.notesDirty = true;
		if (this.notesSaveTimer !== null) {
			window.clearTimeout(this.notesSaveTimer);
		}
		this.notesSaveTimer = window.setTimeout(
			() => void this.flushNotes(),
			600
		);
	}

	/** Write whatever's pending now — called on blur, before Edit/Delete,
	 * and on close, so a quick edit-then-dismiss never loses keystrokes. */
	private async flushNotes() {
		if (this.notesSaveTimer !== null) {
			window.clearTimeout(this.notesSaveTimer);
			this.notesSaveTimer = null;
		}
		if (!this.notesDirty) return;
		this.notesDirty = false;
		await this.onSaveNotes(this.pendingNotes);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("someday-view-modal");
		const e = this.entry;

		// Kind first, small and muted — it frames everything below it.
		contentEl.createDiv({
			cls: "plan-view-kind",
			text: this.sourceLabel(),
		});

		contentEl.createEl("h2", { text: e.text });

		contentEl.createDiv({
			cls: "someday-view-meta",
			text: this.whenLabel(),
		});

		const type = this.typeLabel();
		if (type) {
			contentEl.createDiv({ cls: "someday-view-meta", text: type });
		}

		// Booking status, but only when there's something to act on —
		// "Not needed" is the absence of a task, so it stays silent.
		const booking = BOOKING_STATES.find((b) => b.id === e.booked);
		if (booking && booking.id !== "none") {
			contentEl.createDiv({
				cls: "someday-view-meta",
				text: `${booking.emoji} ${booking.label}`,
			});
		}

		// Where it is, with a Map button — the thing you actually want to act
		// on mid-trip. A stay calls it an address, an idea calls it a
		// location; they're never both set, so one row covers either.
		const place = e.address ?? e.location;
		if (place) {
			const placeRow = contentEl.createDiv({
				cls: "event-link-row reminder-view-linkrow",
			});
			placeRow.createSpan({
				cls: "reminder-view-link",
				text: `📍 ${place}`,
			});
			const mapBtn = placeRow.createEl("button", {
				cls: "callander-button event-link-open",
				text: "Map",
				attr: { type: "button" },
			});
			mapBtn.addEventListener("click", () =>
				window.open(
					`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
						place
					)}`,
					"_blank"
				)
			);
		}

		// The remaining facts, each only when set. These have no home in the
		// layout above but would be lost if dropped entirely.
		const rows: string[] = [];
		if (e.people) {
			rows.push(
				`👥 ${shortenPeopleList(e.people, this.roster, this.yourName)}`
			);
		}
		if (e.duration) rows.push(`⏳ ${e.duration}`);
		if (e.cost !== undefined) rows.push(`💵 ${formatItemCost(e.cost)}`);
		for (const row of rows) {
			contentEl.createDiv({ cls: "someday-view-meta", text: row });
		}

		// Description — saves itself shortly after you stop typing.
		const notesInput = contentEl.createEl("textarea", {
			cls: "someday-view-notes-input",
			attr: { placeholder: "Notes (optional)", rows: "3" },
		});
		notesInput.value = this.pendingNotes;
		notesInput.addEventListener("input", () => {
			this.scheduleNotesSave(notesInput.value);
		});
		notesInput.addEventListener("blur", () => void this.flushNotes());
		// Being the only textarea, it'd otherwise grab the modal's default
		// focus — undo that right after, so opening the modal doesn't pop
		// the keyboard on mobile or steal focus from the actual buttons.
		window.setTimeout(() => notesInput.blur(), 0);

		contentEl.createDiv({ cls: "someday-view-divider" });

		const actions = contentEl.createDiv({ cls: "someday-view-actions" });

		const edit = actions.createEl("button", { cls: "callander-button" });
		setIcon(edit, "pencil");
		edit.createSpan({ text: "Edit" });
		edit.addEventListener("click", () => void this.handleEdit());

		const del = actions.createEl("button", {
			cls: "callander-button button-icon button-danger",
			attr: { "aria-label": "Delete" },
		});
		setIcon(del, "trash");
		del.addEventListener("click", () => void this.handleDelete());
	}

	/** Flush first: the edit form reads the item straight off frontmatter,
	 * so a pending note has to land before it opens or it'd read stale. */
	private async handleEdit() {
		await this.flushNotes();
		this.close();
		this.onEdit();
	}

	private async handleDelete() {
		await this.flushNotes();
		const e = this.entry;
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
	}

	onClose() {
		void this.flushNotes();
		this.contentEl.empty();
	}
}
