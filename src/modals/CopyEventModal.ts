import { App, Notice } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type FriendTracker from "@/main";
import type { EventInfo } from "@/types";
import { EVENT_TYPES } from "@/constants";

/**
 * Put an event on more timelines — e.g. a trip to Ireland logged with
 * Crista, shared onto both Austins. Events are single files now, so this
 * doesn't copy anything: it links the picked people to the same event.
 */
export class CopyEventModal extends FormModal {
	constructor(
		app: App,
		private plugin: FriendTracker,
		private event: EventInfo
	) {
		super(app);
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Add to more timelines" });

		const type = EVENT_TYPES.find((t) => t.id === this.event.type);
		contentEl.createDiv({
			cls: "section-helper-text",
			text: `${type ? type.emoji + " " : ""}${this.event.name}`,
		});

		// Whoever is already on the event has nothing to gain from the list.
		const alreadyLinked = new Set(
			this.plugin.eventOperations.peoplePaths(this.event)
		);
		const contacts = (await this.plugin.contactOperations.getContacts())
			.filter((c) => !alreadyLinked.has(c.file.path))
			.sort((a, b) => a.displayName.localeCompare(b.displayName));

		// Checked state persists across search filtering
		const checked = new Set<string>();

		const searchInput = contentEl.createEl("input", {
			cls: "contact-field-input copy-event-search",
			attr: { type: "text", placeholder: "Search friends…" },
		});

		const listEl = contentEl.createDiv({
			cls: "group-event-friend-list",
		});

		const renderList = () => {
			listEl.empty();
			const q = searchInput.value.trim().toLowerCase();
			const matches = contacts.filter(
				(c) =>
					!q ||
					c.displayName.toLowerCase().includes(q) ||
					c.name.toLowerCase().includes(q)
			);
			for (const c of matches) {
				const row = listEl.createEl("label", {
					cls: "group-event-friend-row",
				});
				const box = row.createEl("input", {
					attr: { type: "checkbox" },
				});
				box.checked = checked.has(c.file.path);
				box.addEventListener("change", () => {
					box.checked
						? checked.add(c.file.path)
						: checked.delete(c.file.path);
				});
				row.createSpan({ text: c.displayName });
			}
			if (matches.length === 0) {
				listEl.createDiv({
					cls: "section-helper-text",
					text: "No friends match.",
				});
			}
		};
		searchInput.addEventListener("input", renderList);
		renderList();

		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		const addButton = buttons.createEl("button", {
			text: "Add",
			cls: "callander-modal-button mod-cta",
		});
		const handleAdd = async () => {
			const targets = contacts.filter((c) => checked.has(c.file.path));
			if (targets.length === 0) return;
			const e = this.event;
			await this.plugin.eventOperations.updateEvent(e.file, {
				name: e.name,
				date: e.date || undefined,
				time: e.time || undefined,
				type: e.type,
				people: [
					...e.people,
					...targets.map((c) => `[[${c.file.basename}]]`),
				],
				location: e.location || undefined,
				link: e.link || undefined,
				description: e.description || undefined,
				source: e.source || undefined,
				variant: e.variant,
			});
			for (const c of targets) {
				await this.plugin.refreshOpenContactPages(c.file);
			}
			new Notice(
				`Added to ${targets.map((c) => c.displayName).join(", ")}`
			);
			this.close();
		};
		addButton.addEventListener("click", () => void handleAdd());
	}

	onClose() {
		this.contentEl.empty();
	}
}
