import { App, Modal, Notice } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type FriendTracker from "@/main";
import type { ContactWithCountdown } from "@/types";
import { createFlexDateInput } from "@/components/FlexDateInput";

/**
 * Log one event onto several friends' timelines at once —
 * "bowling with the basketball crew".
 */
export class GroupEventModal extends FormModal {
	constructor(
		app: App,
		private plugin: FriendTracker,
		private contacts: ContactWithCountdown[]
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Log a shared event" });

		const checked = new Set<string>();
		const checkboxes = new Map<string, HTMLInputElement>();

		// Convenience: tick everyone in a group at once
		const groupNames = this.plugin.contactOperations.getGroupNames(
			this.contacts
		);
		if (groupNames.length > 0) {
			const groupRow = contentEl.createDiv({
				cls: "callander-modal-field",
			});
			groupRow.createEl("label", { text: "Check a whole group" });
			const select = groupRow.createEl("select", { cls: "dropdown" });
			select.createEl("option", { value: "", text: "— pick a group —" });
			groupNames.forEach((g) =>
				select.createEl("option", {
					value: g,
					text: g.charAt(0).toUpperCase() + g.slice(1),
				})
			);
			select.addEventListener("change", () => {
				if (!select.value) return;
				this.contacts.forEach((c) => {
					if (c.groups.includes(select.value)) {
						checked.add(c.file.path);
						const box = checkboxes.get(c.file.path);
						if (box) box.checked = true;
					}
				});
			});
		}

		const listEl = contentEl.createDiv({
			cls: "group-event-friend-list",
		});
		this.contacts.forEach((c) => {
			const row = listEl.createEl("label", {
				cls: "group-event-friend-row",
			});
			const box = row.createEl("input", {
				attr: { type: "checkbox" },
			});
			checkboxes.set(c.file.path, box);
			box.addEventListener("change", () => {
				box.checked
					? checked.add(c.file.path)
					: checked.delete(c.file.path);
			});
			row.createSpan({ text: c.displayName });
		});

		let dateValue = new Date().toISOString().split("T")[0];
		const dateField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		dateField.createEl("label", { text: "When" });
		createFlexDateInput(
			dateField,
			dateValue,
			(v) => {
				dateValue = v;
			},
			{ inputClass: "callander-modal-input", defaultPrecision: "day" }
		);

		const textInput = contentEl.createEl("textarea", {
			attr: { placeholder: "What happened?" },
			cls: "contact-event-text-input",
		});

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		const saveButton = buttons.createEl("button", {
			text: "Log for selected",
			cls: "callander-modal-button mod-cta",
		});
		const handleSave = async () => {
			const text = textInput.value.trim();
			if (!text || !dateValue || checked.size === 0) {
				new Notice("Pick at least one friend and write what happened");
				return;
			}
			const targets = this.contacts.filter((c) =>
				checked.has(c.file.path)
			);
			for (const c of targets) {
				await this.plugin.contactOperations.addEventToFile(
					c.file,
					dateValue,
					text
				);
			}
			new Notice(`Logged for ${targets.length} friend(s)`);
			this.close();
		};
		saveButton.addEventListener("click", () => void handleSave());
	}

	onClose() {
		this.contentEl.empty();
	}
}
