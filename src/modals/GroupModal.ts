import { App, Notice } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type FriendTracker from "@/main";
import type { GroupInfo } from "@/types";
import { GROUP_COLORS } from "@/constants";
import { closeColorPopover } from "@/components/colorPicker";
import { appendColorSwatchRow } from "@/components/colorSwatchRow";

/**
 * Create or manage a group: name, color dot, delete. Deliberately tiny.
 */
export class GroupModal extends FormModal {
	private deleteArmed = false;

	constructor(
		app: App,
		private plugin: FriendTracker,
		private existing: GroupInfo | null,
		/** The saved group's name, lowercased — so a caller creating one
		 * inline (no group list of its own to refresh from) knows which
		 * one to select. Not given a name on delete. */
		private onDone: (name?: string) => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		const ops = this.plugin.contactOperations;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.existing
				? `Edit group: ${ops.labelOf(this.existing)}`
				: "New group",
		});

		const nameField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		nameField.createEl("label", { text: "Name" });
		const nameInput = nameField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text", placeholder: "e.g. Basketball, Run Club, Book Club" },
		});
		if (this.existing) {
			nameInput.value = ops.labelOf(this.existing);
		}

		const colorField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		colorField.createEl("label", { text: "Color" });
		const swatches = appendColorSwatchRow(colorField, {
			palette: GROUP_COLORS,
			initial: this.existing?.color ?? GROUP_COLORS[0],
			customFallback: "#7f6df2",
			onChange: () => {},
		});

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});

		if (this.existing) {
			const deleteButton = buttons.createEl("button", {
				text: "Delete",
				cls: "callander-modal-button callander-modal-button-danger",
			});
			const handleDelete = async () => {
				if (!this.deleteArmed) {
					this.deleteArmed = true;
					deleteButton.setText("Really delete?");
					return;
				}
				await ops.deleteGroup(this.existing!.name);
				new Notice(
					`Removed group "${ops.prettyGroupName(
						this.existing!.name
					)}" from everyone`
				);
				await this.onDone();
				this.close();
			};
			deleteButton.addEventListener("click", () => void handleDelete());
		}

		const saveButton = buttons.createEl("button", {
			text: this.existing ? "Save" : "Create",
			cls: "callander-modal-button mod-cta",
		});
		const handleSave = async () => {
			const name = nameInput.value.trim().toLowerCase();
			if (!name) return;
			if (this.existing && name !== this.existing.name) {
				await ops.renameGroup(this.existing.name, name);
			}
			await ops.setGroupColor(name, swatches.getColor());
			await this.onDone(name);
			this.close();
		};
		saveButton.addEventListener("click", () => void handleSave());

		if (this.existing) this.blurInitialFocus();
	}

	onClose() {
		closeColorPopover();
		this.contentEl.empty();
	}
}
