import {
	App,
	AbstractInputSuggest,
	PluginSettingTab,
	Setting,
	TFolder,
	normalizePath,
	requireApiVersion,
	type SettingDefinitionItem,
} from "obsidian";
import type FriendTracker from "@/main";
import type { FriendTrackerSettings } from "@/types";

// The declarative settings API arrived in 1.13; below that Obsidian renders
// display() instead. requireApiVersion guards must use the literal version
// string — the no-unsupported-api lint rule only recognizes that form.

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

const TRIVIA_TOGGLES: Array<{
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

export class FriendTrackerSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: FriendTracker) {
		super(app, plugin);
	}

	// ---- Declarative path (Obsidian 1.13+) --------------------------------
	// On 1.13+ Obsidian renders these definitions (and indexes them for
	// settings search); display() below is the fallback for older versions.

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Base folder",
				desc: "Folder that holds your Callander data — the People, Groups, Plans and Somedays folders live inside it",
				control: {
					type: "folder",
					key: "baseFolder",
					placeholder: "Enter folder name",
				},
			},
			{
				name: "Diary folder",
				desc: "Folder where diary entries will be stored",
				control: {
					type: "folder",
					key: "diaryFolder",
					placeholder: "Enter folder name",
				},
			},
			{
				name: "Dashboard file name",
				desc: "Note in the base folder that opens the Callander dashboard — quick ideas and drafts are stored in its properties",
				control: {
					type: "text",
					key: "dashboardFileName",
					placeholder: "Dashboard",
				},
			},
			{
				name: "Belated birthday window",
				desc: 'For this many days after a birthday, show "birthday was X days ago" so you can still send a belated message',
				control: {
					type: "number",
					key: "belatedBirthdayDays",
					min: 0,
					max: 60,
				},
			},
			{
				name: "Your name",
				desc: 'Included automatically in shared plan messages ("Copy as message"), so you don\'t have to add yourself as a guest',
				control: {
					type: "text",
					key: "yourName",
					placeholder: "e.g. Callan",
				},
			},
			{
				name: "Open friends in Callander view",
				desc: "Clicking a friend's note anywhere (file explorer, quick switcher, links, graph) opens their Callander page instead of raw markdown. The Markdown tab still gets you to the underlying note.",
				control: {
					type: "toggle",
					key: "openContactsInCallanderView",
				},
			},
			{
				type: "group",
				heading: "Birthday trivia",
				items: TRIVIA_TOGGLES.map(({ key, name }) => ({
					name,
					control: { type: "toggle", key },
				})),
			},
			{
				name: "Birthday reminders on startup",
				desc: "Show a notice with today's and upcoming birthdays when Obsidian opens (once per day)",
				control: {
					type: "toggle",
					key: "showBirthdayReminders",
				},
			},
			{
				name: "Reminder window",
				desc: "Include birthdays up to this many days away",
				control: {
					type: "number",
					key: "birthdayReminderDays",
					min: 1,
					max: 60,
				},
			},
			{
				type: "list",
				heading: "Relationship types",
				emptyState: "No relationship types yet — add one.",
				addItem: {
					name: "Add relationship type",
					action: (el) =>
						this.promptNewRelationshipType(el, () => {
							if (requireApiVersion("1.13.0")) {
								this.update();
							}
						}),
				},
				onDelete: (index) => {
					this.deleteRelationshipTypeAt(index);
					if (requireApiVersion("1.13.0")) {
						this.update();
					}
				},
				// Rows carry user data, not fixed settings — keep them out of
				// the global settings search
				items: this.plugin.settings.relationshipTypes.map(
					(type, index) => ({
						name: "",
						searchable: false,
						control: {
							type: "text",
							key: `relationshipTypes.${index}`,
							placeholder: "Type name",
						},
					})
				),
			},
		];
	}

	// Only ever invoked on 1.13+, but written without any 1.13-only calls
	// (no super.*) so the plugin lints clean at the 1.7.2 floor.
	getControlValue(key: string): unknown {
		const row = /^relationshipTypes\.(\d+)$/.exec(key);
		if (row) {
			return this.plugin.settings.relationshipTypes[Number(row[1])];
		}
		return this.plugin.settings[key as keyof FriendTrackerSettings];
	}

	setControlValue(key: string, value: unknown): void | Promise<void> {
		const row = /^relationshipTypes\.(\d+)$/.exec(key);
		if (row) {
			return this.renameRelationshipTypeAt(
				Number(row[1]),
				String(value)
			).then((changed) => {
				if (!changed) return;
				if (requireApiVersion("1.13.0")) {
					this.update();
				}
			});
		}
		// Folder paths were normalized on entry before; keep that behavior
		if (key === "baseFolder" || key === "diaryFolder") {
			value = normalizePath(String(value));
		}
		// A basename, not a path — strip separators and stray whitespace
		if (key === "dashboardFileName") {
			value = String(value).replace(/[\\/]/g, "-").trim();
		}
		Object.assign(this.plugin.settings, { [key]: value });
		return this.plugin.saveSettings();
	}

	// ---- Imperative fallback (Obsidian < 1.13) ----------------------------

	display(): void {
		this.renderFallback();
	}

	// Split from display() so internal re-renders don't reference the
	// deprecated method name
	private renderFallback(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Base folder")
			.setDesc(
				"Folder that holds your Callander data — the People, Groups, Plans and Somedays folders live inside it"
			)
			.addText((text) => {
				new FolderSuggest(this.app, text.inputEl);
				return text
					.setPlaceholder("Enter folder name")
					.setValue(this.plugin.settings.baseFolder)
					.onChange(async (value) => {
						this.plugin.settings.baseFolder =
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
			.setName("Dashboard file name")
			.setDesc(
				"Note in the base folder that opens the Callander dashboard — quick ideas and drafts are stored in its properties"
			)
			.addText((text) => {
				text.setPlaceholder("Dashboard")
					.setValue(this.plugin.settings.dashboardFileName)
					.onChange(async (value) => {
						this.plugin.settings.dashboardFileName = value
							.replace(/[\\/]/g, "-")
							.trim();
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

		for (const { key, name } of TRIVIA_TOGGLES) {
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
				button.setButtonText("Add relationship type").onClick(() => {
					this.promptNewRelationshipType(button.buttonEl, () =>
						// Defer: display() tears down the input mid-event
						window.setTimeout(() => this.renderFallback(), 0)
					);
				})
			);

		const relationshipContainer = containerEl.createDiv({
			cls: "callander-relationship-types",
		});

		this.plugin.settings.relationshipTypes.forEach((type, index) => {
			new Setting(relationshipContainer)
				.addText((text) => {
					text.setValue(type).setPlaceholder("Type name");
					// Save on Enter (via blur) or when focus leaves the field
					text.inputEl.addEventListener("keydown", (e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							text.inputEl.blur();
						}
					});
					text.inputEl.addEventListener("blur", () => {
						void this.renameRelationshipTypeAt(
							index,
							text.inputEl.value
						).then((changed) => {
							if (changed) {
								window.setTimeout(() => this.renderFallback(), 0);
							}
						});
					});
				})
				.addExtraButton((button) => {
					button
						.setIcon("trash")
						.setTooltip("Delete relationship type")
						.onClick(() => {
							this.deleteRelationshipTypeAt(index);
							this.renderFallback();
						});
				});
		});
	}

	// ---- Shared relationship-type mutations -------------------------------

	/** Swap an add affordance for an inline input; onDone re-renders. */
	private promptNewRelationshipType(el: HTMLElement, onDone: () => void) {
		const input = createEl("input", {
			cls: "callander-modal-input relationship-type-input",
			attr: { type: "text", placeholder: "Enter relationship type" },
		});
		el.replaceWith(input);
		input.focus();

		// Re-rendering detaches the input mid-event — run exactly once
		let done = false;
		const finish = (commit: boolean) => {
			if (done) return;
			done = true;
			if (commit) this.addRelationshipType(input.value);
			onDone();
		};
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				finish(true);
			} else if (e.key === "Escape") {
				finish(false);
			}
		});
		input.addEventListener("blur", () => finish(!!input.value.trim()));
	}

	/** Lowercased; duplicates are ignored. */
	private addRelationshipType(raw: string): void {
		const value = raw.trim().toLowerCase();
		if (!value) return;
		if (!this.plugin.settings.relationshipTypes.includes(value)) {
			this.plugin.settings.relationshipTypes.push(value);
			void this.plugin.saveSettings();
		}
	}

	/** Lowercase on save; a rename that collides absorbs the duplicate. */
	private async renameRelationshipTypeAt(
		index: number,
		value: string
	): Promise<boolean> {
		const types = this.plugin.settings.relationshipTypes;
		if (index < 0 || index >= types.length) return false;
		const newType = value.trim().toLowerCase();
		if (!newType || newType === types[index]) return false;
		const next = types.map((t, i) => (i === index ? newType : t));
		this.plugin.settings.relationshipTypes = next.filter(
			(t, i) => next.indexOf(t) === i
		);
		await this.plugin.saveSettings();
		return true;
	}

	private deleteRelationshipTypeAt(index: number): void {
		this.plugin.settings.relationshipTypes.splice(index, 1);
		void this.plugin.saveSettings();
	}
}
