import { App, Modal, Notice, setIcon } from "obsidian";
import { reportFailure } from "@/components/guardedAction";
import type FriendTracker from "@/main";
import type { ContactWithCountdown, EventInfo } from "@/types";
import { EventModal } from "@/modals/EventModal";
import { confirmThenClose } from "@/modals/ConfirmModal";
import { parseFlexDate, formatFlexDate } from "@/utils/flexdate";
import { splitLeadingEmoji } from "@/utils/emoji";
import { shortenMemberNames, shortNameOverrides } from "@/utils/nameFormat";
import { AUTOSAVE_DELAY_MS, EVENT_TYPES } from "@/constants";
import { buildEventShareText, buildGoogleCalendarUrl } from "@/utils/eventShare";
import { eventTimeOrigin, formatEventTime } from "@/utils/eventRow";
import { displayZone } from "@/utils/timezone";
import { normalizeUrl } from "@/utils/url";
import { closeColorPopover, openColorPopover } from "@/components/colorPicker";
import { categoryColor, categoryColors } from "@/utils/categoryColor";
import { linkpathOf } from "@/utils/linkField";

/** A colour is saved this long after the picker stops moving. */
const COLOR_SAVE_DELAY_MS = 250;

/**
 * A read view of an event with Edit / Done / Hide / Delete — mirrors
 * SomedayViewModal. `onChange` re-renders whatever opened it.
 */
export class EventViewModal extends Modal {
	private descSaveTimer: number | null = null;
	private descDirty = false;
	private description: string;
	/** Fetched once in onOpen(), for resolving people links to names. */
	private contacts: ContactWithCountdown[] = [];

	constructor(
		app: App,
		private plugin: FriendTracker,
		private event: EventInfo,
		/** Anything to do after a change, beyond the write itself; pages
		 * hear the write on their own. */
		private onChange: () => void | Promise<void> = () => undefined
	) {
		super(app);
		this.description = event.description;
	}
	/**
	 * The event's categories, as pills — each with a dot in the colour the
	 * Calendar page gives that category, hand-picked or from the palette,
	 * so the two read as the same thing.
	 */
	private appendCategories(parent: HTMLElement) {
		const palette = categoryColors(
			this.plugin.eventOperations.getEventCategories()
		);
		const picked = this.plugin.settings.calendarGroupColors?.categories ?? {};
		const row = parent.createDiv({ cls: "event-view-categories" });
		for (const name of this.event.categories) {
			const key = name.toLowerCase();
			const pill = row.createSpan({ cls: "event-view-category" });
			const dot = pill.createSpan({ cls: "event-view-category-dot" });
			dot.style.background =
				picked[key] || palette.get(key) || categoryColor(name);
			pill.createSpan({ text: name });
		}
	}

	/** Saves a beat after the last change — dragging across the picker
	 * fires a colour per pixel, and each write redraws the calendar. */
	private colorTimer: number | null = null;
	private pendingColor: string | null = null;

	/**
	 * The event's own calendar colour: a circle showing what it's drawn in
	 * on the Calendar page, which opens a picker to change it for this one
	 * event. Saved to its frontmatter as `color`; Reset takes that away,
	 * and it goes back to following its type (or "Color by group").
	 */
	private appendColorButton(row: HTMLElement) {
		const e = this.event;
		const fallback = this.plugin.calendarColorFor({ ...e, color: "" });
		let custom = e.color;
		const btn = row.createEl("button", {
			cls: "callander-button button-icon event-color-button",
			attr: { type: "button", "aria-label": "Color on the calendar" },
		});
		const dot = btn.createSpan({ cls: "event-color-dot" });
		const paint = () => {
			dot.style.background = custom || fallback;
		};
		paint();

		let popover: { close: () => void } | null = null;
		const change = (value: string) => {
			custom = value;
			paint();
			this.queueColor(value);
		};
		btn.addEventListener("click", () => {
			if (popover) {
				popover.close();
				return;
			}
			popover = openColorPopover(btn, {
				value: custom,
				fallback,
				withHex: true,
				onChange: change,
				onReset: () => change(""),
				onClose: () => {
					popover = null;
				},
			});
		});
	}

	private queueColor(value: string) {
		this.pendingColor = value;
		if (this.colorTimer !== null) window.clearTimeout(this.colorTimer);
		this.colorTimer = window.setTimeout(
			() => void this.flushColor(),
			COLOR_SAVE_DELAY_MS
		);
	}

	private async flushColor() {
		if (this.colorTimer !== null) window.clearTimeout(this.colorTimer);
		this.colorTimer = null;
		const value = this.pendingColor;
		if (value === null) return;
		this.pendingColor = null;
		try {
			await this.plugin.eventOperations.setColor(this.event.file, value);
		} catch (error) {
			this.pendingColor ??= value; // unless a newer pick replaced it
			reportFailure("Couldn't save the colour", error);
		}
	}


	private whenLabel(): string {
		const parts: string[] = [];
		const f = parseFlexDate(this.event.date);
		if (f) parts.push(formatFlexDate(f));
		// Spelled out here: this line is the event's own answer to "when?",
		// where a bare "TBD" beside a date reads as though the date were
		// the uncertain part.
		if (this.event.time) {
			parts.push(
				formatEventTime(this.event.time, {
					long: true,
					// The event's own page is where you come to check what a
					// converted time actually says, so the original always
					// rides with it here.
					origin: eventTimeOrigin(
						this.event,
						displayZone(this.plugin.settings.displayTimezone)
					),
				})
			);
		}
		return parts.join(" · ") || "No date";
	}

	/** People links resolved to display names, shortened/disambiguated the
	 * same way a plan's members are. Dead links fall back to their text. */
	private peopleNames(): string[] {
		const names = this.event.people.map((raw) => {
			const linktext = linkpathOf(raw);
			const dest = this.app.metadataCache.getFirstLinkpathDest(
				linktext,
				this.event.file.path
			);
			const match = dest
				? this.contacts.find((c) => c.file.path === dest.path)
				: undefined;
			return match?.displayName ?? linktext;
		});
		return shortenMemberNames(names, shortNameOverrides(this.contacts));
	}

	/** Done only means something for tasks and undated events — everything
	 * else is implicitly done once its date passes. */
	private hasDoneState(): boolean {
		return this.event.type === "task" || !this.event.date;
	}

	/** Debounced write: keeps typing from hitting disk on every keystroke. */
	private scheduleDescriptionSave(value: string) {
		this.description = value;
		this.descDirty = true;
		if (this.descSaveTimer !== null) {
			window.clearTimeout(this.descSaveTimer);
		}
		this.descSaveTimer = window.setTimeout(
			() => void this.flushDescription(),
			AUTOSAVE_DELAY_MS
		);
	}

	/** Write whatever's pending now — called on blur and on close, so a
	 * quick edit-then-dismiss never loses the last few keystrokes. False if
	 * the write failed, which has been reported already. */
	private async flushDescription(): Promise<boolean> {
		if (this.descSaveTimer !== null) {
			window.clearTimeout(this.descSaveTimer);
			this.descSaveTimer = null;
		}
		if (!this.descDirty) return true;
		this.descDirty = false;
		try {
			await this.plugin.eventOperations.setDescription(
				this.event.file,
				this.description.trim()
			);
		} catch (error) {
			this.descDirty = true; // still unsaved, so closing tries again
			reportFailure("Couldn't save the description", error);
			return false;
		}
		await this.onChange();
		return true;
	}

	async onOpen() {
		this.contacts = await this.plugin.contactOperations.getContacts();
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("someday-view-modal");
		const e = this.event;

		// Type first, small and muted, above the name — same treatment as
		// a plan timeline row's kind (Idea/Travel/Accommodation). The type
		// still leads the title as an emoji too, unless the name brings
		// its own; between the two, showing the label a third time in the
		// meta line below would just repeat it.
		const type = EVENT_TYPES.find((t) => t.id === e.type);
		if (type) {
			contentEl.createDiv({ cls: "view-kind", text: type.label });
		}
		const title =
			type && !splitLeadingEmoji(e.name)
				? `${type.emoji} ${e.name}`
				: e.name;
		contentEl.createEl("h2", { text: title });
		contentEl.createDiv({
			cls: "someday-view-meta",
			text: this.whenLabel(),
		});
		if (e.location) {
			contentEl.createDiv({
				cls: "someday-view-cost",
				text: `📍 ${e.location}`,
			});
		}
		if (e.people.length > 0) {
			contentEl.createDiv({
				cls: "someday-view-cost",
				text: `👥 ${this.peopleNames().join(", ")}`,
			});
		}
		if (e.categories.length > 0) this.appendCategories(contentEl);
		if (e.variant === "timeline") {
			contentEl.createDiv({
				cls: "someday-view-cost",
				text: "🙈 Hidden from the dashboard and Events page",
			});
		}

		if (e.link) {
			const url = normalizeUrl(e.link);
			const linkRow = contentEl.createDiv({
				cls: "event-link-row reminder-view-linkrow",
			});
			linkRow.createSpan({ cls: "reminder-view-link", text: e.link });
			const openBtn = linkRow.createEl("button", {
				cls: "callander-button event-link-open",
				text: "Open",
				attr: { type: "button" },
			});
			openBtn.addEventListener("click", () => window.open(url, "_blank"));
		}

		// Called off. Sits last of the status lines, right above the notes,
		// since it qualifies everything above it.
		if (e.status === "cancelled") {
			contentEl.createDiv({
				cls: "someday-view-cost event-cancelled-note",
				text: "❌ Cancelled",
			});
		}

		// Notes — edits live here, saving itself shortly after you stop
		// typing (not shown on the dashboard row, only in this view).
		const descInput = contentEl.createEl("textarea", {
			cls: "someday-view-notes-input",
			attr: { placeholder: "Notes (optional)", rows: "3" },
		});
		descInput.value = this.description;
		descInput.addEventListener("input", () => {
			this.scheduleDescriptionSave(descInput.value);
		});
		descInput.addEventListener("blur", () => void this.flushDescription());
		// Being the only textarea, it'd otherwise grab the modal's default
		// focus — undo that right after, so opening the modal doesn't pop
		// the keyboard on mobile or steal focus from the actual buttons.
		window.setTimeout(() => descInput.blur(), 0);

		// Actions — housekeeping (edit the note, hide it, delete it) above
		// a divider, then what moves it forward, mirroring SomedayViewModal.
		const button = (
			row: HTMLElement,
			icon: string,
			label: string,
			onClick: () => void | Promise<void>,
			opts: { iconOnly?: boolean; danger?: boolean } = {}
		) => {
			const btn = row.createEl("button", {
				cls: [
					"callander-button",
					opts.iconOnly && "button-icon",
					opts.danger && "button-danger",
				]
					.filter(Boolean)
					.join(" "),
				attr: opts.iconOnly ? { "aria-label": label } : {},
			});
			setIcon(btn, icon);
			if (!opts.iconOnly) btn.createSpan({ text: label });
			btn.addEventListener("click", () => void onClick());
			return btn;
		};

		const editRow = contentEl.createDiv({ cls: "someday-view-actions" });
		button(editRow, "pencil", "Edit details", async () => {
			if (!(await this.flushDescription())) return;
			this.close();
			new EventModal(this.app, this.plugin, e, this.onChange).open();
		});

		// Called off, but kept. Undoable, so no confirmation — unlike Delete
		// beside it, nothing is lost by pressing this.
		const isCancelled = e.status === "cancelled";
		button(
			editRow,
			isCancelled ? "rotate-ccw" : "circle-slash",
			isCancelled ? "Restore" : "Cancel",
			async () => {
				if (!(await this.flushDescription())) return;
				await this.plugin.eventOperations.setStatus(
					e.file,
					isCancelled ? "open" : "cancelled"
				);
				new Notice(
					isCancelled
						? "Restored"
						: "Cancelled — still on the Events page"
				);
				await this.onChange();
				this.close();
			}
		);

		this.appendColorButton(editRow);

		button(editRow, "copy", "Copy", async () => {
			// this.description rather than e.description: whatever's on
			// screen right now, including an edit not yet flushed to disk.
			await navigator.clipboard.writeText(
				buildEventShareText({
					name: e.name,
					type: e.type,
					date: e.date,
					time: e.time,
					location: e.location,
					description: this.description,
					link: e.link,
				})
			);
			new Notice("📋 Copied");
		}, { iconOnly: true });

		// The same switch as the modal's tick box, for an event already
		// saved: hidden keeps it to the timelines of whoever's on it.
		//
		// Only offered when there IS such a timeline. Hiding an event with
		// nobody on it would leave it nowhere at all, so the dashboard and
		// the Events page are the only places it can live. Un-hiding is
		// always offered, so nothing can get stuck out of sight.
		const isTimeline = e.variant === "timeline";
		if (isTimeline || e.people.length > 0) {
			button(
				editRow,
				isTimeline ? "eye" : "eye-off",
				isTimeline ? "Show on dashboard" : "Hide from dashboard",
				async () => {
					if (!(await this.flushDescription())) return;
					await this.plugin.eventOperations.setVariant(
						e.file,
						isTimeline ? "reminder" : "timeline"
					);
					new Notice(
						isTimeline
							? "Shown on the dashboard and Events page again"
							: "Hidden — timelines still show it"
					);
					await this.onChange();
					this.close();
				},
				{ iconOnly: true }
			);
		}

		button(
			editRow,
			"trash",
			"Delete",
			() => {
				confirmThenClose(this, {
					title: "Delete event",
					message: `Delete "${e.name}"?`,
					onConfirm: async () => {
						this.descDirty = false; // nothing left to save to
						await this.plugin.eventOperations.deleteEvent(e.file);
						await this.onChange();
					},
				});
			},
			{ iconOnly: true, danger: true }
		);

		contentEl.createDiv({ cls: "someday-view-divider" });

		const progressRow = contentEl.createDiv({
			cls: "someday-view-actions",
		});

		// Google's own prefilled-event link rather than an .ics file — one
		// tap lands directly on Google Calendar's "Save event" screen, with
		// no import step and no dependence on how the OS happens to route a
		// calendar file today. Only offered when there's a real day to put
		// it on — a month- or year-only date has nowhere sensible to send
		// someone. this.description, not e.description: whatever's on
		// screen right now, same as Copy above.
		const calendarUrl = buildGoogleCalendarUrl(
			{
				name: e.name,
				type: e.type,
				date: e.date,
				time: e.time,
				duration: e.duration,
				location: e.location,
				description: this.description,
				link: e.link,
			},
			// The same shortened names the 👥 line above shows, so the
			// calendar entry and the modal agree on what to call everyone.
			e.people.length > 0 ? this.peopleNames() : []
		);
		if (calendarUrl) {
			button(progressRow, "calendar-clock", "Add to calendar", () => {
				window.open(calendarUrl, "_blank");
			});
		}

		if (this.hasDoneState()) {
			const isDone = e.status === "done";
			button(
				progressRow,
				isDone ? "rotate-ccw" : "check",
				isDone ? "Reopen" : "Done",
				async () => {
					if (!(await this.flushDescription())) return;
					await this.plugin.eventOperations.setStatus(
						e.file,
						isDone ? "open" : "done"
					);
					await this.onChange();
					this.close();
				}
			);
		}

		// The first linked person's page, one tap away.
		const firstPerson = this.plugin.eventOperations.peoplePaths(e)[0];
		if (firstPerson) {
			button(progressRow, "user", "View person", () => {
				const file = this.app.vault.getFileByPath(firstPerson);
				if (!file) return;
				this.close();
				void this.plugin.openContactPage(file);
			});
		}

		// The event stays as it is — a plan grows around it rather than
		// replacing it, and it lands on that plan's timeline as the thing
		// already booked. Whatever's in the description box right now goes
		// with it, same as Copy and Add to calendar above.
		button(progressRow, "map", "Make plan", async () => {
			// Awaited, like Done above: the description's debounce may still
			// be pending, and the event should be written before its plan
			// starts existing alongside it.
			if (!(await this.flushDescription())) return;
			this.close();
			this.plugin.convertEventToPlan(
				{ ...e, description: this.description },
				this.peopleNames()
			);
		});
	}

	onClose() {
		closeColorPopover();
		void this.flushColor();
		void this.flushDescription();
		this.contentEl.empty();
	}
}
