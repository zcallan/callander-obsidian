import { App, Modal, Notice } from "obsidian";
import type FriendTracker from "@/main";
import { stringifyYaml } from "obsidian";
import { VIEW_TYPE_FRIEND_TRACKER } from "@/views/FriendTrackerView";
import { FriendTrackerView } from "@/views/FriendTrackerView";
import { createRelationshipInput } from "@/components/ContactFields";
import { createBirthdayPrecisionInput } from "@/components/BirthdayInput";
import { createFlexDateInput } from "@/components/FlexDateInput";

export class AddContactModal extends Modal {
	constructor(app: App, private plugin: FriendTracker) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Add a friend" });

		const form = contentEl.createEl("form", {
			cls: "friend-tracker-add-contact-form",
		});

		// Name field (required)
		const nameField = form.createDiv({ cls: "friend-tracker-modal-field" });
		nameField.createEl("label", { text: "Name *" });
		const nameInput = nameField.createEl("input", {
			attr: {
				type: "text",
				name: "name",
				required: true,
				placeholder: "A first name is enough",
			},
			cls: "friend-tracker-modal-input",
		});
		nameInput.focus();

		// Display name (optional) — used everywhere instead of name when set
		const displayField = form.createDiv({
			cls: "friend-tracker-modal-field",
		});
		displayField.createEl("label", { text: "Display name (optional)" });
		const displayInput = displayField.createEl("input", {
			attr: {
				type: "text",
				name: "displayName",
				placeholder: "What you call them, e.g. Mum",
			},
			cls: "friend-tracker-modal-input",
		});

		// Birthday field (honest imprecision: exact / month+year / month+day)
		const birthdayField = form.createDiv({
			cls: "friend-tracker-modal-field",
		});
		birthdayField.createEl("label", { text: "Birthday" });
		let birthdayValue = "";
		createBirthdayPrecisionInput(
			birthdayField,
			"",
			(value) => {
				birthdayValue = value;
			},
			{ inputClass: "friend-tracker-modal-input" }
		);

		// When you met (as precisely as you remember)
		const metField = form.createDiv({
			cls: "friend-tracker-modal-field",
		});
		metField.createEl("label", { text: "When you met" });
		let metValue = "";
		createFlexDateInput(
			metField,
			"",
			(value) => {
				metValue = value;
			},
			{ inputClass: "friend-tracker-modal-input" }
		);

		// Relationship field
		const relationshipField = form.createDiv({
			cls: "friend-tracker-modal-field",
		});
		relationshipField.createEl("label", { text: "Relationship" });
		const relationshipInput = createRelationshipInput(
			relationshipField,
			this.plugin
		);

		// Groups: toggle chips of known groups + a quick new-group input
		const groupsField = form.createDiv({
			cls: "friend-tracker-modal-field",
		});
		groupsField.createEl("label", { text: "Groups" });
		const ops = this.plugin.contactOperations;
		const member = new Set<string>();
		const groupsWrap = groupsField.createDiv({
			cls: "contact-groups-edit",
		});
		const chipsRow = groupsWrap.createDiv({ cls: "contact-group-chips" });
		const infos = ops.getGroupInfos();
		const colorOf = new Map(infos.map((i) => [i.name, i.color]));

		const addChip = (name: string) => {
			// type=button so chips don't submit the form
			const chip = chipsRow.createEl("button", {
				cls: "contact-group-chip",
				attr: { type: "button" },
			});
			const dot = chip.createEl("span", { cls: "group-dot" });
			dot.style.backgroundColor =
				colorOf.get(name) ?? "var(--background-modifier-border)";
			chip.createSpan({ text: ops.prettyGroupName(name) });
			chip.addEventListener("click", () => {
				member.has(name) ? member.delete(name) : member.add(name);
				chip.toggleClass("selected", member.has(name));
			});
			return chip;
		};
		infos.forEach((i) => addChip(i.name));

		// Group creation lives on the dashboard — here you only toggle
		// membership of existing groups
		if (infos.length === 0) {
			groupsWrap.createEl("div", {
				cls: "section-helper-text",
				text: "No groups yet — create them from the dashboard.",
			});
		}

		// Submit button
		form.createEl("button", {
			text: "Add friend",
			attr: { type: "submit" },
			cls: "friend-tracker-button button-primary",
		});

		form.addEventListener("submit", (e) => {
			e.preventDefault();
			const data: Record<string, any> = {
				name: nameInput.value,
			};

			if (displayInput.value.trim()) {
				data.displayName = displayInput.value.trim();
			}
			if (birthdayValue) data.birthday = birthdayValue;
			if (metValue) data.met = metValue;
			if (member.size > 0) data.groups = [...member].sort();
			if (relationshipInput.value) {
				const relationship = relationshipInput.value.toLowerCase();
				data.relationship = relationshipInput.value.toLowerCase();
				// Add new relationship type to settings if it doesn't exist
				if (
					!this.plugin.settings.relationshipTypes.includes(
						relationship
					)
				) {
					// Remove any duplicates (case-insensitive) before adding
					this.plugin.settings.relationshipTypes = [
						...new Set(
							this.plugin.settings.relationshipTypes.filter(
								(type) => type.toLowerCase() !== relationship
							)
						),
						relationship,
					];
					this.plugin.saveSettings();
				}
			}

			if (data.name) {
				this.onSubmit(data);
				this.close();
			}
		});
	}

	private async onSubmit(data: Record<string, any>) {
		const fileName = `${data.name}.md`;
		const filePath = `${this.plugin.settings.contactsFolder}/${fileName}`;

		// Ensure folder exists before creating contact
		const folder = this.plugin.settings.contactsFolder;
		if (!this.app.vault.getFolderByPath(folder)) {
			await this.app.vault.createFolder(folder);
		}

		// Create YAML frontmatter
		const yaml = stringifyYaml(data);
		const fileContent = `---\n${yaml}\n---\n`;

		try {
			const file = await this.app.vault.create(filePath, fileContent);

			// Wait a moment for the file to be indexed
			await new Promise((resolve) => setTimeout(resolve, 300));

			// Refresh the Friend Tracker view
			const friendTrackerLeaves = this.app.workspace.getLeavesOfType(
				VIEW_TYPE_FRIEND_TRACKER
			);

			for (const leaf of friendTrackerLeaves) {
				const view = leaf.view;
				if (view instanceof FriendTrackerView) {
					await view.refresh();
					break;
				}
			}

			new Notice(`Added ${data.name}`);
			// Straight to their page
			await this.plugin.openContactPage(file);
		} catch (error) {
			new Notice(`Error adding friend: ${error}`);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
