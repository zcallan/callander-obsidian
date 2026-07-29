import { App, Modal, Notice } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type FriendTracker from "@/main";
import type { GroupInfo } from "@/types";
import { GROUP_COLORS } from "@/constants";

/**
 * Create or manage a group: name, color dot, delete. Deliberately tiny.
 */
export class GroupModal extends FormModal {
	private deleteArmed = false;

	constructor(
		app: App,
		private plugin: FriendTracker,
		private existing: GroupInfo | null,
		private onDone: () => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		const ops = this.plugin.contactOperations;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.existing
				? `Edit group: ${ops.prettyGroupName(this.existing.name)}`
				: "New group",
		});

		const nameField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		nameField.createEl("label", { text: "Name" });
		const nameInput = nameField.createEl("input", {
			cls: "callander-modal-input",
			attr: { type: "text", placeholder: "e.g. Basketball" },
		});
		if (this.existing) {
			nameInput.value = ops.prettyGroupName(this.existing.name);
		}

		// Color: fixed palette of swatches
		let color = this.existing?.color ?? GROUP_COLORS[0];
		const colorField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		colorField.createEl("label", { text: "Color" });
		const swatchRow = colorField.createDiv({
			cls: "group-color-swatches",
		});
		const swatches = new Map<string, HTMLElement>();
		for (const c of GROUP_COLORS) {
			const swatch = swatchRow.createEl("button", {
				cls: `group-color-swatch ${c === color ? "selected" : ""}`,
				attr: { "aria-label": c },
			});
			swatch.style.backgroundColor = c;
			swatch.addEventListener("click", () => {
				color = c;
				swatches.forEach((el, id) =>
					el.toggleClass("selected", id === c)
				);
			});
			swatches.set(c, swatch);
		}

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
			await ops.setGroupColor(name, color);
			await this.onDone();
			this.close();
		};
		saveButton.addEventListener("click", () => void handleSave());
	}

	onClose() {
		this.contentEl.empty();
	}
}
