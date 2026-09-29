import {
	DiaryMentionsSection,
	type DiaryMention,
} from "@/ui/sections/DiaryMentionsSection";
import type { EventInfo, FriendEvent } from "@/types";
import { openAddEventModal } from "@/views/ContactPageView/actions/person";
import type { PageContext } from "@/views/ContactPageView/context";
import type { ContactPageModel } from "@/views/ContactPageView/model";

/** This page's events, derived from the Events/ files that link here. */
export function eventsList(
	ctx: PageContext,
	model: ContactPageModel
): EventInfo[] {
	return model.file
		? ctx.plugin.eventOperations.eventsFor(model.file)
		: [];
}

export function renderEventsSection(ctx: PageContext, container: HTMLElement) {
	const eventsSection = container.createDiv({
		cls: "contact-events-section",
	});

	const headerContainer = eventsSection.createDiv({
		cls: "contact-events-header",
	});

	const events = eventsList(ctx, ctx.model);
	const planRows = planTimelineRows(ctx, ctx.model);

	// Add helper text if no events yet — a plan they're on counts, so
	// someone with only plans still gets a timeline rather than a nudge.
	if (events.length === 0 && planRows.length === 0) {
		headerContainer.createDiv({
			cls: "section-helper-text",
			text: "Log things that happened — meetups, their life events, memorable outings.",
		});
	}

	if (events.length > 0 || planRows.length > 0 || ctx.model.data.met) {
		ctx.eventTimeline.render(
			eventsSection,
			events,
			ctx.model.data.met,
			planRows
		);
	}

	// Add button sits below the timeline
	const footer = eventsSection.createDiv({
		cls: "contact-section-footer",
	});
	const addButton = footer.createEl("button", {
		cls: "callander-button",
		text: "Add event",
	});
	addButton.addEventListener("click", () => {
		void openAddEventModal(ctx, ctx.model);
	});

	eventsSection.appendChild(
		ctx.island(
			"diary-mentions",
			<DiaryMentionsSection
				store={ctx.store}
				mentions={() => diaryMentions(ctx, ctx.model)}
				onOpen={(path) =>
					void ctx.app.workspace.openLinkText(path, "", true)
				}
			/>
		)
	);
}

/**
 * Plans this person is a member of, shaped as timeline rows.
 *
 * Derived on every render rather than written onto their note: the plan
 * owns its membership, so adding or dropping someone shows up here at
 * once, with nothing stored to fall out of step. That's the same
 * arrangement PlanOperations.timelineOf uses for a plan's own itinerary.
 *
 * Covers upcoming plans as well as finished ones — an upcoming plan is
 * exactly the kind of thing worth seeing on someone's page, and because
 * it's derived it simply disappears if they end up not coming.
 */
export function planTimelineRows(
	ctx: PageContext,
	model: ContactPageModel
): FriendEvent[] {
	const file = model.file;
	// Plan and group pages get their own layouts; only a person's
	// timeline should list the plans they're on.
	if (!file || model.kind === "plan" || model.kind === "group") return [];

	return ctx.plugin.planOperations
		.getPlans()
		.filter((plan) =>
			plan.members.some((raw) => {
				const linktext = String(raw).replace(/^\[\[|\]\]$/g, "");
				return (
					ctx.app.metadataCache.getFirstLinkpathDest(
						linktext,
						plan.file.path
					)?.path === file.path
				);
			})
		)
		.map((plan) => ({
			date: plan.date,
			text: plan.name,
			type: "hangout" as const,
			// Marks the row as plan-derived: drives the 🗺️ badge and the
			// click-through, and is never persisted to the person's note.
			plan: `[[${plan.file.basename}]]`,
		}));
}

// Diary entries that [[link]] to this friend — Obsidian-native, via backlinks
/** Diary entries linking to this person, from the link index alone. */
export function diaryMentions(
	ctx: PageContext,
	model: ContactPageModel
): DiaryMention[] {
	const file = model.file;
	if (!file) return [];
	// Metadata-only: no diary bodies are read just to check for links.
	const resolved = ctx.app.metadataCache.resolvedLinks;
	return ctx.plugin.diaryOperations
		.getEntriesMeta()
		.filter((e) => (resolved[e.file.path]?.[file.path] ?? 0) > 0)
		.map((e) => ({ path: e.file.path, date: e.date, title: e.title }));
}
