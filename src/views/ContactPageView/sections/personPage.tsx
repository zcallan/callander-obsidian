import { setIcon } from "obsidian";
import { FunFactsSection } from "@/ui/sections/FunFactsSection";
import { LifeGoalsSection } from "@/ui/sections/LifeGoalsSection";
import { QuoteListSection } from "@/ui/sections/QuoteListSection";
import { InterestsSection } from "@/ui/sections/InterestsSection";
import { IdeasSection } from "@/ui/sections/IdeasSection";
import { PersonDraftsSection } from "@/ui/sections/PersonDraftsSection";
import { GroupMembersSection } from "@/ui/sections/GroupMembersSection";
import { DeleteSection } from "@/ui/sections/DeleteSection";
import type { Interest } from "@/types";
import { asArray } from "@/utils/fm";
import {
	normalizeIdeaCategory,
	normalizeInterestCategory,
} from "@/utils/contactPage";
import {
	completeAboutDraft,
	confirmDeletePerson,
	editDraft,
	openAddGroupMember,
	openAddInterestModal,
	openEditInterestModal,
	openFunFactModal,
	openInsideJokeModal,
	openLifeGoalModal,
	openLifeGoalView,
	openQuoteModal,
	removeGroupMember,
} from "@/views/ContactPageView/actions/person";
import {
	deleteIdea,
	makeIdeaFromInterest,
	openAddIdeaModal,
	openEditIdeaModal,
	openResurfaceModal,
	promoteDraftToIdea,
	toggleIdeaDone,
} from "@/views/ContactPageView/actions/ideas";
import { renderEventsSection } from "@/views/ContactPageView/sections/events";
import { renderExtrasSection } from "@/views/ContactPageView/sections/extras";
import type { PageContext } from "@/views/ContactPageView/context";
import { renderAbout } from "@/views/ContactPageView/sections/about";

export function renderPersonPage(ctx: PageContext, container: HTMLElement) {
	// Friends get the attribute fields; groups get a members list instead
	if (ctx.model.kind === "group") {
		const membersSection = container.createDiv({
			cls: "contact-info-section",
		});
		membersSection.appendChild(
			ctx.island(
				"group-members",
				<GroupMembersSection
					groupName={() =>
						ctx.model.file?.basename.toLowerCase() ?? ""
					}
					onOpen={(path) =>
						void ctx.app.workspace.openLinkText(path, "", false)
					}
					onRemove={(contact) =>
						void removeGroupMember(ctx, ctx.model, contact)
					}
					onAdd={(candidates) =>
						openAddGroupMember(ctx, ctx.model, candidates)
					}
				/>
			)
		);
	} else {
		renderAbout(ctx, container);
	}

	// Drafts awaiting triage sit above everything — they're unfinished
	container.appendChild(
		ctx.island(
			"person-drafts",
			<PersonDraftsSection
				store={ctx.store}
				drafts={() => ctx.model.aboutDrafts.map((a) => a.draft.text)}
				isGenerated={(i) => !!ctx.model.aboutDrafts[i]?.draft.generated}
				onMakeIdea={(index, text) =>
					promoteDraftToIdea(ctx, ctx.model, index, text)
				}
				onEdit={(index, text) => editDraft(ctx, ctx.model, index, text)}
				onDone={(index) =>
					void completeAboutDraft(ctx, ctx.model, index)
				}
			/>
		)
	);

	// Stacked sections: Ideas first, then Timeline, then Notes, then
	// the raw-markdown extras. (Tabs may return one day — each section
	// is still its own render method, so flipping back is trivial.)
	const contentContainer = container.createDiv({
		cls: "contact-content contact-content-stacked",
	});

	section(contentContainer, "lightbulb", "Ideas").appendChild(
		ctx.island(
			"ideas",
			<IdeasSection
				store={ctx.store}
				ideas={() => ctx.model.ideas()}
				categoryOf={(idea) => normalizeIdeaCategory(idea)}
				onToggleDone={(index, done) =>
					void toggleIdeaDone(ctx, ctx.model, index, done)
				}
				onEdit={(index) =>
					openEditIdeaModal(
						ctx,
						ctx.model,
						index,
						ctx.model.ideas()[index]
					)
				}
				onResurface={(index) =>
					openResurfaceModal(ctx, ctx.model, index)
				}
				onDelete={(index) => void deleteIdea(ctx, ctx.model, index)}
				onAdd={() => openAddIdeaModal(ctx, ctx.model)}
			/>
		)
	);
	renderEventsSection(
		ctx,
		section(contentContainer, "milestone", "Timeline")
	);
	// Interests + fun facts + jokes + quotes are about the friend —
	// friends only
	if (ctx.model.kind !== "group") {
		section(contentContainer, "heart", "Interests").appendChild(
			ctx.island(
				"interests",
				<InterestsSection
					store={ctx.store}
					interests={() =>
						asArray(ctx.model.data.interests) as Interest[]
					}
					categoryOf={(interest) =>
						normalizeInterestCategory(interest)
					}
					onEdit={(index) =>
						openEditInterestModal(ctx, ctx.model, index)
					}
					onMakeIdea={(index) =>
						makeIdeaFromInterest(ctx, ctx.model, index)
					}
					onAdd={() => openAddInterestModal(ctx, ctx.model)}
				/>
			)
		);
		// Directly under Interests: both answer "what are they into",
		// one in the present tense and one in the future.
		section(contentContainer, "milestone", "Life goals").appendChild(
			ctx.island(
				"life-goals",
				<LifeGoalsSection
					store={ctx.store}
					goals={() => ctx.model.lifeGoals()}
					onOpen={(index) => openLifeGoalView(ctx, ctx.model, index)}
					onAdd={() => openLifeGoalModal(ctx, ctx.model, null, null)}
				/>
			)
		);
		section(contentContainer, "sparkles", "Fun facts").appendChild(
			ctx.island(
				"fun-facts",
				<FunFactsSection
					store={ctx.store}
					facts={() => ctx.model.funFacts()}
					onOpen={(index) =>
						openFunFactModal(
							ctx,
							ctx.model,
							index,
							ctx.model.funFacts()[index]
						)
					}
					onAdd={() => openFunFactModal(ctx, ctx.model, null, null)}
				/>
			)
		);
		section(contentContainer, "laugh", "Inside jokes").appendChild(
			ctx.island(
				"inside-jokes",
				<QuoteListSection
					store={ctx.store}
					items={() => ctx.model.insideJokes()}
					helperText="The jokes only the two of you get — keep them from fading."
					addLabel="Add inside joke"
					onOpen={(index) =>
						openInsideJokeModal(
							ctx,
							ctx.model,
							index,
							ctx.model.insideJokes()[index]
						)
					}
					onAdd={() =>
						openInsideJokeModal(ctx, ctx.model, null, null)
					}
				/>
			)
		);
		section(contentContainer, "quote", "Quotes").appendChild(
			ctx.island(
				"quotes",
				<QuoteListSection
					store={ctx.store}
					items={() => ctx.model.quotes()}
					helperText="Memorable things they've said — the one-liners you don't want to forget."
					addLabel="Add quote"
					quoted
					onOpen={(index) =>
						openQuoteModal(
							ctx,
							ctx.model,
							index,
							ctx.model.quotes()[index]
						)
					}
					onAdd={() => openQuoteModal(ctx, ctx.model, null, null)}
				/>
			)
		);
	}
	section(contentContainer, "pencil", "Notes").appendChild(
		ctx.notes.island()
	);
	// Raw markdown is reference material, not something you scan on every
	// visit — collapsed by default, with the Edit button left outside so
	// it stays one click away.
	const markdown = collapsibleSection(
		contentContainer,
		"document",
		"Markdown",
		ctx.ui.markdownOpen,
		(open) => {
			ctx.ui.markdownOpen = open;
			if (open) drawMarkdown();
		}
	);
	const drawMarkdown = renderExtrasSection(ctx, markdown.wrap, markdown.body);
	if (ctx.ui.markdownOpen) drawMarkdown();

	// Last thing on the page, below everything else. Plans have their own
	// delete inside the edit modal, and a group's page deletes through
	// the group modal — this is people only.
	if (ctx.model.kind === "person") {
		container.appendChild(
			ctx.island(
				"delete",
				<DeleteSection
					onDelete={() => confirmDeletePerson(ctx, ctx.model)}
				/>
			)
		);
	}
}

/** One section of the stacked page: an icon, a label, then its content. */
function section(parent: HTMLElement, icon: string, label: string) {
	const wrap = parent.createDiv({
		cls: "contact-stack-section",
	});
	const header = wrap.createDiv({
		cls: "contact-stack-header",
	});
	setIcon(
		header.createSpan({ cls: "contact-stack-header-icon" }),
		icon
	);
	header.createSpan({ text: label });
	return wrap;
}

/**
 * Same header, but its content collapses. Returns the body to fill
 * and the wrap, so a caller can put controls *outside* the collapsed
 * area — the Markdown section keeps its Edit button reachable while
 * the content itself is hidden.
 */
function collapsibleSection(
	parent: HTMLElement,
	icon: string,
	label: string,
	open: boolean,
	onToggle: (next: boolean) => void
) {
	const wrap = parent.createDiv({
		cls: "contact-stack-section plan-accordion",
	});
	const header = wrap.createDiv({
		cls: "contact-stack-header plan-accordion-header",
	});
	setIcon(
		header.createSpan({ cls: "contact-stack-header-icon" }),
		icon
	);
	header.createSpan({ cls: "plan-accordion-label", text: label });
	setIcon(
		header.createSpan({ cls: "plan-accordion-chevron" }),
		"chevron-down"
	);
	const body = wrap.createDiv({ cls: "plan-accordion-body" });
	wrap.toggleClass("is-open", open);
	header.addEventListener("click", () => {
		open = !open;
		wrap.toggleClass("is-open", open);
		onToggle(open);
	});
	return { wrap, body };
}
