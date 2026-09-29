import { App, Notice, setIcon } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { renderCategoryChips } from "@/components/categoryChips";
import type FriendTracker from "@/main";
import type { ContactWithCountdown } from "@/types";
import { EVENT_TYPES } from "@/constants";
import { shortTime } from "@/utils/calendarGrid";
import { formatShortFlexDate, parseFlexDate } from "@/utils/flexdate";
import {
	duplicateNames,
	importPrompt,
	importTemplate,
	parseEventImport,
	problemLine,
	problemsHeading,
	problemsText,
	type ImportedEvent,
} from "@/utils/eventImport";
import { formatCount } from "@/utils/text";

/**
 * The imported events as a collapsible list — shut by default, since the
 * count in its heading is usually what you're checking, and a season of
 * fixtures is a long scroll.
 */
function renderPreview(parent: HTMLElement, events: ImportedEvent[]) {
	const wrap = parent.createDiv({
		cls: "plan-accordion callander-modal-accordion event-import-preview",
	});
	const header = wrap.createDiv({
		cls: "plan-accordion-header callander-modal-accordion-header",
	});
	const title = header.createSpan({ text: "Preview imported events" });
	title.createSpan({
		cls: "dashboard-count-badge",
		text: String(events.length),
	});
	setIcon(
		header.createSpan({ cls: "plan-accordion-chevron" }),
		"chevron-down"
	);
	header.addEventListener("click", () =>
		wrap.toggleClass("is-open", !wrap.hasClass("is-open"))
	);
	const body = wrap.createDiv({ cls: "plan-accordion-body" });
	const list = body.createDiv({ cls: "event-import-list" });
	for (const e of events) {
		const row = list.createDiv({ cls: "event-import-row" });
		row.createDiv({ cls: "event-import-name", text: e.name });
		const type = EVENT_TYPES.find((t) => t.id === e.type);
		const date = parseFlexDate(e.date);
		const meta = [
			type?.emoji,
			date ? formatShortFlexDate(date) : "No date",
			e.time && shortTime(e.time),
			e.location,
			e.people.join(", "),
		]
			.filter(Boolean)
			.join(" · ");
		row.createDiv({ cls: "event-import-meta", text: meta });
	}
}

/** How long a copy button says "Copied" before going back. */
const COPIED_FEEDBACK_MS = 1500;

/** Problems listed one by one before the rest collapse into "…and N more". */
const MAX_PROBLEMS_SHOWN = 20;

/**
 * Step one of a bulk import: the format to follow, and somewhere to paste.
 *
 * Checked as you type, so a mistake is pointed at — by line — before it
 * can reach the vault. Nothing is written here; Import moves on to the
 * confirmation, which is where the events are actually created.
 */
export class EventImportModal extends FormModal {
	constructor(app: App, private plugin: FriendTracker) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("event-import-modal");
		contentEl.createEl("h2", { text: "Import events" });
		// The same sentence the dashboard's own entry point uses, so what
		// you read before opening this is what you read inside it.
		contentEl.createDiv({
			cls: "section-helper-text event-import-intro",
			text: "Add a whole batch of events at once with CSV — e.g. a season of games, a term of classes, repeating events...",
		});

		const format = contentEl.createDiv({ cls: "callander-modal-field" });
		format.createEl("label", { text: "Events must be in this format" });
		// Bullets rather than a paragraph — but few and long rather than
		// many and short, since the format box, the paste box and the
		// results all have to fit under them.
		const rules = format.createEl("ul", {
			cls: "section-helper-text event-import-rules",
		});
		for (const rule of [
			"One event per line. Name and Date are needed; the rest can be empty. A first row of column names is optional.",
			`Dates are YYYY-MM-DD, times 24-hour HH:MM (or Anytime, or TBD), and several people are separated by semicolons. Type is one of: ${EVENT_TYPES.map(
				(t) => t.id
			).join(", ")}.`,
			'Leave timezone empty unless it is important — the UI will display the event in that timezone alongside your device timezone (if different). Format as "ET" or "America/New_York".',
			"Copy the example below and then paste into any spreadsheet editor such as Excel or Sheets for easier editing. You do not have to remove the example line — this will be ignored during the import.",
		]) {
			rules.createEl("li", { text: rule });
		}
		const template = importTemplate();
		const copyBox = format.createEl("button", {
			cls: "event-import-copy",
			attr: { type: "button", "aria-label": "Copy the format" },
		});
		copyBox.createEl("pre", { text: template });
		const copyHint = copyBox.createDiv({
			cls: "event-import-copy-hint",
			text: "Click to copy",
		});
		copyBox.addEventListener("click", () => {
			void navigator.clipboard.writeText(template).then(() => {
				copyHint.setText("Copied");
				copyBox.addClass("is-copied");
				window.setTimeout(() => {
					copyHint.setText("Click to copy");
					copyBox.removeClass("is-copied");
				}, COPIED_FEEDBACK_MS);
			});
		});

		const tip = contentEl.createDiv({ cls: "event-import-tip" });
		tip.createSpan({ cls: "event-import-tip-icon", text: "💡" });
		const tipBody = tip.createDiv({ cls: "event-import-tip-body" });
		tipBody.createDiv({
			cls: "event-import-tip-text",
			text: "Tip: to import a sports team's games for the season, you could ask an AI to fill in the format above with every remaining game. Or do it by hand — up to you.",
		});
		// Everything an AI needs to get the format right first time — the
		// rules, the types, an example — to paste in ahead of the events.
		const promptBtn = tipBody.createEl("button", {
			cls: "callander-button event-import-prompt",
			attr: { type: "button" },
		});
		setIcon(promptBtn, "copy");
		const promptLabel = promptBtn.createSpan({ text: "Copy prompt" });
		promptBtn.addEventListener("click", () => {
			void navigator.clipboard.writeText(importPrompt()).then(() => {
				promptLabel.setText("Copied");
				window.setTimeout(
					() => promptLabel.setText("Copy prompt"),
					COPIED_FEEDBACK_MS
				);
			});
		});

		const paste = contentEl.createDiv({ cls: "callander-modal-field" });
		paste.createEl("label", { text: "Your events" });
		const input = paste.createEl("textarea", {
			cls: "event-import-input",
			attr: { placeholder: "Paste your events here…", spellcheck: "false" },
		});
		const result = contentEl.createDiv({ cls: "event-import-result" });

		const buttons = contentEl.createDiv({ cls: "callander-modal-buttons" });
		const cancel = buttons.createEl("button", {
			text: "Cancel",
			cls: "callander-modal-button",
		});
		cancel.addEventListener("click", () => this.close());
		const importBtn = buttons.createEl("button", {
			text: "Import",
			cls: "callander-modal-button mod-cta",
		});

		let events: ImportedEvent[] = [];
		const check = () => {
			const parsed = parseEventImport(input.value);
			events = parsed.events;
			result.empty();
			if (parsed.errors.length > 0) {
				const box = result.createDiv({ cls: "event-import-errors" });
				box.createDiv({
					cls: "event-import-errors-title",
					text: problemsHeading(parsed.errors.length),
				});
				const list = box.createEl("ul");
				for (const err of parsed.errors.slice(0, MAX_PROBLEMS_SHOWN)) {
					list.createEl("li", { text: problemLine(err) });
				}
				if (parsed.errors.length > MAX_PROBLEMS_SHOWN) {
					list.createEl("li", {
						text: `…and ${
							parsed.errors.length - MAX_PROBLEMS_SHOWN
						} more.`,
					});
				}
				// Under the list, where the eye finishes reading. Copies all
				// of them, not just the twenty shown.
				const copy = box.createEl("button", {
					cls: "callander-button event-import-errors-copy",
					attr: { type: "button" },
				});
				setIcon(copy, "copy");
				const copyLabel = copy.createSpan({ text: "Copy" });
				const text = problemsText(parsed.errors);
				copy.addEventListener("click", () => {
					void navigator.clipboard.writeText(text).then(() => {
						copyLabel.setText("Copied");
						window.setTimeout(
							() => copyLabel.setText("Copy"),
							COPIED_FEEDBACK_MS
						);
					});
				});
			} else if (events.length > 0) {
				renderPreview(result, events);
			}
			importBtn.disabled = events.length === 0;
			importBtn.toggleClass("is-disabled", events.length === 0);
		};
		input.addEventListener("input", check);
		check();

		importBtn.addEventListener("click", () => {
			if (events.length === 0) return;
			// This one stays open underneath, so going back from the
			// confirmation returns to the pasted text rather than losing it.
			new EventImportConfirmModal(this.app, this.plugin, events, () =>
				this.close()
			).open();
		});
	}

}

/**
 * Step two: what's about to happen, and the last chance to change it.
 *
 * Says how many events, flags names that repeat (in the import, or against
 * events already in the vault) and people it couldn't find, and offers
 * categories to put on every one of them. Import writes them all.
 */
class EventImportConfirmModal extends FormModal {
	private categories: string[] = [];
	private contacts: ContactWithCountdown[] = [];

	constructor(
		app: App,
		private plugin: FriendTracker,
		private events: ImportedEvent[],
		private onImported: () => void
	) {
		super(app);
	}

	async onOpen() {
		this.contacts = await this.plugin.contactOperations.getContacts();
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("event-import-modal");
		contentEl.createEl("h2", { text: "Confirm import" });

		const n = this.events.length;
		contentEl.createDiv({
			cls: "event-import-summary",
			text: `${formatCount(n, "event")} ready to import.`,
		});

		const ops = this.plugin.eventOperations;
		const dupes = duplicateNames(
			this.events,
			ops.getEvents().map((e) => e.name)
		);
		const unknown = [
			...new Set(
				this.events.flatMap((e) =>
					e.people.filter((p) => this.resolvePerson(p) === null)
				)
			),
		];
		const warnings: string[] = [];
		if (dupes.inImport.length > 0) {
			warnings.push(
				`Repeated in this import: ${dupes.inImport.join(", ")}.`
			);
		}
		if (dupes.inVault.length > 0) {
			warnings.push(
				`Already an event with this name: ${dupes.inVault.join(", ")}.`
			);
		}
		if (unknown.length > 0) {
			warnings.push(
				`Not in your vault, so linked by name only: ${unknown.join(", ")}.`
			);
		}
		if (warnings.length > 0) {
			const box = contentEl.createDiv({ cls: "event-import-warnings" });
			box.createDiv({
				cls: "event-import-errors-title",
				text: "Worth a look",
			});
			const list = box.createEl("ul");
			for (const w of warnings) list.createEl("li", { text: w });
		}

		renderPreview(contentEl, this.events);

		renderCategoryChips(contentEl, {
			app: this.app,
			label: "Categories (optional)",
			help: "Put on every imported event — say the team, or \"Sports\" — so they can be found together later.",
			selected: this.categories,
			known: ops.getEventCategories(),
			deleteScope: "event",
		});

		contentEl.createDiv({
			cls: "event-import-caution",
			text: "Are you sure this is correct? There is no way to bulk delete, you may have to do it by hand.",
		});

		const buttons = contentEl.createDiv({ cls: "callander-modal-buttons" });
		const back = buttons.createEl("button", {
			text: "Back",
			cls: "callander-modal-button",
		});
		back.addEventListener("click", () => this.close());
		const importBtn = buttons.createEl("button", {
			text: `Import ${formatCount(n, "event")}`,
			cls: "callander-modal-button mod-cta",
		});
		importBtn.addEventListener("click", () => {
			importBtn.disabled = true;
			back.disabled = true;
			importBtn.setText("Importing…");
			void this.runImport();
		});
	}

	/**
	 * A name as a link to the note it means: a note by that name, else a
	 * friend whose display name it is. Null when there's neither — it's
	 * still linked by name, and resolves if that note appears later.
	 */
	private resolvePerson(name: string): string | null {
		const direct = this.app.metadataCache.getFirstLinkpathDest(name, "");
		if (direct) return `[[${direct.basename}]]`;
		const key = name.toLowerCase();
		const friend = this.contacts.find(
			(c) =>
				c.displayName.toLowerCase() === key || c.name.toLowerCase() === key
		);
		return friend ? `[[${friend.file.basename}]]` : null;
	}

	private async runImport() {
		const ops = this.plugin.eventOperations;
		const touched = new Set<string>();
		let done = 0;
		let failed = 0;
		// One at a time: each create waits for the cache to catch up, and a
		// burst of parallel writes is how a sync client ends up with gaps.
		for (const e of this.events) {
			const people = e.people.map(
				(p) => this.resolvePerson(p) ?? `[[${p}]]`
			);
			try {
				const file = await ops.createEvent(
					{
						name: e.name,
						date: e.date || undefined,
						time: e.time || undefined,
						timezone: e.timezone || undefined,
						duration: e.duration || undefined,
						type: e.type,
						people,
						location: e.location || undefined,
						link: e.link || undefined,
						description: e.description || undefined,
						variant: "reminder",
						categories: [...this.categories],
					},
					// People's Events sections are rebuilt once at the end,
					// not once per event.
					{ refreshSections: false }
				);
				for (const path of ops.peoplePaths({ people, file })) {
					touched.add(path);
				}
				done++;
			} catch (error) {
				console.error(`Callander: couldn't import "${e.name}"`, error);
				failed++;
			}
		}
		if (touched.size > 0) await ops.refreshPersonSections([...touched]);
		new Notice(
			failed > 0
				? `Imported ${done} of ${formatCount(
						done + failed,
						"event"
				  )} — ${failed} couldn't be written (see the console).`
				: `Imported ${formatCount(done, "event")}`
		);
		this.close();
		this.onImported();
	}
}
