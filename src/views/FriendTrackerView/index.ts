import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import type FriendTracker from "@/main";
import { applyPageWidth, observePageRoom } from "@/components/pageWidth";
import { TableView } from "@/views/FriendTrackerView/TableView";
import type { FriendListSort, FriendListTab } from "@/types";
import { AddContactModal } from "@/modals/AddContactModal";
import { registerPageRefresh } from "@/utils/vaultRefresh";

export const VIEW_TYPE_FRIEND_TRACKER = "callander-view";

export class FriendTrackerView extends ItemView {
	public groupFilter = "";
	private tableView: TableView;
	private inFlight: Promise<void> | null = null;
	private again = false;
	/** Widened for this view only, until it closes. */
	private pageWide = false;

	constructor(leaf: WorkspaceLeaf, private plugin: FriendTracker) {
		super(leaf);
		this.tableView = new TableView(this);
		// Main-pane page: participate in tab history
		this.navigation = true;
	}

	public async setFriendListSort(sort: FriendListSort) {
		this.plugin.settings.friendListSort = sort;
		await this.plugin.saveSettings();
	}

	public async setFriendListTab(tab: FriendListTab) {
		this.plugin.settings.friendListTab = tab;
		await this.plugin.saveSettings();
	}

	get settings() {
		return this.plugin.settings;
	}

	get contactOperations() {
		return this.plugin.contactOperations;
	}

	get callander() {
		return this.plugin;
	}

	public async openAddContactModal() {
		const modal = new AddContactModal(this.app, this.plugin);
		modal.open();
	}

	public async openContact(file: TFile) {
		await this.plugin.openContactPage(file);
	}

	getViewType(): string {
		return VIEW_TYPE_FRIEND_TRACKER;
	}

	getDisplayText(): string {
		return "Callander";
	}

	async onOpen() {
		// Once for the life of the view, not per render — it only has to
		// know whether there's room beside the column.
		this.register(observePageRoom(this));
		registerPageRefresh(this, this.plugin, () => void this.refresh(), {
			scope: (path) => this.plugin.contactOperations.isPersonFile(path),
		});
		// Coming back to the page also refreshes: that's what rolls the
		// birthday countdowns over after midnight. Registered on the page's
		// own window, which a popout changes.
		this.registerDomEvent(this.containerEl.doc, "visibilitychange", () => {
			if (this.containerEl.doc.visibilityState === "visible") {
				void this.refresh();
			}
		});
		this.registerDomEvent(this.containerEl.win, "focus", () => {
			void this.refresh();
		});

		await this.refresh();
	}

	/**
	 * Rebuild the list. A request while one is running isn't dropped: it
	 * queues one more pass, so a change landing mid-read still shows.
	 */
	async refresh(): Promise<void> {
		if (this.inFlight) {
			this.again = true;
			return this.inFlight;
		}
		this.inFlight = (async () => {
			try {
				do {
					this.again = false;
					await this.renderOnce();
				} while (this.again);
			} finally {
				this.inFlight = null;
			}
		})();
		return this.inFlight;
	}

	private async renderOnce() {
		// Read first, then swap: emptying before the read left the page
		// blank for as long as it took.
		const contacts = await this.plugin.contactOperations.getContacts();
		const container = this.contentEl;
		const scrollTop = container.scrollTop;
		container.empty();
		// The list view handles its own filtering and sorting
		const tableContainer = container.createDiv();
		await this.tableView.render(tableContainer, contacts);
		applyPageWidth(container, this.plugin, this.pageWide, () => {
			this.pageWide = true;
			void this.refresh();
		});
		container.scrollTop = scrollTop;
	}

}
