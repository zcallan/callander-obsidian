import { setIcon } from "obsidian";
import type { ContactWithCountdown } from "@/types";
import type { DashboardContext } from "@/views/DashboardView/context";

/** The title and quick actions, the friend search, and the friend chips. */
export function renderHeader(ctx: DashboardContext, container: HTMLElement) {
	const { plugin } = ctx;
	const header = container.createDiv({ cls: "dashboard-header" });
	header.createEl("h2", { text: "Callander" });
	const actions = header.createDiv({ cls: "dashboard-actions" });
	const action = (
		icon: string,
		label: string,
		onClick: () => void | Promise<void>
	) => {
		const btn = actions.createEl("button", {
			cls: "callander-button",
		});
		setIcon(btn, icon);
		btn.createSpan({ text: label });
		btn.addEventListener("click", () => void onClick());
	};
	action("user-plus", "Add friend", () => plugin.openAddContactModal());
	action("lightbulb", "Add idea", () => plugin.openQuickIdeaCapture());
	action("pencil-line", "Quick note", () => plugin.openQuickNote());

	// Search
	const searchWrap = container.createDiv({
		cls: "dashboard-search",
	});
	ctx.searchBox.build(searchWrap, {
		placeholder: "Find a friend…",
		cls: "contact-field-input",
		value: ctx.ui.searchQuery,
		onInput: (value) => {
			ctx.ui.searchQuery = value;
			renderFriendList(ctx, friendList);
		},
	});

	const friendList = container.createDiv({
		cls: "dashboard-friend-list",
	});
	renderFriendList(ctx, friendList);
}

function renderFriendList(ctx: DashboardContext, listEl: HTMLElement) {
	listEl.empty();
	const q = ctx.ui.searchQuery.trim().toLowerCase();
	let matches: ContactWithCountdown[];
	if (q) {
		// Searching covers everyone, alphabetically
		matches = ctx.data.contacts
			.filter(
				(c) =>
					c.displayName.toLowerCase().includes(q) ||
					c.name.toLowerCase().includes(q) ||
					c.groups.some((g) => g.includes(q))
			)
			.sort((a, b) => a.displayName.localeCompare(b.displayName));
	} else {
		// Browsing shows the most recently interacted-with friends — any
		// idea/event/draft/edit touches their file's mtime — with the
		// next place after them going to the way to everyone else.
		matches = [...ctx.data.contacts]
			.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime)
			.slice(0, ctx.plugin.settings.dashboardFriendSuggestionCount);
	}

	for (const contact of matches) {
		const chip = listEl.createEl("button", {
			cls: "dashboard-friend-chip",
		});
		chip.createSpan({ text: contact.displayName });
		if (contact.openIdeas > 0) {
			chip.createSpan({
				cls: "dashboard-chip-badge",
				text: `💡${contact.openIdeas}`,
			});
		}
		chip.addEventListener("click", () =>
			void ctx.openContact(contact.file)
		);
	}
	if (matches.length === 0) {
		listEl.createDiv({
			cls: "section-helper-text",
			text: q ? "No friends match." : "No friends yet.",
		});
	}

	// Nothing to go to yet on a vault with nobody in it — the Getting
	// started checklist is what points at adding the first friend.
	if (ctx.data.contacts.length === 0) return;

	// Last in the row, and outlined rather than filled, so it reads as
	// the way to the rest rather than as one more friend. Kept while
	// searching too: when nobody matches, the full list is the obvious
	// next place to look.
	const all = listEl.createEl("button", {
		cls: "dashboard-friend-chip dashboard-friend-chip-all",
		text: "All friends",
	});
	all.addEventListener("click", () =>
		void ctx.plugin.activateFriendTracker({ here: true })
	);
}
