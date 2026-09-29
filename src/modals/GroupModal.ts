import { App, Notice } from "obsidian";
import { guardedAction } from "@/components/guardedAction";
import { FormModal } from "@/modals/FormModal";
import type CallanderPlugin from "@/main";
import type { GroupInfo } from "@/types";
import { GROUP_COLORS } from "@/constants";
import { closeColorPopover } from "@/components/colorPicker";
import { appendColorSwatchRow } from "@/components/colorSwatchRow";
import { groupNameProblem } from "@/utils/fileName";

/**
 * Create or manage a group: name, color dot, delete. Deliberately tiny.
 */
export class GroupModal extends FormModal {
	private deleteArmed = false;

	constructor(
		app: App,
		private plugin: CallanderPlugin,
		private existing: GroupInfo | null,
		/** The saved group's name, lowercased, and its colour — so a caller
		 * creating one inline (no group list of its own to refresh from)
		 * knows which one to select and how to draw it; the colour is in
		 * the group's frontmatter, which the cache hasn't read back yet.
		 * Given neither on delete. Pages hear the write on their own, so
		 * it's only for a caller with more to do. */
		private onDone: (name?: string, color?: string) => Promise<void> = () =>
			Promise.resolve()
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
			const handleDelete = guardedAction(
				async () => {
					if (!this.deleteArmed) {
						this.deleteArmed = true;
						deleteButton.setText("Really delete?");
						return;
					}
					await ops.deleteGroup(this.existing!.name);
					// The spelling the heading used, not a recapitalised key.
					new Notice(
						`Removed group "${ops.labelOf(this.existing!)}" from everyone`
					);
					await this.onDone();
					this.close();
				},
				{ buttons: [deleteButton], failure: "Couldn't delete" }
			);
			deleteButton.addEventListener("click", () => void handleDelete());
		}

		const saveButton = buttons.createEl("button", {
			text: this.existing ? "Save" : "Create",
			cls: "callander-modal-button mod-cta",
		});
		const handleSave = guardedAction(
			async () => {
				const name = nameInput.value.trim().toLowerCase();
				if (!name) return;
				const problem = groupNameProblem(name);
				if (problem) {
					new Notice(problem);
					return;
				}
				// A new group under a name another group's page already has
				// would only recolour that group, silently.
				const taken = this.existing ? null : ops.groupPageOf(name);
				if (taken) {
					new Notice(`A group called "${taken.basename}" already exists`);
					return;
				}
				if (this.existing && name !== this.existing.name) {
					try {
						await ops.renameGroup(this.existing.name, name);
					} catch (error) {
						// renameGroup refuses a name that's taken, before
						// changing anything; say so and leave the form open.
						new Notice(
							error instanceof Error ? error.message : String(error)
						);
						return;
					}
				}
				const color = swatches.getColor();
				await ops.setGroupColor(name, color);
				await this.onDone(name, color);
				this.close();
			},
			{ buttons: [saveButton] }
		);
		saveButton.addEventListener("click", () => void handleSave());

		if (this.existing) this.blurInitialFocus();
	}

	onClose() {
		closeColorPopover();
		this.contentEl.empty();
	}
}
