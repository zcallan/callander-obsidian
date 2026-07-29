import {
	App,
	PluginSettingTab,
	normalizePath,
	type SettingDefinitionItem,
} from "obsidian";
import type FriendTracker from "@/main";

export class FriendTrackerSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: FriendTracker) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Contacts folder",
				desc: "Folder where contact files will be stored",
				control: {
					type: "folder",
					key: "contactsFolder",
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
				items: [
					{
						name: "Show star sign",
						control: { type: "toggle", key: "showStarSign" },
					},
					{
						name: "Show Chinese zodiac",
						control: { type: "toggle", key: "showChineseZodiac" },
					},
					{
						name: "Show birthstone",
						control: { type: "toggle", key: "showBirthstone" },
					},
					{
						name: "Show birth flower",
						control: { type: "toggle", key: "showBirthFlower" },
					},
				],
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
					action: (el) => this.promptNewRelationshipType(el),
				},
				onDelete: (index) => this.deleteRelationshipType(index),
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

	getControlValue(key: string): unknown {
		const row = /^relationshipTypes\.(\d+)$/.exec(key);
		if (row) {
			return this.plugin.settings.relationshipTypes[Number(row[1])];
		}
		return super.getControlValue(key);
	}

	setControlValue(key: string, value: unknown): void | Promise<void> {
		const row = /^relationshipTypes\.(\d+)$/.exec(key);
		if (row) {
			return this.renameRelationshipType(Number(row[1]), String(value));
		}
		// Folder paths were normalized on entry before; keep that behavior
		if (key === "contactsFolder" || key === "diaryFolder") {
			return super.setControlValue(key, normalizePath(String(value)));
		}
		return super.setControlValue(key, value);
	}

	/** Swap the add affordance for an inline input, exactly like before. */
	private promptNewRelationshipType(el: HTMLElement) {
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
			const value = input.value.trim().toLowerCase();
			if (
				commit &&
				value &&
				!this.plugin.settings.relationshipTypes.includes(value)
			) {
				this.plugin.settings.relationshipTypes.push(value);
				void this.plugin.saveSettings();
			}
			this.update();
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

	/** Lowercase on save; a rename that collides absorbs the duplicate. */
	private async renameRelationshipType(index: number, value: string) {
		const types = this.plugin.settings.relationshipTypes;
		if (index < 0 || index >= types.length) return;
		const newType = value.trim().toLowerCase();
		if (!newType || newType === types[index]) {
			this.update();
			return;
		}
		const next = types.map((t, i) => (i === index ? newType : t));
		this.plugin.settings.relationshipTypes = next.filter(
			(t, i) => next.indexOf(t) === i
		);
		await this.plugin.saveSettings();
		this.update();
	}

	private deleteRelationshipType(index: number) {
		this.plugin.settings.relationshipTypes.splice(index, 1);
		void this.plugin.saveSettings();
		this.update();
	}
}
