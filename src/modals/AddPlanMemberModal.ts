import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type { ContactWithCountdown } from "@/types";

interface GroupOption {
	name: string;
	label: string;
	color?: string | null;
}

/**
 * Add someone to a plan: search your people and tap one, filter by group, or
 * type any name to add them as a guest. Mirrors the "All friends" search.
 */
export class AddPlanMemberModal extends FormModal {
	private groupFilter = "";

	constructor(
		app: App,
		private contacts: ContactWithCountdown[],
		private groups: GroupOption[],
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

		// Group filter pills
		if (this.groups.length > 0) {
			const pills = contentEl.createDiv({
				cls: "contact-group-chips plan-member-groups",
			});
			for (const g of this.groups) {
				const chip = pills.createEl("button", {
					cls: `contact-group-chip ${
						this.groupFilter === g.name ? "selected" : ""
					}`,
				});
				const dot = chip.createSpan({ cls: "group-dot" });
				dot.style.backgroundColor =
					g.color ?? "var(--background-modifier-border)";
				chip.createSpan({ text: g.label });
				chip.addEventListener("click", () => {
					this.groupFilter =
						this.groupFilter === g.name ? "" : g.name;
					pills
						.findAll(".contact-group-chip")
						.forEach((el) => el.removeClass("selected"));
					if (this.groupFilter === g.name) chip.addClass("selected");
					renderResults();
				});
			}
		}

		const checkRow = contentEl.createEl("label", {
			cls: "plan-unconfirmed-check",
		});
		const checkbox = checkRow.createEl("input", {
			attr: { type: "checkbox" },
		});
		checkRow.createSpan({ text: "Unconfirmed (not sure they're in yet)" });

		const listEl = contentEl.createDiv({
			cls: "plan-member-search-list",
		});

		const colorOf = new Map(this.groups.map((g) => [g.name, g.color]));
		const labelOf = new Map(this.groups.map((g) => [g.name, g.label]));

		const add = async (
			contact: ContactWithCountdown | null,
			name: string
		) => {
			const trimmed = name.trim();
			if (!trimmed) return;
			await this.onSubmit({ contact, name: trimmed }, checkbox.checked);
			this.close();
		};

		// Newest-modified first, filtered by search + group
		const filtered = (q: string) =>
			this.contacts
				.filter(
					(c) =>
						(!this.groupFilter ||
							c.groups.includes(this.groupFilter)) &&
						(!q ||
							c.displayName.toLowerCase().includes(q) ||
							c.name.toLowerCase().includes(q))
				)
				.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);

		const contactRow = (c: ContactWithCountdown) => {
			const el = listEl.createDiv({
				cls: "friend-list-row plan-member-result",
			});
			el.addEventListener("click", () => add(c, c.displayName));
			const info = el.createDiv({ cls: "friend-list-info" });
			const main = info.createDiv({ cls: "friend-list-main" });
			main.createSpan({ cls: "friend-list-name", text: c.displayName });
			for (const g of c.groups) {
				const tag = main.createSpan({
					cls: "friend-list-group-tag",
				});
				const dot = tag.createSpan({ cls: "group-dot" });
				dot.style.backgroundColor =
					colorOf.get(g) ?? "var(--background-modifier-border)";
				tag.createSpan({ text: labelOf.get(g) ?? g });
			}
		};

		const renderResults = () => {
			listEl.empty();
			const raw = searchInput.value.trim();
			const q = raw.toLowerCase();
			const matches = filtered(q);

			for (const c of matches) contactRow(c);

			// Guest fallback when the typed name isn't an exact match
			const exact = this.contacts.some(
				(c) =>
					c.displayName.toLowerCase() === q ||
					c.name.toLowerCase() === q
			);
			if (raw && !exact) {
				const el = listEl.createDiv({
					cls: "friend-list-row plan-member-result plan-member-guest",
				});
				el.addEventListener("click", () => add(null, raw));
				el.createDiv({
					cls: "friend-list-info",
				}).createDiv({
					cls: "friend-list-name",
					text: `Add “${raw}” as guest`,
				});
			}

			if (matches.length === 0 && !raw) {
				listEl.createDiv({
					cls: "section-helper-text",
					text: "No one to add — type a name to add a guest.",
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
		window.setTimeout(() => searchInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
