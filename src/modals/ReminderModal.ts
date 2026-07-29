import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { createFlexDateInput } from "@/components/FlexDateInput";
import type FriendTracker from "@/main";
import type { Reminder } from "@/types";
import type { ReminderFields } from "@/services/ReminderOperations";

/** Create or edit a reminder — a name, and optional date/time/location/link. */
export class ReminderModal extends FormModal {
	constructor(
		app: App,
		private plugin: FriendTracker,
		private existing: Reminder | null,
		private onSaved: () => void | Promise<void>,
		private onDeleted?: () => void | Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.existing ? "Edit reminder" : "New reminder",
		});

		// ---- Name ----
		const nameField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		nameField.createEl("label", { text: "What is it?" });
		const nameInput = nameField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text", placeholder: "e.g. Laura's birthday" },
		});
		nameInput.value = this.existing?.name ?? "";

		// ---- Date ----
		let dateValue = this.existing?.date ?? "";
		const dateField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		dateField.createEl("label", { text: "Date (optional)" });
		createFlexDateInput(
			dateField,
			dateValue,
			(v) => {
				dateValue = v;
			},
			{
				inputClass: "callander-modal-input",
				defaultPrecision: "day",
				allowFuture: true,
			}
		);

		// ---- Time ----
		const timeField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		timeField.createEl("label", { text: "Time (optional)" });
		const timeInput = timeField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "time" },
		});
		timeInput.value = this.existing?.time ?? "";

		// ---- Location ----
		const locField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		locField.createEl("label", { text: "Location (optional)" });
		const locInput = locField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text", placeholder: "e.g. The Fox & Hounds" },
		});
		locInput.value = this.existing?.location ?? "";

		// ---- Link ----
		const linkField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		linkField.createEl("label", { text: "Link (optional)" });
		const linkRow = linkField.createDiv({ cls: "event-link-row" });
		const linkInput = linkRow.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text", placeholder: "https://…" },
		});
		linkInput.value = this.existing?.link ?? "";
		const openButton = linkRow.createEl("button", {
			cls: "callander-button event-link-open",
			text: "Open",
			attr: { type: "button" },
		});
		openButton.addEventListener("click", () => {
			const raw = linkInput.value.trim();
			if (!raw) return;
			const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
				? raw
				: `https://${raw}`;
			window.open(url, "_blank");
		});

		// ---- Buttons ----
		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		if (this.existing) {
			const deleteBtn = buttons.createEl("button", {
				text: "Delete",
				cls: "callander-modal-button callander-modal-button-danger",
			});
			deleteBtn.addEventListener("click", () => {
				const existing = this.existing!;
				new ConfirmModal(
					this.app,
					"Delete reminder",
					`Delete "${existing.name}"?`,
					"Delete",
					async () => {
						await this.plugin.reminderOperations.deleteReminder(
							existing.id
						);
						await this.onDeleted?.();
						this.close();
					}
				).open();
			});
		}
		const saveBtn = buttons.createEl("button", {
			text: "Save",
			cls: "callander-modal-button mod-cta",
		});

		const submit = async () => {
			const name = nameInput.value.trim();
			if (!name) {
				nameInput.focus();
				return;
			}
			const fields: ReminderFields = {
				name,
				date: dateValue,
				time: timeInput.value.trim(),
				location: locInput.value.trim(),
				link: linkInput.value.trim(),
			};
			const ops = this.plugin.reminderOperations;
			if (this.existing) {
				await ops.updateReminder(this.existing.id, fields);
			} else {
				await ops.addReminder(fields);
			}
			await this.onSaved();
			this.close();
		};
		saveBtn.addEventListener("click", () => void submit());
		nameInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				void submit();
			}
		});
		window.setTimeout(() => nameInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
