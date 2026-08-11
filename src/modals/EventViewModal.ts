import { App, Modal, Notice, setIcon } from "obsidian";
import type FriendTracker from "@/main";
import type { ContactWithCountdown, EventInfo } from "@/types";
import { EventModal } from "@/modals/EventModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { parseFlexDate, formatFlexDate } from "@/utils/flexdate";
import { splitLeadingEmoji } from "@/components/EventTimeline";
import { shortenMemberNames, shortNameOverrides } from "@/utils/nameFormat";
import { EVENT_TYPES } from "@/constants";
import { buildEventShareText } from "@/utils/eventShare";
import { normalizeUrl } from "@/utils/url";

/**
 * A read view of an event with Edit / Done / Hide / Delete — mirrors
 * SomedayViewModal. `onChange` re-renders whatever opened it.
 */
export class EventViewModal extends Modal {
	private descSaveTimer: number | null = null;
	private descDirty = false;
	private description: string;
	/** Fetched once in onOpen(), for resolving people links to names. */
	private contacts: ContactWithCountdown[] = [];

	constructor(
		app: App,
		private plugin: FriendTracker,
		private event: EventInfo,
		private onChange: () => void | Promise<void>
	) {
		super(app);
		this.description = event.description;
	}

	private formatTime(t: string): string {
		const [h, m] = t.split(":").map(Number);
		if (Number.isNaN(h)) return t;
		const period = h < 12 ? "AM" : "PM";
		const hr = h % 12 === 0 ? 12 : h % 12;
		return `${hr}:${String(m || 0).padStart(2, "0")} ${period}`;
	}

	private whenLabel(): string {
		const parts: string[] = [];
		const f = parseFlexDate(this.event.date);
		if (f) parts.push(formatFlexDate(f));
		if (this.event.time) parts.push(this.formatTime(this.event.time));
		return parts.join(" · ") || "No date";
	}

	/** People links resolved to display names, shortened/disambiguated the
	 * same way a plan's members are. Dead links fall back to their text. */
	private peopleNames(): string[] {
		const names = this.event.people.map((raw) => {
			const linktext = raw
				.replace(/^\[\[|\]\]$/g, "")
				.split("|")[0]
				.trim();
			const dest = this.app.metadataCache.getFirstLinkpathDest(
				linktext,
				this.event.file.path
			);
			const match = dest
				? this.contacts.find((c) => c.file.path === dest.path)
				: undefined;
			return match?.displayName ?? linktext;
		});
		return shortenMemberNames(names, shortNameOverrides(this.contacts));
	}

	/** Done only means something for tasks and undated events — everything
	 * else is implicitly done once its date passes. */
	private hasDoneState(): boolean {
		return this.event.type === "task" || !this.event.date;
	}

	/** Debounced write: keeps typing from hitting disk on every keystroke. */
	private scheduleDescriptionSave(value: string) {
		this.description = value;
		this.descDirty = true;
		if (this.descSaveTimer !== null) {
			window.clearTimeout(this.descSaveTimer);
		}
		this.descSaveTimer = window.setTimeout(
			() => void this.flushDescription(),
			600
		);
	}

	/** Write whatever's pending now — called on blur and on close, so a
	 * quick edit-then-dismiss never loses the last few keystrokes. */
	private async flushDescription() {
		if (this.descSaveTimer !== null) {
			window.clearTimeout(this.descSaveTimer);
			this.descSaveTimer = null;
		}
		if (!this.descDirty) return;
		this.descDirty = false;
		await this.plugin.eventOperations.setDescription(
			this.event.file,
			this.description.trim()
		);
		await this.onChange();
	}

	async onOpen() {
		this.contacts = await this.plugin.contactOperations.getContacts();
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("someday-view-modal");
		const e = this.event;

		// Type first, small and muted, above the name — same treatment as
		// a plan timeline row's kind (Idea/Travel/Accommodation). The type
		// still leads the title as an emoji too, unless the name brings
		// its own; between the two, showing the label a third time in the
		// meta line below would just repeat it.
		const type = EVENT_TYPES.find((t) => t.id === e.type);
		if (type) {
			contentEl.createDiv({ cls: "view-kind", text: type.label });
		}
		const title =
			type && !splitLeadingEmoji(e.name)
				? `${type.emoji} ${e.name}`
				: e.name;
		contentEl.createEl("h2", { text: title });
		contentEl.createDiv({
			cls: "someday-view-meta",
			text: this.whenLabel(),
		});
		if (e.location) {
			contentEl.createDiv({
				cls: "someday-view-cost",
				text: `📍 ${e.location}`,
			});
		}
		if (e.people.length > 0) {
			contentEl.createDiv({
				cls: "someday-view-cost",
				text: `👥 ${this.peopleNames().join(", ")}`,
			});
		}
		if (e.variant === "timeline") {
			contentEl.createDiv({
				cls: "someday-view-cost",
				text: "🙈 Hidden from the dashboard and Events page",
			});
		}

		if (e.link) {
			const url = normalizeUrl(e.link);
			const linkRow = contentEl.createDiv({
				cls: "event-link-row reminder-view-linkrow",
			});
			linkRow.createSpan({ cls: "reminder-view-link", text: e.link });
			const openBtn = linkRow.createEl("button", {
				cls: "callander-button event-link-open",
				text: "Open",
				attr: { type: "button" },
			});
			openBtn.addEventListener("click", () => window.open(url, "_blank"));
		}

		// Called off. Sits last of the status lines, right above the notes,
		// since it qualifies everything above it.
		if (e.status === "cancelled") {
			contentEl.createDiv({
				cls: "someday-view-cost event-cancelled-note",
				text: "❌ Cancelled",
			});
		}

		// Notes — edits live here, saving itself shortly after you stop
		// typing (not shown on the dashboard row, only in this view).
		const descInput = contentEl.createEl("textarea", {
			cls: "someday-view-notes-input",
			attr: { placeholder: "Notes (optional)", rows: "3" },
		});
		descInput.value = this.description;
		descInput.addEventListener("input", () => {
			this.scheduleDescriptionSave(descInput.value);
		});
		descInput.addEventListener("blur", () => void this.flushDescription());
		// Being the only textarea, it'd otherwise grab the modal's default
		// focus — undo that right after, so opening the modal doesn't pop
		// the keyboard on mobile or steal focus from the actual buttons.
		window.setTimeout(() => descInput.blur(), 0);

		// Actions — housekeeping (edit the note, hide it, delete it) above
		// a divider, then what moves it forward, mirroring SomedayViewModal.
		const button = (
			row: HTMLElement,
			icon: string,
			label: string,
			onClick: () => void | Promise<void>,
			opts: { iconOnly?: boolean; danger?: boolean } = {}
		) => {
			const btn = row.createEl("button", {
				cls: [
					"callander-button",
					opts.iconOnly && "button-icon",
					opts.danger && "button-danger",
				]
					.filter(Boolean)
					.join(" "),
				attr: opts.iconOnly ? { "aria-label": label } : {},
			});
			setIcon(btn, icon);
			if (!opts.iconOnly) btn.createSpan({ text: label });
			btn.addEventListener("click", () => void onClick());
			return btn;
		};

		const editRow = contentEl.createDiv({ cls: "someday-view-actions" });
		button(editRow, "pencil", "Edit details", async () => {
			await this.flushDescription();
			this.close();
			new EventModal(this.app, this.plugin, e, this.onChange).open();
		});

		// Called off, but kept. Undoable, so no confirmation — unlike Delete
		// beside it, nothing is lost by pressing this.
		const isCancelled = e.status === "cancelled";
		button(
			editRow,
			isCancelled ? "rotate-ccw" : "circle-slash",
			isCancelled ? "Restore" : "Cancel",
			async () => {
				await this.flushDescription();
				await this.plugin.eventOperations.setStatus(
					e.file,
					isCancelled ? "open" : "cancelled"
				);
				new Notice(
					isCancelled
						? "Restored"
						: "Cancelled — still on the Events page"
				);
				await this.onChange();
				this.close();
			}
		);

		button(editRow, "copy", "Copy", async () => {
			// this.description rather than e.description: whatever's on
			// screen right now, including an edit not yet flushed to disk.
			await navigator.clipboard.writeText(
				buildEventShareText({
					name: e.name,
					type: e.type,
					date: e.date,
					time: e.time,
					location: e.location,
					description: this.description,
					link: e.link,
				})
			);
			new Notice("📋 Copied");
		}, { iconOnly: true });

		// The same switch as the modal's tick box, for an event already
		// saved: hidden keeps it to the timelines of whoever's on it.
		//
		// Only offered when there IS such a timeline. Hiding an event with
		// nobody on it would leave it nowhere at all, so the dashboard and
		// the Events page are the only places it can live. Un-hiding is
		// always offered, so nothing can get stuck out of sight.
		const isTimeline = e.variant === "timeline";
		if (isTimeline || e.people.length > 0) {
			button(
				editRow,
				isTimeline ? "eye" : "eye-off",
				isTimeline ? "Show on dashboard" : "Hide from dashboard",
				async () => {
					await this.flushDescription();
					await this.plugin.eventOperations.setVariant(
						e.file,
						isTimeline ? "reminder" : "timeline"
					);
					new Notice(
						isTimeline
							? "Shown on the dashboard and Events page again"
							: "Hidden — timelines still show it"
					);
					await this.onChange();
					this.close();
				},
				{ iconOnly: true }
			);
		}

		button(
			editRow,
			"trash",
			"Delete",
			() => {
				new ConfirmModal(
					this.app,
					"Delete event",
					`Delete "${e.name}"?`,
					"Delete",
					async () => {
						this.descDirty = false; // nothing left to save to
						await this.plugin.eventOperations.deleteEvent(e.file);
						await this.onChange();
						this.close();
					}
				).open();
			},
			{ iconOnly: true, danger: true }
		);

		contentEl.createDiv({ cls: "someday-view-divider" });

		const progressRow = contentEl.createDiv({
			cls: "someday-view-actions",
		});

		if (this.hasDoneState()) {
			const isDone = e.status === "done";
			button(
				progressRow,
				isDone ? "rotate-ccw" : "check",
				isDone ? "Reopen" : "Done",
				async () => {
					await this.flushDescription();
					await this.plugin.eventOperations.setStatus(
						e.file,
						isDone ? "open" : "done"
					);
					await this.onChange();
					this.close();
				}
			);
		}

		// The first linked person's page, one tap away.
		const firstPerson = this.plugin.eventOperations.peoplePaths(e)[0];
		if (firstPerson) {
			button(progressRow, "user", "View person", () => {
				const file = this.app.vault.getFileByPath(firstPerson);
				if (!file) return;
				this.close();
				void this.plugin.openContactPage(file);
			});
		}

		// Not wired up yet — a next step once the layout itself is right.
		button(progressRow, "map", "Make plan", () => {});
	}

	onClose() {
		void this.flushDescription();
		this.contentEl.empty();
	}
}
