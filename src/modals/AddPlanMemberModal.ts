import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type { ContactWithCountdown } from "@/types";

/**
 * Add someone to a plan: search your people and tap one, or type any name to
 * add them as a guest. Mirrors the "All friends" search rather than a fiddly
 * native autocomplete (which is especially poor on mobile).
 */
export class AddPlanMemberModal extends FormModal {
	constructor(
		app: App,
		private contacts: ContactWithCountdown[],
		private onSubmit: (
			entry: { contact: ContactWithCountdown | null; name: string },
			unconfirmed: boolean
		) => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Who's coming?" });

		const searchInput = contentEl.createEl("input", {
			cls: "contact-field-input plan-member-search",
			attr: {
				type: "text",
				placeholder: "Search people, or type a guest name",
			},
		});

		const checkRow = contentEl.createEl("label", {
			cls: "plan-unconfirmed-check",
		});
		const checkbox = checkRow.createEl("input", {
			attr: { type: "checkbox" },
		});
		checkRow.createSpan({ text: "Unconfirmed (not sure they're in yet)" });

		const listEl = contentEl.createEl("div", {
			cls: "plan-member-search-list",
		});

		const add = async (
			contact: ContactWithCountdown | null,
			name: string
		) => {
			const trimmed = name.trim();
			if (!trimmed) return;
			await this.onSubmit({ contact, name: trimmed }, checkbox.checked);
			this.close();
		};

		const filtered = (q: string) =>
			this.contacts.filter(
				(c) =>
					!q ||
					c.displayName.toLowerCase().includes(q) ||
					c.name.toLowerCase().includes(q)
			);

		const row = (label: string, detail: string | null, onClick: () => void) => {
			const el = listEl.createEl("div", {
				cls: "friend-list-row plan-member-result",
			});
			el.addEventListener("click", onClick);
			const info = el.createEl("div", { cls: "friend-list-info" });
			info.createEl("div", { cls: "friend-list-name", text: label });
			if (detail) {
				info.createEl("div", {
					cls: "friend-list-detail",
					text: detail,
				});
			}
			return el;
		};

		const renderResults = () => {
			listEl.empty();
			const raw = searchInput.value.trim();
			const q = raw.toLowerCase();
			const matches = filtered(q);

			for (const c of matches) {
				const detail =
					c.age !== null && c.age !== undefined
						? `Age ${c.age}`
						: null;
				row(c.displayName, detail, () => add(c, c.displayName));
			}

			// Guest fallback when the typed name isn't an exact match
			const exact = this.contacts.some(
				(c) =>
					c.displayName.toLowerCase() === q ||
					c.name.toLowerCase() === q
			);
			if (raw && !exact) {
				row(`Add “${raw}” as guest`, null, () => add(null, raw)).addClass(
					"plan-member-guest"
				);
			}

			if (matches.length === 0 && !raw) {
				listEl.createEl("div", {
					cls: "section-helper-text",
					text: "No one left to add — type a name to add a guest.",
				});
			}
		};

		searchInput.addEventListener("input", renderResults);
		searchInput.addEventListener("keydown", (e) => {
			if (e.key !== "Enter") return;
			e.preventDefault();
			const raw = searchInput.value.trim();
			const matches = filtered(raw.toLowerCase());
			if (matches.length > 0) add(matches[0], matches[0].displayName);
			else if (raw) add(null, raw);
		});

		renderResults();
		setTimeout(() => searchInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
