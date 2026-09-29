import { Notice, TFile } from "obsidian";
import type { Idea, Interest } from "@/types";
import { ResurfaceModal } from "@/modals/ResurfaceModal";
import { QuickIdeaModal } from "@/modals/QuickIdeaModal";
import { INTEREST_CATEGORIES, EventType } from "@/constants";
import { todayISO } from "@/utils/flexdate";
import { asArray } from "@/utils/fm";
import {
	ideaLogText,
	interestIdeaText,
	normalizeIdeaCategory,
	normalizeInterestCategory,
} from "@/utils/contactPage";
import { saveModel, writeIdeas } from "@/views/ContactPageView/persistence";
import type { PageContext } from "@/views/ContactPageView/context";
import type { ContactPageModel } from "@/views/ContactPageView/model";

/** A notice with a button in it stays up long enough to reach the button. */
const ACTION_NOTICE_MS = 8000;

// A checked-off idea is usually something that just happened — offer to
// put it on the timeline with one click
export function offerLogAsEvent(
	ctx: PageContext,
	model: ContactPageModel,
	idea: Idea
) {
	const eventText = ideaLogText(idea);
	// The person whose idea it was: the notice outlives the page, which
	// may be showing someone else by the time the button is clicked.
	const file = model.file;

	const fragment = createFragment();
	fragment.createSpan({ text: "Idea done! " });
	const logButton = fragment.createEl("button", {
		cls: "callander-button contact-log-event-button",
		text: "Log on timeline",
	});

	const notice = new Notice(fragment, ACTION_NOTICE_MS);
	const logIdeaAsEvent = async () => {
		notice.hide();
		const today = todayISO();
		// Gifts given get their own type; everything else was time spent
		const type: EventType =
			normalizeIdeaCategory(idea) === "gift" ? "given" : "hangout";
		await addEvent(ctx, model, today, eventText, type, file);
		new Notice("Added to timeline");
	};
	logButton.addEventListener("click", () => void logIdeaAsEvent());
}

/**
 * File a draft as an idea. The draft stays until it's marked Done — the
 * same as from the dashboard — so this only adds the idea.
 */
export function promoteDraftToIdea(
	ctx: PageContext,
	model: ContactPageModel,
	_index: number,
	text: string
) {
	new QuickIdeaModal(
		ctx.app,
		model.data.displayName || model.data.name || "",
		ctx.ui.lastIdeaCategory,
		async (category, ideaText) => {
			ctx.ui.lastIdeaCategory = category;
			await writeIdeas(ctx, model, [
				...model.ideas(),
				{ category, text: ideaText, done: false },
			]);
			await saveModel(ctx, model);
			ctx.render();
		},
		text
	).open();
}

export async function toggleIdeaDone(
	ctx: PageContext,
	model: ContactPageModel,
	index: number,
	done: boolean
) {
	const list = model.ideas();
	const idea = list[index];
	if (!idea) return;
	list[index] = { ...idea, done };
	await writeIdeas(ctx, model, list);
	await saveModel(ctx, model);
	ctx.render();
	// A checked idea is usually something that just happened — offer to
	// put it on the timeline with one click.
	if (done) offerLogAsEvent(ctx, model, idea);
}

export function openResurfaceModal(
	ctx: PageContext,
	model: ContactPageModel,
	index: number
) {
	const idea = model.ideas()[index];
	if (!idea) return;
	new ResurfaceModal(
		ctx.app,
		idea.text,
		idea.resurface,
		async (resurface) => {
			const list = model.ideas();
			const next = { ...list[index] };
			if (resurface) next.resurface = resurface;
			else delete next.resurface;
			list[index] = next;
			await writeIdeas(ctx, model, list);
			await saveModel(ctx, model);
			ctx.render();
		}
	).open();
}

export async function deleteIdea(
	ctx: PageContext,
	model: ContactPageModel,
	index: number
) {
	const list = model.ideas();
	list.splice(index, 1);
	await writeIdeas(ctx, model, list);
	await saveModel(ctx, model);
	ctx.render();
}

export function openAddIdeaModal(ctx: PageContext, model: ContactPageModel) {
	new QuickIdeaModal(
		ctx.app,
		model.data.displayName || model.data.name || "",
		ctx.ui.lastIdeaCategory,
		async (category, text) => {
			ctx.ui.lastIdeaCategory = category;
			await writeIdeas(ctx, model, [
				...model.ideas(),
				{ category, text, done: false },
			]);
			// The body write leaves frontmatter alone, so the
			// last-updated stamp has to be set separately.
			await saveModel(ctx, model);
			ctx.render();
		}
	).open();
}

/**
 * The same modal, reopened on an existing idea — category, text, and
 * whether it still carries the "added by Claude" flag are editable;
 * done and resurface ride along untouched.
 */
export function openEditIdeaModal(
	ctx: PageContext,
	model: ContactPageModel,
	index: number,
	idea: Idea
) {
	new QuickIdeaModal(
		ctx.app,
		model.data.displayName || model.data.name || "",
		normalizeIdeaCategory(idea),
		async (category, text, generated) => {
			ctx.ui.lastIdeaCategory = category;
			const list = model.ideas();
			const updated: Idea = { ...list[index], category, text };
			// Absence over a false flag, same as every other removable
			// marker in this note — a cleared tag leaves no trace.
			if (generated) updated.generated = true;
			else delete updated.generated;
			list[index] = updated;
			await writeIdeas(ctx, model, list);
			await saveModel(ctx, model);
			ctx.render();
		},
		idea.text,
		async () => deleteIdea(ctx, model, index),
		idea.generated
	).open();
}

/**
 * An idea seeded from an interest — its name, with the first detail in
 * brackets ("East of Eden (John Steinbeck)"), filed under the idea
 * category the interest's type points at. Editable before it's saved.
 */
export function makeIdeaFromInterest(
	ctx: PageContext,
	model: ContactPageModel,
	index: number
) {
	const interest = (asArray(model.data.interests) as Interest[])[
		index
	];
	if (!interest) return;
	const type = INTEREST_CATEGORIES.find(
		(c) => c.id === normalizeInterestCategory(interest)
	);
	const text = interestIdeaText(interest);
	new QuickIdeaModal(
		ctx.app,
		model.data.displayName || model.data.name || "",
		type?.ideaCategory ?? ctx.ui.lastIdeaCategory,
		async (category, ideaText) => {
			ctx.ui.lastIdeaCategory = category;
			await writeIdeas(ctx, model, [
				...model.ideas(),
				{ category, text: ideaText, done: false },
			]);
			// The body write leaves frontmatter alone, so the
			// last-updated stamp has to be set separately.
			await saveModel(ctx, model);
			ctx.render();
		},
		text
	).open();
}

/** Log a quick event on this page's timeline (idea done → timeline). */
export async function addEvent(
	ctx: PageContext,
	model: ContactPageModel,
	date: string,
	text: string,
	type: EventType,
	file: TFile | null = model.file
) {
	if (!file) return;
	await ctx.plugin.eventOperations.createEvent({
		name: text,
		date,
		type,
		people: [`[[${file.basename}]]`],
		// Added from someone's page: a record of them, not a calendar
		// entry, so it stays on their timeline.
		variant: "timeline",
	});
}
