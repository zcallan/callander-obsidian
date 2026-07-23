import { setIcon } from "obsidian";
import type { FriendTrackerView } from "./index";
import type { ContactWithCountdown, SortConfig } from "@/types";
import {
	parseFlexDate,
	monthName,
	formatFlexDate,
	flexSortKey,
} from "@/utils/flexdate";

export class TableView {
	private groupColors = new Map<string, string | null>();

	constructor(private view: FriendTrackerView) {}

	async render(
		container: HTMLElement,
		contacts: ContactWithCountdown[],
		sort: SortConfig
	) {
		// Create header and add contact button container
		const headerContainer = container.createEl("div", {
			cls: "friend-tracker-header",
		});
		headerContainer.createEl("h2", { text: "Callander" });

		// Group filter
		const groupNames = [
			...new Set(contacts.flatMap((c) => c.groups)),
		].sort();
		if (groupNames.length > 0 || this.view.groupFilter) {
			const filter = headerContainer.createEl("select", {
				cls: "dropdown friend-tracker-group-filter",
			});
			filter.createEl("option", { value: "", text: "All groups" });
			groupNames.forEach((g) =>
				filter.createEl("option", {
					value: g,
					text: g.charAt(0).toUpperCase() + g.slice(1),
				})
			);
			filter.value = this.view.groupFilter;
			filter.addEventListener("change", () => {
				this.view.groupFilter = filter.value;
				this.view.refresh();
			});
		}

		const addButton = headerContainer.createEl("button", {
			text: "Add friend",
			cls: "friend-tracker-button button-outlined",
		});
		addButton.addEventListener("click", () =>
			this.view.openAddContactModal()
		);

		const content = container.createEl("div", {
			cls: "friend-tracker-content",
		});

		if (contacts.length === 0) {
			const emptyState = content.createEl("div", {
				cls: "friend-tracker-empty-state",
			});
			emptyState.createEl("p", {
				text: "No friends yet. Add your first — a first name is all you need.",
			});
			return;
		}

		// Create scrollable container for table
		const tableContainer = content.createEl("div", {
			cls: "friend-tracker-table-container",
		});

		// Create table for contacts
		const table = tableContainer.createEl("table", {
			cls: "friend-tracker-table",
		}) as HTMLTableElement;

		this.renderTableHeader(table, sort);
		this.renderTableRows(table, contacts);
	}

	private renderTableHeader(table: HTMLTableElement, sort: SortConfig) {
		const headerRow = table.createEl("tr") as HTMLTableRowElement;
		const columns: Array<{
			key: keyof Omit<ContactWithCountdown, "file"> | "actions";
			label: string;
			sortable?: boolean;
		}> = [
			{ key: "name", label: "Name", sortable: true },
			{ key: "age", label: "Age", sortable: true },
			{ key: "birthday", label: "Birthday", sortable: true },
			{ key: "daysUntilBirthday", label: "Days left", sortable: true },
			{ key: "relationship", label: "Type", sortable: true },
			...(this.view.settings.showMetColumn
				? [{ key: "met" as const, label: "Met", sortable: true }]
				: []),
			...(this.view.settings.showIdeasColumn
				? [
						{
							key: "openIdeas" as const,
							label: "Ideas",
							sortable: true,
						},
				  ]
				: []),
			{
				key: "lastInteraction",
				label: "Last event",
				sortable: true,
			},
			{ key: "actions", label: "", sortable: false },
		];

		columns.forEach(({ key, label, sortable }) => {
			const th = headerRow.createEl("th");

			if (sortable) {
				const button = th.createEl("button", {
					cls: "friend-tracker-sort-button",
				});

				// Add text span
				button.createEl("span", { text: label });

				// Add sort indicator span
				button.createEl("span", {
					cls: "sort-indicator",
					text:
						sort.column === key
							? sort.direction === "asc"
								? "↑"
								: "↓"
							: "",
				});

				button.addEventListener("click", () => {
					if (key !== "actions") {
						this.view.handleSort(
							key as keyof Omit<ContactWithCountdown, "file">
						);
					}
				});
			} else {
				th.setText(label);
			}
		});
	}

	private renderTableRows(
		table: HTMLTableElement,
		contacts: ContactWithCountdown[]
	) {
		// Colors for the per-friend group dots
		this.groupColors = new Map(
			this.view.contactOperations
				.getGroupInfos(contacts)
				.map((i) => [i.name, i.color])
		);

		// Apply group filter, then sort
		const filtered = this.view.groupFilter
			? contacts.filter((c) =>
					c.groups.includes(this.view.groupFilter)
			  )
			: contacts;
		const sortedContacts = this.sortContacts(
			filtered,
			this.view.currentSort
		);

		sortedContacts.forEach((contact) => {
			const row = table.createEl("tr") as HTMLTableRowElement;

			// Create name cell with click handler
			const nameCell = this.renderNameCell(contact);
			row.appendChild(nameCell); // Add the name cell to the row
			nameCell.addEventListener("click", (e) => {
				e.stopPropagation(); // Stop event from bubbling
				this.view.openContact(contact.file);
			});

			// Rest of the cells (no click handlers)
			row.createEl("td", { text: contact.age?.toString() || "N/A" });
			row.createEl("td", {
				text: contact.formattedBirthday || "N/A",
			});
			row.createEl("td", this.birthdayCountdownCell(contact));
			row.createEl("td", {
				text: contact.relationship || "N/A",
				cls: "friend-tracker-relationship-cell",
			});
			if (this.view.settings.showMetColumn) {
				const metFlex = parseFlexDate(contact.met);
				row.createEl("td", {
					text: metFlex ? formatFlexDate(metFlex) : "",
				});
			}
			if (this.view.settings.showIdeasColumn) {
				row.createEl("td", {
					text: contact.openIdeas > 0 ? `💡 ${contact.openIdeas}` : "",
				});
			}
			row.createEl("td", { text: contact.lastInteraction || "" });

			// Actions cell
			const actionsCell = row.createEl("td", {
				cls: "friend-tracker-actions",
			});

			// Delete button
			const deleteButton = actionsCell.createEl("button", {
				cls: "friend-tracker-delete-button",
				attr: { "aria-label": "Remove contact" },
			});
			setIcon(deleteButton, "trash");

			deleteButton.addEventListener("click", (e) => {
				e.stopPropagation();
				this.view.openDeleteModal(contact.file);
			});
		});
	}

	private birthdayCountdownCell(contact: ContactWithCountdown): {
		text: string;
		cls?: string;
	} {
		if (contact.daysUntilBirthday === null) {
			// Day-less birthday ("1990-03"): month-level countdown
			const parsed = parseFlexDate(contact.birthday);
			if (parsed?.month != null && parsed.day === null) {
				const nowMonth = new Date().getMonth() + 1;
				return parsed.month === nowMonth
					? { text: "this month" }
					: { text: `in ${monthName(parsed.month)}` };
			}
			return { text: "N/A" };
		}

		if (contact.daysUntilBirthday === 0) {
			return { text: "Today!" };
		}

		// Belated window: recently passed birthdays show as "X days ago"
		const belatedWindow = this.view.settings.belatedBirthdayDays;
		if (
			contact.daysSinceBirthday !== null &&
			contact.daysSinceBirthday > 0 &&
			contact.daysSinceBirthday <= belatedWindow
		) {
			return {
				text:
					contact.daysSinceBirthday === 1
						? "yesterday"
						: `${contact.daysSinceBirthday} days ago`,
				cls: "friend-tracker-belated-cell",
			};
		}

		return { text: `${contact.daysUntilBirthday} days` };
	}

	private renderNameCell(contact: ContactWithCountdown): HTMLElement {
		const cell = document.createElement("td");
		cell.className = "friend-tracker-name-cell";

		if (contact.daysUntilBirthday !== null) {
			if (contact.daysUntilBirthday === 0) {
				// Birthday today - show cake
				const indicator = cell.createEl("div", {
					cls: "table-birthday-indicator birthday-today",
					text: "🎂",
				});
			} else if (contact.daysUntilBirthday <= 7) {
				// Within a week - show green dot
				const dotContainer = cell.createEl("div", {
					cls: "table-birthday-status-dot",
				});
				dotContainer.createEl("div", {
					cls: "table-birthday-status-dot-inner",
				});
			}
		}

		cell.createSpan({ text: contact.displayName });

		// Color-coded circles for the friend's groups
		for (const g of contact.groups) {
			const dot = cell.createEl("span", {
				cls: "group-dot group-dot-table",
				attr: { "aria-label": g, title: g },
			});
			dot.style.backgroundColor =
				this.groupColors.get(g) ??
				"var(--background-modifier-border)";
		}

		return cell;
	}

	private sortContacts(contacts: ContactWithCountdown[], sort: SortConfig) {
		return [...contacts].sort((a, b) => {
			if (sort.column === "birthday") {
				// Sort by month + day; handles year-less birthdays ("03-14")
				const flexA = parseFlexDate(a.birthday);
				const flexB = parseFlexDate(b.birthday);
				const aValue = flexA
					? (flexA.month ?? 0) * 100 + (flexA.day ?? 0)
					: Number.MAX_SAFE_INTEGER;
				const bValue = flexB
					? (flexB.month ?? 0) * 100 + (flexB.day ?? 0)
					: Number.MAX_SAFE_INTEGER;

				return sort.direction === "asc"
					? aValue - bValue
					: bValue - aValue;
			}

			// Add special handling for daysUntilBirthday
			if (sort.column === "daysUntilBirthday") {
				// Day-less birthdays get an approximate slot (mid-month);
				// contacts with no usable birthday stay pinned to the end
				const approxDays = (
					c: ContactWithCountdown
				): number | null => {
					if (c.daysUntilBirthday !== null)
						return c.daysUntilBirthday;
					const parsed = parseFlexDate(c.birthday);
					if (parsed?.month != null && parsed.day === null) {
						const nowMonth = new Date().getMonth() + 1;
						return (
							((parsed.month - nowMonth + 12) % 12) * 30 + 15
						);
					}
					return null;
				};

				const aDays = approxDays(a);
				const bDays = approxDays(b);

				// Handle null values
				if (aDays === null && bDays === null) return 0;
				if (aDays === null) return 1;
				if (bDays === null) return -1;

				// Normal numeric comparison that respects sort direction
				return (
					(aDays - bDays) * (sort.direction === "asc" ? 1 : -1)
				);
			}

			// "Met" sorts chronologically at flexible precision
			if (sort.column === "met") {
				const flexA = parseFlexDate(a.met);
				const flexB = parseFlexDate(b.met);
				if (!flexA && !flexB) return 0;
				if (!flexA) return 1;
				if (!flexB) return -1;
				return (
					(flexSortKey(flexA) - flexSortKey(flexB)) *
					(sort.direction === "asc" ? 1 : -1)
				);
			}

			const aValue = a[sort.column];
			const bValue = b[sort.column];

			// Handle null/empty values in sorting
			if (!aValue && !bValue) return 0;
			if (!aValue) return 1;
			if (!bValue) return -1;

			// Sort direction
			const direction = sort.direction === "asc" ? 1 : -1;

			// Handle different types of values
			if (sort.column === "relationship" || sort.column === "name") {
				// Case-insensitive string comparison; name sorts by what's shown
				const aStr = String(
					sort.column === "name" ? a.displayName : aValue
				).toLowerCase();
				const bStr = String(
					sort.column === "name" ? b.displayName : bValue
				).toLowerCase();
				return aStr < bStr ? -direction : aStr > bStr ? direction : 0;
			} else if (
				typeof aValue === "number" &&
				typeof bValue === "number"
			) {
				// Numeric comparison
				return (aValue - bValue) * direction;
			}

			// Default string comparison
			return aValue < bValue
				? -direction
				: aValue > bValue
				? direction
				: 0;
		});
	}
}
