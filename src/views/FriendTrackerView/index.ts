import { ItemView, WorkspaceLeaf, EventRef, TFile } from "obsidian";
import type FriendTracker from "@/main";
import { TableView } from "./TableView";
import { ContactOperations } from "@/services/ContactOperations";
import type { ContactWithCountdown, FriendListSort } from "@/types";
import { AddContactModal } from "@/modals/AddContactModal";
import { DeleteContactModal } from "@/modals/DeleteContactModal";

export const VIEW_TYPE_FRIEND_TRACKER = "callander-view";

export class FriendTrackerView extends ItemView {
	public groupFilter = "";
	private tableView: TableView;
	private contactOps: ContactOperations;
	private fileChangeHandler: EventRef | null = null;
	private isRefreshing = false;
	private _contacts: ContactWithCountdown[] | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: FriendTracker) {
		super(leaf);
		this.tableView = new TableView(this);
		this.contactOps = new ContactOperations(this.plugin);
		// Main-pane page: participate in tab history
		this.navigation = true;
	}

	public async setFriendListSort(sort: FriendListSort) {
		this.plugin.settings.friendListSort = sort;
		await this.plugin.saveSettings();
	}

	get settings() {
		return this.plugin.settings;
	}

	get contactOperations() {
		return this.contactOps;
	}

	// ... rest of the implementation from earlier

	public async openAddContactModal() {
		const modal = new AddContactModal(this.app, this.plugin);
		modal.open();
	}

	public async openContact(file: TFile) {
		await this.plugin.openContactPage(file);
	}

	public async openDeleteModal(file: TFile) {
		const modal = new DeleteContactModal(this.app, file, async () => {
			await this.app.fileManager.trashFile(file);
			await this.refresh();
		});
		modal.open();
	}

	getViewType(): string {
		return VIEW_TYPE_FRIEND_TRACKER;
	}

	getDisplayText(): string {
		return "Callander";
	}

	async onOpen() {
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && this.isContactFile(file)) {
					window.setTimeout(() => void this.refresh(), 100);
				}
			})
		);

		// Add visibility change handler
		document.addEventListener(
			"visibilitychange",
			this.handleVisibilityChange
		);
		window.addEventListener("focus", this.handleWindowFocus);

		await this.refresh();
	}

	onunload() {
		document.removeEventListener(
			"visibilitychange",
			this.handleVisibilityChange
		);
		window.removeEventListener("focus", this.handleWindowFocus);
	}

	private handleVisibilityChange = () => {
		if (document.visibilityState === "visible") {
			void this.refresh();
		}
	};

	private handleWindowFocus = () => {
		void this.refresh();
	};

	async refresh() {
		if (this.isRefreshing) return;
		this.isRefreshing = true;

		try {
			// Clear any cached data
			this._contacts = null;

			// Get the container and completely clear it
			const container = this.containerEl.children[1] as HTMLElement;
			// Remove all child elements
			while (container.firstChild) {
				container.removeChild(container.firstChild);
			}

			// The list view handles its own filtering and sorting
			const contacts = await this.contactOps.getContacts();
			const tableContainer = container.createDiv();
			await this.tableView.render(tableContainer, contacts);
		} finally {
			this.isRefreshing = false;
		}
	}

	private isContactFile(file: TFile): boolean {
		const contactFolder = this.plugin.settings.contactsFolder;
		return file.path.startsWith(contactFolder + "/");
	}
}
