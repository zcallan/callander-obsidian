import { App, Modal, Notice } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type FriendTracker from "@/main";
import type { ContactWithCountdown, FriendEvent } from "@/types";
import { EVENT_TYPES } from "@/constants";

/**
 * Copy a timeline event onto one or more other friends — e.g. a trip to
 * Ireland logged on Crista, copied to both Austins.
 */
export class CopyEventModal extends FormModal {
	constructor(
		app: App,
		private plugin: FriendTracker,
		private event: FriendEvent,
		private excludePath: string
	) {
		super(app);
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Copy event to…" });

		const type = EVENT_TYPES.find((t) => t.id === this.event.type);
		contentEl.createEl("div", {
			cls: "section-helper-text",
			text: `${type ? type.emoji + " " : ""}${this.event.text}`,
		});

		const contacts = (await this.plugin.contactOperations.getContacts())
			.filter((c) => c.file.path !== this.excludePath)
			.sort((a, b) => a.displayName.localeCompare(b.displayName));

		// Checked state persists across search filtering
		const checked = new Set<string>();

		const searchInput = contentEl.createEl("input", {
			cls: "contact-field-input copy-event-search",
			attr: { type: "text", placeholder: "Search friends…" },
		});

		const listEl = contentEl.createEl("div", {
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
				listEl.createEl("div", {
					cls: "section-helper-text",
					text: "No friends match.",
				});
			}
		};
		searchInput.addEventListener("input", renderList);
		renderList();

		const buttons = contentEl.createEl("div", {
			cls: "callander-modal-buttons",
		});
		const copyButton = buttons.createEl("button", {
			text: "Copy",
			cls: "callander-modal-button mod-cta",
		});
		copyButton.addEventListener("click", async () => {
			const targets = contacts.filter((c) => checked.has(c.file.path));
			if (targets.length === 0) return;
			for (const c of targets) {
				// Copy the meaningful fields, not diary-source linkage
				await this.plugin.contactOperations.addEventToFile(
					c.file,
					this.event.date,
					this.event.text,
					this.event.type ?? "hangout",
					this.event.location
				);
				await this.plugin.refreshOpenContactPages(c.file);
			}
			new Notice(
				`Copied to ${targets
					.map((c: ContactWithCountdown) => c.displayName)
					.join(", ")}`
			);
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
