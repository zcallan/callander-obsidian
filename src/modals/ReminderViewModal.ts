import { App, Modal, setIcon } from "obsidian";
import type FriendTracker from "@/main";
import type { Reminder } from "@/types";
import { ReminderModal } from "@/modals/ReminderModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { parseFlexDate, formatFlexDate } from "@/utils/flexdate";

/**
 * A read view of a reminder with Mark-as-done / Edit / Delete — mirrors
 * SomedayViewModal. `onChange` refreshes the dashboard behind it.
 */
export class ReminderViewModal extends Modal {
	constructor(
		app: App,
		private plugin: FriendTracker,
		private reminder: Reminder,
		private onChange: () => void | Promise<void>
	) {
		super(app);
	}

	private formatTime(t: string): string {
		const [h, m] = t.split(":").map(Number);
		if (Number.isNaN(h)) return t;
		const period = h < 12 ? "AM" : "PM";
		const hr = h % 12 === 0 ? 12 : h % 12;
		return `${hr}:${String(m || 0).padStart(2, "0")} ${period}`;
	}

	private whenLabel(): string {
		const parts: string[] = [];
		const f = parseFlexDate(this.reminder.date);
		if (f) parts.push(formatFlexDate(f));
		if (this.reminder.time) parts.push(this.formatTime(this.reminder.time));
		return parts.join(" · ") || "No date";
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("someday-view-modal");
		const r = this.reminder;

		contentEl.createEl("h2", { text: r.name });
		contentEl.createEl("div", {
			cls: "someday-view-meta",
			text: this.whenLabel(),
		});
		if (r.location) {
			contentEl.createEl("div", {
				cls: "someday-view-cost",
				text: `📍 ${r.location}`,
			});
		}

		if (r.link) {
			const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(r.link)
				? r.link
				: `https://${r.link}`;
			const linkRow = contentEl.createEl("div", {
				cls: "event-link-row reminder-view-linkrow",
			});
			linkRow.createSpan({ cls: "reminder-view-link", text: r.link });
			const openBtn = linkRow.createEl("button", {
				cls: "callander-button event-link-open",
				text: "Open",
				attr: { type: "button" },
			});
			openBtn.addEventListener("click", () => window.open(url, "_blank"));
		}

		// Actions
		const actions = contentEl.createEl("div", {
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

		button("check", "Mark as done", async () => {
			await this.plugin.reminderOperations.setStatus(r.id, "done");
			await this.onChange();
			this.close();
		});
		button("pencil", "Edit", () => {
			this.close();
			new ReminderModal(
				this.app,
				this.plugin,
				r,
				this.onChange,
				this.onChange
			).open();
		});
		const del = actions.createEl("button", {
			cls: "callander-button button-danger",
		});
		setIcon(del, "trash");
		del.createSpan({ text: "Delete" });
		del.addEventListener("click", () => {
			new ConfirmModal(
				this.app,
				"Delete reminder",
				`Delete "${r.name}"?`,
				"Delete",
				async () => {
					await this.plugin.reminderOperations.deleteReminder(r.id);
					await this.onChange();
					this.close();
				}
			).open();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
