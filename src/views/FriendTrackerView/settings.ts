import {
	App,
	PluginSettingTab,
	Setting,
	AbstractInputSuggest,
	TFolder,
	normalizePath,
} from "obsidian";
import type FriendTracker from "@/main";

class FolderSuggest extends AbstractInputSuggest<string> {
	inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(inputStr: string): string[] {
		const folders = this.app.vault
			.getAllLoadedFiles()
			.filter((f) => f instanceof TFolder)
			.map((f) => f.path);
		return folders.filter((f) =>
			f.toLowerCase().includes(inputStr.toLowerCase())
		);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		this.inputEl.value = value;
		this.inputEl.trigger("input");
		this.close();
	}
}

export class FriendTrackerSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: FriendTracker) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Contacts folder")
			.setDesc("Folder where contact files will be stored")
			.addText((text) => {
				new FolderSuggest(this.app, text.inputEl);
				return text
					.setPlaceholder("Enter folder name")
					.setValue(this.plugin.settings.contactsFolder)
					.onChange(async (value) => {
						this.plugin.settings.contactsFolder =
							normalizePath(value);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Diary folder")
			.setDesc("Folder where diary entries will be stored")
			.addText((text) => {
				new FolderSuggest(this.app, text.inputEl);
				return text
					.setPlaceholder("Enter folder name")
					.setValue(this.plugin.settings.diaryFolder)
					.onChange(async (value) => {
						this.plugin.settings.diaryFolder = normalizePath(value);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Belated birthday window")
			.setDesc(
				'For this many days after a birthday, show "birthday was X days ago" so you can still send a belated message'
			)
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.inputEl.max = "60";
				text.setValue(
					String(this.plugin.settings.belatedBirthdayDays)
				).onChange(async (value) => {
					const parsed = Number(value);
					if (Number.isFinite(parsed)) {
						this.plugin.settings.belatedBirthdayDays = Math.min(
							60,
							Math.max(0, Math.round(parsed))
						);
						await this.plugin.saveSettings();
					}
				});
			});

		new Setting(containerEl)
			.setName("Your name")
			.setDesc(
				'Included automatically in shared plan messages ("Copy as message"), so you don\'t have to add yourself as a guest'
			)
			.addText((text) => {
				text.setPlaceholder("e.g. Callan")
					.setValue(this.plugin.settings.yourName)
					.onChange(async (value) => {
						this.plugin.settings.yourName = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Open friends in Callander view")
			.setDesc(
				"Clicking a friend's note anywhere (file explorer, quick switcher, links, graph) opens their Callander page instead of raw markdown. The Markdown tab still gets you to the underlying note."
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.openContactsInCallanderView)
					.onChange(async (value) => {
						this.plugin.settings.openContactsInCallanderView =
							value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("Birthday trivia").setHeading();

		const trivia: Array<{
			key:
				| "showStarSign"
				| "showChineseZodiac"
				| "showBirthstone"
				| "showBirthFlower";
			name: string;
		}> = [
			{ key: "showStarSign", name: "Show star sign" },
			{ key: "showChineseZodiac", name: "Show Chinese zodiac" },
			{ key: "showBirthstone", name: "Show birthstone" },
			{ key: "showBirthFlower", name: "Show birth flower" },
		];
		for (const { key, name } of trivia) {
			new Setting(containerEl).setName(name).addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings[key])
					.onChange(async (value) => {
						this.plugin.settings[key] = value;
						await this.plugin.saveSettings();
					});
			});
		}

		new Setting(containerEl)
			.setName("Birthday reminders on startup")
			.setDesc(
				"Show a notice with today's and upcoming birthdays when Obsidian opens (once per day)"
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showBirthdayReminders)
					.onChange(async (value) => {
						this.plugin.settings.showBirthdayReminders = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Reminder window")
			.setDesc("Include birthdays up to this many days away")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.max = "60";
				text.setValue(
					String(this.plugin.settings.birthdayReminderDays)
				).onChange(async (value) => {
					const parsed = Number(value);
					if (Number.isFinite(parsed)) {
						this.plugin.settings.birthdayReminderDays = Math.min(
							60,
							Math.max(1, Math.round(parsed))
						);
						await this.plugin.saveSettings();
					}
				});
			});

		new Setting(containerEl)
			.setName("Relationship types")
			.setHeading()
			.addButton((button) =>
			button.setButtonText("Add relationship type").onClick(async () => {
				// Create a temporary input field
				const tempInput = document.createElement("input");
				tempInput.type = "text";
				tempInput.placeholder = "Enter relationship type";
				tempInput.className =
					"callander-modal-input relationship-type-input";

				// Replace button with input temporarily
				button.buttonEl.replaceWith(tempInput);
				tempInput.focus();

				const handleAdd = async () => {
					const fullValue = tempInput.value || "";
					const value = fullValue.trim();

					if (value) {
						const newType = value.toLowerCase();
						if (
							!this.plugin.settings.relationshipTypes.includes(
								newType
							)
						) {
							this.plugin.settings.relationshipTypes.push(
								newType
							);
							await this.plugin.saveSettings();
						}
					}
					// Schedule the display update after the current event
					setTimeout(() => this.display(), 0);
				};

				tempInput.addEventListener("keydown", async (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						await handleAdd();
					} else if (e.key === "Escape") {
						this.display();
					}
				});

				// Only handle blur if there's a value
				tempInput.addEventListener("blur", async () => {
					if (tempInput.value?.trim()) {
						await handleAdd();
					} else {
						this.display();
					}
				});
			})
		);

		const relationshipContainer = containerEl.createEl("div", {
			cls: "callander-relationship-types",
		});

		this.plugin.settings.relationshipTypes.forEach((type) => {
			new Setting(relationshipContainer)
				.addText((text) =>
					text
						.setValue(type)
						.setPlaceholder("Type name")
						.then((textComponent) => {
							// Save on Enter
							textComponent.inputEl.addEventListener(
								"keypress",
								async (e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										textComponent.inputEl.blur();
									}
								}
							);

							// Save on blur
							textComponent.inputEl.addEventListener(
								"blur",
								async () => {
									const value = textComponent.inputEl.value;
									const index =
										this.plugin.settings.relationshipTypes.indexOf(
											type
										);
									if (
										value.toLowerCase() !== type ||
										value !== value.toLowerCase()
									) {
										const newType = value.toLowerCase();
										this.plugin.settings.relationshipTypes =
											[
												...this.plugin.settings.relationshipTypes.filter(
													(t, i) =>
														i === index ||
														t.toLowerCase() !==
															newType
												),
											];
										this.plugin.settings.relationshipTypes[
											index
										] = newType;
										await this.plugin.saveSettings();
										// Schedule the display update after the current event
										setTimeout(() => this.display(), 0);
									}
								}
							);
						})
				)
				.addExtraButton((button) => {
					button
						.setIcon("trash")
						.setTooltip("Delete relationship type")
						.onClick(async () => {
							const index =
								this.plugin.settings.relationshipTypes.indexOf(
									type
								);
							this.plugin.settings.relationshipTypes.splice(
								index,
								1
							);
							await this.plugin.saveSettings();
							this.display();
						});
				});
		});

		// ("Default tab" setting retired 2026-07-22 — the contact page now
		// stacks Ideas / Timeline / Notes / Markdown instead of tabs.)
	}
}
