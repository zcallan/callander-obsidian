import { App, Modal, setIcon } from "obsidian";
import type FriendTracker from "@/main";
import type { ContactWithCountdown, FriendEvent } from "@/types";
import { EVENT_TYPES } from "@/constants";
import { EventModal } from "@/modals/EventModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { parseFlexDate, formatFlexDate } from "@/utils/flexdate";
import { splitLeadingEmoji } from "@/components/EventTimeline";

/**
 * A read view of a friend/group event with View person / Edit / Hide /
 * Delete — mirrors ReminderViewModal. Mutates `contact.events` directly (the
 * same array reference the dashboard renders from) so the change shows up
 * immediately, rather than waiting on a metadata-cache re-read after the
 * frontmatter write. `onChange` re-renders the dashboard behind it.
 */
export class EventViewModal extends Modal {
	private descSaveTimer: number | null = null;
	private descDirty = false;
	/** A copy of `event` matching what's actually on disk right now — the
	 * deep-equality target for the next save. `event` itself updates as
	 * soon as you type (so anything reading it, like a freshly-opened Edit
	 * form, sees your latest text); this snapshot only advances once a
	 * write actually lands, which is what the file's own content needs to
	 * match for the lookup in updateEventDescription to succeed. */
	private diskEvent: FriendEvent;

	constructor(
		app: App,
		private plugin: FriendTracker,
		private contact: ContactWithCountdown,
		private event: FriendEvent,
		private onChange: () => void | Promise<void>
	) {
		super(app);
		this.diskEvent = { ...event };
	}

	private whenLabel(): string {
		const parsed = parseFlexDate(this.event.date);
		return parsed ? formatFlexDate(parsed) : String(this.event.date || "");
	}

	/** Debounced write: keeps typing from hitting disk on every keystroke. */
	private scheduleDescriptionSave(value: string) {
		// Update the live object right away — a "Edit" click before the
		// debounce fires should still see this text, not what's on disk yet.
		if (value) this.event.description = value;
		else delete this.event.description;
		this.descDirty = true;
		if (this.descSaveTimer !== null) {
			window.clearTimeout(this.descSaveTimer);
		}
		this.descSaveTimer = window.setTimeout(
			() => void this.flushDescription(),
			600
		);
	}

	/** Write whatever's pending now — called on blur and on close, so a
	 * quick edit-then-dismiss never loses the last few keystrokes. */
	private async flushDescription() {
		if (this.descSaveTimer !== null) {
			window.clearTimeout(this.descSaveTimer);
			this.descSaveTimer = null;
		}
		if (!this.descDirty) return;
		this.descDirty = false;
		const value = this.event.description ?? "";
		await this.plugin.contactOperations.updateEventDescription(
			this.contact.file,
			this.diskEvent,
			value
		);
		// The write succeeded against diskEvent's old shape — advance the
		// snapshot so the *next* save's lookup still matches the file.
		if (value) this.diskEvent.description = value;
		else delete this.diskEvent.description;
		await this.onChange();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("someday-view-modal");
		const event = this.event;
		const lead = splitLeadingEmoji(event.text);
		const type = EVENT_TYPES.find((t) => t.id === event.type);
		const badge = lead ? lead.emoji : type ? type.emoji : "";

		contentEl.createEl("h2", { text: lead ? lead.rest : event.text });
		contentEl.createDiv({
			cls: "someday-view-meta",
			text: `${badge ? badge + " " : ""}${this.whenLabel()}${
				type ? " · " + type.label : ""
			} · ${this.contact.displayName}`,
		});
		if (event.location) {
			contentEl.createDiv({
				cls: "someday-view-cost",
				text: `📍 ${event.location}`,
			});
		}

		if (event.link) {
			const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(event.link)
				? event.link
				: `https://${event.link}`;
			const linkRow = contentEl.createDiv({
				cls: "event-link-row reminder-view-linkrow",
			});
			linkRow.createSpan({ cls: "reminder-view-link", text: event.link });
			const openBtn = linkRow.createEl("button", {
				cls: "callander-button event-link-open",
				text: "Open",
				attr: { type: "button" },
			});
			openBtn.addEventListener("click", () => window.open(url, "_blank"));
		}

		// Description — edits live here, saving itself shortly after you
		// stop typing (not shown on the dashboard row, only in this view).
		const descInput = contentEl.createEl("textarea", {
			cls: "someday-view-notes-input",
			attr: { placeholder: "Description (optional)", rows: "3" },
		});
		descInput.value = event.description ?? "";
		descInput.addEventListener("input", () => {
			this.scheduleDescriptionSave(descInput.value);
		});
		descInput.addEventListener("blur", () => void this.flushDescription());
		// Being the only textarea, it'd otherwise grab the modal's default
		// focus — undo that right after, so opening the modal doesn't pop
		// the keyboard on mobile or steal focus from the actual buttons.
		window.setTimeout(() => descInput.blur(), 0);

		// Actions
		const actions = contentEl.createDiv({
			cls: "someday-view-actions",
		});
		const button = (icon: string, label: string, onClick: () => void) => {
			const btn = actions.createEl("button", {
				cls: "callander-button",
			});
			setIcon(btn, icon);
			btn.createSpan({ text: label });
			btn.addEventListener("click", onClick);
		};

		button("user", "View person", () => {
			this.close();
			void this.plugin.openContactPage(this.contact.file);
		});

		button("pencil", "Edit", () => void this.handleEdit(event));

		const hide = actions.createEl("button", {
			cls: "callander-button button-icon",
			attr: { "aria-label": "Hide from Upcoming" },
		});
		setIcon(hide, "eye-off");
		hide.addEventListener("click", () => void this.handleHide(event));

		const del = actions.createEl("button", {
			cls: "callander-button button-icon button-danger",
			attr: { "aria-label": "Delete" },
		});
		setIcon(del, "trash");
		del.addEventListener("click", () => void this.handleDelete(event));
	}

	/**
	 * Every action below that touches the event's own frontmatter row
	 * flushes any pending description save first — otherwise a click right
	 * after typing (before the 600ms debounce fires) would match against
	 * `event` as the UI now shows it, not what's still on disk, and the
	 * deep-equality lookup in ContactOperations would silently find nothing.
	 * `diskEvent` is the flushed, disk-accurate shape to match against.
	 */
	private async handleEdit(event: FriendEvent) {
		await this.flushDescription();
		this.close();
		new EventModal(
			this.app,
			event,
			async (date, text, eventType, location, link, description) => {
				await this.plugin.contactOperations.updateEventInFile(
					this.contact.file,
					this.diskEvent,
					{
						date,
						text,
						type: eventType,
						location,
						link,
						description,
					}
				);
				// Same object reference the dashboard's contact list holds —
				// mutate it in place so the change is visible immediately.
				event.date = date;
				event.text = text;
				event.type = eventType;
				if (location) event.location = location;
				else delete event.location;
				if (link) event.link = link;
				else delete event.link;
				if (description) event.description = description;
				else delete event.description;
				await this.onChange();
			},
			async () => {
				await this.plugin.contactOperations.deleteEventFromFile(
					this.contact.file,
					this.diskEvent
				);
				this.removeFromContact();
				await this.onChange();
			}
		).open();
	}

	private async handleHide(event: FriendEvent) {
		await this.flushDescription();
		const preview =
			event.text.length > 80
				? event.text.slice(0, 80) + "…"
				: event.text;
		new ConfirmModal(
			this.app,
			"Hide from Upcoming",
			`Hide "${preview}" from the dashboard's Upcoming section? It'll still show on ${this.contact.displayName}'s timeline.`,
			"Hide",
			async () => {
				await this.plugin.contactOperations.hideEventFromUpcoming(
					this.contact.file,
					this.diskEvent
				);
				event.hiddenFromUpcoming = true;
				await this.onChange();
				this.close();
			}
		).open();
	}

	private async handleDelete(event: FriendEvent) {
		await this.flushDescription();
		const preview =
			event.text.length > 80
				? event.text.slice(0, 80) + "…"
				: event.text;
		new ConfirmModal(
			this.app,
			"Delete event",
			`Delete "${preview}" from the timeline?`,
			"Delete",
			async () => {
				await this.plugin.contactOperations.deleteEventFromFile(
					this.contact.file,
					this.diskEvent
				);
				this.removeFromContact();
				await this.onChange();
				this.close();
			}
		).open();
	}

	/** Drop the event from the in-memory contact the dashboard is rendering from */
	private removeFromContact() {
		const index = this.contact.events.indexOf(this.event);
		if (index !== -1) this.contact.events.splice(index, 1);
	}

	onClose() {
		void this.flushDescription();
		this.contentEl.empty();
	}
}
