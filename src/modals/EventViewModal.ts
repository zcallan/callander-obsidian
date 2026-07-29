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
	constructor(
		app: App,
		private plugin: FriendTracker,
		private contact: ContactWithCountdown,
		private event: FriendEvent,
		private onChange: () => void | Promise<void>
	) {
		super(app);
	}

	private whenLabel(): string {
		const parsed = parseFlexDate(this.event.date);
		return parsed ? formatFlexDate(parsed) : String(this.event.date || "");
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

		button("pencil", "Edit", () => {
			this.close();
			new EventModal(
				this.app,
				event,
				async (date, text, eventType, location, link) => {
					await this.plugin.contactOperations.updateEventInFile(
						this.contact.file,
						event,
						{ date, text, type: eventType, location, link }
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
					await this.onChange();
				},
				async () => {
					await this.plugin.contactOperations.deleteEventFromFile(
						this.contact.file,
						event
					);
					this.removeFromContact();
					await this.onChange();
				}
			).open();
		});

		const hide = actions.createEl("button", {
			cls: "callander-button button-icon",
			attr: { "aria-label": "Hide from Upcoming" },
		});
		setIcon(hide, "eye-off");
		hide.addEventListener("click", () => {
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
						event
					);
					event.hiddenFromUpcoming = true;
					await this.onChange();
					this.close();
				}
			).open();
		});

		const del = actions.createEl("button", {
			cls: "callander-button button-icon button-danger",
			attr: { "aria-label": "Delete" },
		});
		setIcon(del, "trash");
		del.addEventListener("click", () => {
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
						event
					);
					this.removeFromContact();
					await this.onChange();
					this.close();
				}
			).open();
		});
	}

	/** Drop the event from the in-memory contact the dashboard is rendering from */
	private removeFromContact() {
		const index = this.contact.events.indexOf(this.event);
		if (index !== -1) this.contact.events.splice(index, 1);
	}

	onClose() {
		this.contentEl.empty();
	}
}
