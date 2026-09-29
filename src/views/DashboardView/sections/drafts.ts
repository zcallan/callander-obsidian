import type { ContactOperations } from "@/services/ContactOperations";
import { Notice, setIcon } from "obsidian";
import type { ContactWithCountdown } from "@/types";
import type { LedgerDraft } from "@/utils/draftsMarkdown";
import { CaptureTargetModal, QuickIdeaModal } from "@/modals/QuickIdeaModal";
import { EventModal } from "@/modals/EventModal";
import { DraftEditModal } from "@/modals/DraftEditModal";
import { wholeDaysBetween } from "@/utils/dates";
import type { DashboardContext } from "@/views/DashboardView/context";

export function renderDrafts(ctx: DashboardContext, container: HTMLElement) {
	const ops = ctx.plugin.contactOperations;
	// The checklist in the dashboard note. Ticked drafts are kept there
	// as a record and simply aren't listed here — but the index each one
	// carries is its place in the whole list, which is what the actions
	// address it by.
	const all = ctx.data.drafts
		.map((draft, index) => {
			const about = ops.draftAbout(draft);
			return {
				draft,
				index,
				contact: about
					? ctx.data.contacts.find((c) => c.file.path === about.path) ??
					  null
					: null,
			};
		})
		.filter((item) => !item.draft.done)
		// Newest first. Stable, so drafts from the same day keep the
		// order they were captured in.
		.sort((a, b) =>
			(b.draft.created || "").localeCompare(a.draft.created || "")
		);

	if (all.length === 0) return;

	const wrap = container.createDiv({
		cls: "dashboard-section plan-accordion dashboard-drafts-accordion",
	});
	const header = wrap.createDiv({
		cls: "dashboard-section-header plan-accordion-header",
	});
	// Count in the heading so a collapsed section still says how much is
	// waiting — otherwise collapsing it hides the fact there's anything
	// to triage at all.
	const heading = header.createEl("h3", { text: "✏️ Drafts" });
	heading.createSpan({
		cls: "dashboard-count-badge",
		text: String(all.length),
	});
	setIcon(
		header.createSpan({ cls: "plan-accordion-chevron" }),
		"chevron-down"
	);
	const section = wrap.createDiv({ cls: "plan-accordion-body" });

	const applyOpen = () =>
		wrap.toggleClass("is-open", !ctx.plugin.settings.draftsCollapsed);
	applyOpen();
	header.addEventListener("click", () => {
		ctx.plugin.settings.draftsCollapsed =
			!ctx.plugin.settings.draftsCollapsed;
		applyOpen();
		// Persisted rather than held on the view: the dashboard is torn
		// down and rebuilt on every open, so in-memory state would spring
		// back open each time.
		void ctx.plugin.saveSettings();
	});

	for (const item of all) {
		renderDraftRow(ctx, section, item, ops);
	}
}

/**
 * One draft: its text (editable in place), when it was captured, and a
 * row of what to do with it. "View person" only shows for a draft
 * already sitting on someone's page — an inbox draft has nobody to view
 * yet, that's what "Make idea" and "Add event" are for.
 */
export function renderDraftRow(ctx: DashboardContext, section: HTMLElement, item: {
		draft: LedgerDraft;
		index: number;
		contact: ContactWithCountdown | null;
	}, ops: ContactOperations) {
	const row = section.createDiv({ cls: "dashboard-row dashboard-draft-row" });
	const main = row.createDiv({ cls: "dashboard-draft-main" });

	const textEl = main.createDiv({ cls: "dashboard-draft-text" });
	textEl.createSpan({ text: item.draft.text });
	const age = draftAge(ctx, item.draft.created);
	if (item.contact || age) {
		textEl.createSpan({
			cls: "dashboard-row-date",
			text: ` · ${[item.contact?.displayName, age.replace(/^ · /, "")]
				.filter(Boolean)
				.join(" · ")}`,
		});
	}

	const actions = main.createDiv({ cls: "dashboard-draft-actions" });
	// Icon plus label on desktop, where there's room; icon only on
	// mobile, where four-plus buttons a row need to fit — the label
	// collapses via .dashboard-draft-action-label under .is-mobile,
	// same breakpoint the rest of the app uses. Edit (below) skips this;
	// it's icon-only everywhere already.
	if (item.contact) {
		const file = item.contact.file;
		const viewButton = actions.createEl("button", {
			cls: "callander-button dashboard-row-action dashboard-draft-action-adaptive",
			attr: { "aria-label": "View person", "data-tooltip-position": "top" },
		});
		setIcon(viewButton, "user");
		viewButton.createSpan({
			cls: "dashboard-draft-action-label",
			text: "View person",
		});
		viewButton.addEventListener("click", () => void ctx.openContact(file));
	}
	const ideaButton = actions.createEl("button", {
		cls: "callander-button dashboard-row-action dashboard-draft-action-adaptive",
		attr: { "aria-label": "Make idea", "data-tooltip-position": "top" },
	});
	setIcon(ideaButton, "lightbulb");
	ideaButton.createSpan({
		cls: "dashboard-draft-action-label",
		text: "Make idea",
	});
	ideaButton.addEventListener("click", () =>
		categorizeDraft(ctx, item.draft, item.contact)
	);
	const eventButton = actions.createEl("button", {
		cls: "callander-button dashboard-row-action dashboard-draft-action-adaptive",
		attr: { "aria-label": "Add event", "data-tooltip-position": "top" },
	});
	setIcon(eventButton, "calendar-plus");
	eventButton.createSpan({
		cls: "dashboard-draft-action-label",
		text: "Add event",
	});
	eventButton.addEventListener("click", () =>
		draftToEvent(ctx, item.draft, item.contact)
	);

	const editButton = actions.createEl("button", {
		cls: "callander-button button-icon dashboard-row-action",
		attr: { "aria-label": "Edit draft", "data-tooltip-position": "top" },
	});
	setIcon(editButton, "pencil");
	editButton.addEventListener("click", () => {
		// A modal, not the old in-place textarea: reassigning who a
		// draft is about needs a second field, and a row has no room
		// for one.
		new DraftEditModal(
			ctx.app,
			ctx.data.contacts,
			item.draft.text,
			item.contact,
			async (text, contact) => {
				await ops.updateDraft(item.index, item.draft.text, {
					text,
					about: contact?.file ?? null,
				});
			}
		).open();
	});

	// Off to the right, level with the text — the one action that
	// finishes with a draft, apart from the ones that do something with it.
	const doneWrap = row.createDiv({ cls: "dashboard-draft-done" });
	const doneButton = doneWrap.createEl("button", {
		cls: "callander-button dashboard-row-action",
		attr: { "aria-label": "Done with this draft" },
	});
	setIcon(doneButton, "checkmark");
	doneButton.createSpan({ text: "Done" });
	doneButton.addEventListener("click", () => {
		void (async () => {
			// Ticked in the note, not deleted from it: that's the record.
			await ops.completeDraft(item.index, item.draft.text);
		})();
	});
}

export function draftAge(ctx: DashboardContext, created: string): string {
	if (!created) return "";
	const [y, m, d] = created.split("-").map(Number);
	if (!y || !m || !d) return "";
	const days = wholeDaysBetween(new Date(y, m - 1, d), new Date());
	if (days <= 0) return " · today";
	if (days === 1) return " · yesterday";
	return ` · ${days}d ago`;
}

/**
 * File a draft as a proper categorized idea. The draft itself stays where
 * it is until it's marked Done — filing it is only one of the things you
 * might do with a thought, and the record is better for showing that it
 * was still open when you did.
 */
export function categorizeDraft(
	ctx: DashboardContext,
	draft: LedgerDraft,
	contact: ContactWithCountdown | null
) {
	const ops = ctx.plugin.contactOperations;
	const finish = () => new Notice("💡 Filed as idea");

	if (contact) {
		new QuickIdeaModal(
			ctx.app,
			contact.displayName,
			ctx.plugin.lastQuickIdeaCategory,
			async (category, text) => {
				ctx.plugin.lastQuickIdeaCategory = category;
				await ops.addIdea(contact.file, category, text);
				finish();
			},
			draft.text
		).open();
	} else {
		// Ideas carry categories; plans take bucketed items — exclude
		// plans from draft categorization to keep the shapes straight
		const targets = ctx.plugin
			.buildCaptureTargets(ctx.data.contacts)
			.filter((t) => t.kind !== "plan");
		new CaptureTargetModal(ctx.app, targets, (target) => {
			new QuickIdeaModal(
				ctx.app,
				target.kind === "inbox" ? "the inbox" : target.label,
				ctx.plugin.lastQuickIdeaCategory,
				async (category, text) => {
					ctx.plugin.lastQuickIdeaCategory = category;
					const file = await target.getFile();
					await ops.addIdea(file, category, text);
					finish();
				},
				draft.text
			).open();
		}).open();
	}
}

/**
 * Turn a draft into an event, seeded with its text as the name and its
 * person (if any) as a locked attendee. Like Make idea, this leaves the
 * draft to be ticked off by hand — saving the event is not the same
 * thing as being done with the thought.
 */
export function draftToEvent(
	ctx: DashboardContext,
	draft: LedgerDraft,
	contact: ContactWithCountdown | null
) {
	const people = contact ? [`[[${contact.file.basename}]]`] : [];
	new EventModal(
		ctx.app,
		ctx.plugin,
		null,
		undefined,
		{ name: draft.text, people },
		people
	).open();
}
