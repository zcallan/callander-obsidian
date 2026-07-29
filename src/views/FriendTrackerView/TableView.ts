import { setIcon } from "obsidian";
import type { FriendTrackerView } from "./index";
import type { ContactWithCountdown, FriendListSort } from "@/types";
import { parseFlexDate, flexSortKey, monthName } from "@/utils/flexdate";
import { GlanceModal } from "@/modals/GlanceModal";

const SORT_OPTIONS: Array<{ id: FriendListSort; label: string }> = [
	{ id: "birthday", label: "Birthday" },
	{ id: "alphabetical", label: "Name (A-Z)" },
	{ id: "alphabeticalDesc", label: "Name (Z-A)" },
	{ id: "newest", label: "Newest added" },
	{ id: "oldest", label: "Oldest added" },
	{ id: "lastEvent", label: "Last event" },
	{ id: "youngest", label: "Youngest" },
	{ id: "eldest", label: "Oldest" },
	{ id: "modified", label: "Last modified" },
];

/**
 * The All friends page: a two-line list in the same visual language as
 * the dashboard, with search, group-pill filtering, and a remembered sort.
 */
export class TableView {
	private searchQuery = "";
	private contacts: ContactWithCountdown[] = [];
	private groupColors = new Map<string, string | null>();
	private listEl: HTMLElement | null = null;

	constructor(private view: FriendTrackerView) {}

	async render(container: HTMLElement, contacts: ContactWithCountdown[]) {
		this.contacts = contacts;
		const wrap = container.createDiv({
			cls: "friend-list-container",
		});

		// Header
		const header = wrap.createDiv({
			cls: "dashboard-section-header",
		});
		header.createEl("h2", { text: "All friends" });
		const addButton = header.createEl("button", {
			cls: "callander-button friend-list-add-button",
		});
		setIcon(addButton, "user-plus");
		addButton.createSpan({ text: "Add friend" });
		addButton.addEventListener("click", () =>
			void this.view.openAddContactModal()
		);

		// Search
		const searchWrap = wrap.createDiv({ cls: "dashboard-search" });
		const searchInput = searchWrap.createEl("input", {
			attr: { type: "text", placeholder: "Search friends…" },
			cls: "contact-field-input",
		});
		searchInput.value = this.searchQuery;
		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value;
			this.renderList();
		});

		// Group pills filter
		const ops = this.view.contactOperations;
		const infos = ops.getGroupInfos(contacts);
		this.groupColors = new Map(infos.map((i) => [i.name, i.color]));
		if (infos.length > 0) {
			const pills = wrap.createDiv({
				cls: "contact-group-chips friend-list-groups",
			});
			for (const info of infos) {
				const chip = pills.createEl("button", {
					cls: `contact-group-chip ${
						this.view.groupFilter === info.name ? "selected" : ""
					}`,
				});
				const dot = chip.createSpan({ cls: "group-dot" });
				dot.style.backgroundColor =
					info.color ?? "var(--background-modifier-border)";
				chip.createSpan({ text: ops.prettyGroupName(info.name) });
				chip.addEventListener("click", () => {
					this.view.groupFilter =
						this.view.groupFilter === info.name ? "" : info.name;
					pills
						.findAll(".contact-group-chip")
						.forEach((el) => el.removeClass("selected"));
					if (this.view.groupFilter === info.name) {
						chip.addClass("selected");
					}
					this.renderList();
				});
			}
		}

		// Sort
		const sortRow = wrap.createDiv({
			cls: "friend-list-sort-row",
		});
		sortRow.createSpan({
			cls: "friend-list-sort-label",
			text: "Sort",
		});
		const select = sortRow.createEl("select", { cls: "dropdown" });
		SORT_OPTIONS.forEach((o) =>
			select.createEl("option", { value: o.id, text: o.label })
		);
		select.value = this.view.settings.friendListSort;
		const handleSortChange = async () => {
			await this.view.setFriendListSort(select.value as FriendListSort);
			this.renderList();
		};
		select.addEventListener("change", () => void handleSortChange());

		this.listEl = wrap.createDiv({ cls: "friend-list" });
		this.renderList();
	}

	private sortedFiltered(): ContactWithCountdown[] {
		const q = this.searchQuery.trim().toLowerCase();
		const list = this.contacts.filter(
			(c) =>
				(!this.view.groupFilter ||
					c.groups.includes(this.view.groupFilter)) &&
				(!q ||
					c.displayName.toLowerCase().includes(q) ||
					c.name.toLowerCase().includes(q))
		);

		const lastEventKey = (c: ContactWithCountdown): number => {
			let max = -1;
			for (const e of c.events) {
				const parsed = parseFlexDate(e.date);
				if (parsed) max = Math.max(max, flexSortKey(parsed));
			}
			return max;
		};

		switch (this.view.settings.friendListSort) {
			case "newest":
				list.sort((a, b) => b.file.stat.ctime - a.file.stat.ctime);
				break;
			case "oldest":
				list.sort((a, b) => a.file.stat.ctime - b.file.stat.ctime);
				break;
			case "birthday":
				list.sort(
					(a, b) =>
						(a.daysUntilBirthday ?? 9999) -
						(b.daysUntilBirthday ?? 9999)
				);
				break;
			case "lastEvent":
				list.sort((a, b) => lastEventKey(b) - lastEventKey(a));
				break;
			case "youngest":
				list.sort((a, b) => (a.age ?? 999) - (b.age ?? 999));
				break;
			case "eldest":
				list.sort((a, b) => (b.age ?? -1) - (a.age ?? -1));
				break;
			case "modified":
				list.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
				break;
			case "alphabeticalDesc":
				list.sort((a, b) => b.displayName.localeCompare(a.displayName));
				break;
			default:
				list.sort((a, b) => a.displayName.localeCompare(b.displayName));
		}
		return list;
	}

	private renderList() {
		if (!this.listEl) return;
		this.listEl.empty();
		const list = this.sortedFiltered();

		if (list.length === 0) {
			this.listEl.createDiv({
				cls: "section-helper-text",
				text:
					this.contacts.length === 0
						? "No friends yet. Add your first — a first name is all you need."
						: "No friends match.",
			});
			return;
		}

		for (const contact of list) {
			const row = this.listEl.createDiv({
				cls: "friend-list-row",
			});
			row.addEventListener("click", () =>
				void this.view.openContact(contact.file)
			);

			const info = row.createDiv({ cls: "friend-list-info" });

			// Line 1: name + group dots
			const main = info.createDiv({ cls: "friend-list-main" });
			main.createSpan({
				cls: "friend-list-name",
				text: contact.displayName,
			});
			for (const g of contact.groups) {
				const tag = main.createSpan({
					cls: "friend-list-group-tag",
				});
				const dot = tag.createSpan({ cls: "group-dot" });
				dot.style.backgroundColor =
					this.groupColors.get(g) ??
					"var(--background-modifier-border)";
				tag.createSpan({
					text: this.view.contactOperations.prettyGroupName(g),
				});
			}

			// Line 2: birthday as a plain date, then age
			const parts: string[] = [];
			const bday = this.birthdayDate(contact);
			if (bday) parts.push(bday);
			if (contact.age !== null) parts.push(`Age ${contact.age}`);
			if (parts.length > 0) {
				info.createDiv({
					cls: "friend-list-detail",
					text: parts.join(" • "),
				});
			}

			// Quick overview without leaving the list
			const glanceButton = row.createEl("button", {
				cls: "callander-button friend-list-glance",
			});
			setIcon(glanceButton, "eye");
			glanceButton.createSpan({
				cls: "friend-list-glance-label",
				text: "Glance",
			});
			glanceButton.addEventListener("click", (e) => {
				e.stopPropagation();
				new GlanceModal(this.view.app, contact).open();
			});
		}
	}

	/** Birthday as a plain date: "21 Aug 1997", "21 Aug", or "Aug 1997". */
	private birthdayDate(contact: ContactWithCountdown): string {
		const p = parseFlexDate(contact.birthday);
		if (!p || p.month === null) return "";
		const shortMonth = monthName(p.month).slice(0, 3);
		if (p.day === null) {
			return p.year !== null ? `${shortMonth} ${p.year}` : shortMonth;
		}
		return p.year !== null
			? `${p.day} ${shortMonth} ${p.year}`
			: `${p.day} ${shortMonth}`;
	}
}
