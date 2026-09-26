import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import type FriendTracker from "@/main";
import { closeColorPopover } from "@/components/colorPicker";
import { appendColorSwatchRow } from "@/components/colorSwatchRow";
import {
	CATEGORY_PALETTE,
	defaultCategoryColor,
	ensureGroupColors,
} from "@/utils/categoryColor";

/**
 * Rename, recolour or remove an event category — a vault-wide vocabulary
 * (see EventOperations.renameCategory/deleteCategory), not a field on one
 * event, so a change here reaches every event carrying it.
 *
 * The colour is read from and written to the exact same
 * `calendarGroupColors.categories` the settings drawer's own "Category
 * colors" modal edits — so a change either place shows up in the other,
 * and on both calendars, without any syncing beyond writing to one place.
 */
export class EventCategoryEditModal extends FormModal {
	constructor(
		app: App,
		private plugin: FriendTracker,
		private categoryName: string,
		/** Every category this event's picker currently knows, for the
		 * rename's collision check. */
		private allCategories: readonly string[],
		/** Told once something changed, so the picker behind this can
		 * update its own selection and refresh its chips. */
		private onDone: (
			result: { deleted: true } | { deleted: false; name: string }
		) => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Edit category" });

		const nameField = contentEl.createDiv({ cls: "callander-modal-field" });
		nameField.createEl("label", { text: "Name" });
		const nameInput = nameField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text" },
		});
		nameInput.value = this.categoryName;

		const colorField = contentEl.createDiv({ cls: "callander-modal-field" });
		colorField.createEl("label", { text: "Color" });
		const colors = ensureGroupColors(this.plugin.settings);
		const key = this.categoryName.trim().toLowerCase();
		const defaultColor = defaultCategoryColor(
			this.categoryName,
			this.allCategories
		);
		const swatches = appendColorSwatchRow(colorField, {
			palette: CATEGORY_PALETTE,
			initial: colors.categories[key] ?? "",
			customFallback: defaultColor,
			resetTo: defaultColor,
			onChange: () => {},
		});

		const buttons = contentEl.createDiv({ cls: "callander-modal-buttons" });

		const deleteButton = buttons.createEl("button", {
			text: "Delete",
			cls: "callander-modal-button callander-modal-button-danger",
		});
		deleteButton.addEventListener("click", () => {
			new ConfirmModal(
				this.app,
				"Delete category",
				`Remove "${this.categoryName}"? Your events will not be deleted — only the category will be removed from them.`,
				"Delete",
				async () => {
					await this.plugin.eventOperations.deleteCategory(
						this.categoryName
					);
					delete colors.categories[this.categoryName.toLowerCase()];
					await this.plugin.saveSettings();
					this.onDone({ deleted: true });
					this.close();
				}
			).open();
		});

		const saveButton = buttons.createEl("button", {
			text: "Save",
			cls: "callander-modal-button mod-cta",
		});
		const handleSave = async () => {
			const name = nameInput.value.trim();
			if (!name) return;
			const renamed = name.toLowerCase() !== this.categoryName.toLowerCase();
			if (renamed) {
				await this.plugin.eventOperations.renameCategory(
					this.categoryName,
					name
				);
				delete colors.categories[this.categoryName.toLowerCase()];
			}
			const picked = swatches.getColor();
			const newKey = name.toLowerCase();
			if (picked) colors.categories[newKey] = picked;
			else delete colors.categories[newKey];
			await this.plugin.saveSettings();
			this.onDone({ deleted: false, name });
			this.close();
		};
		saveButton.addEventListener("click", () => void handleSave());
		this.blurInitialFocus();
	}

	onClose() {
		closeColorPopover();
		this.contentEl.empty();
	}
}
