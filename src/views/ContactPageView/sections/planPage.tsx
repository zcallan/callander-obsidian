import { setIcon } from "obsidian";
import { AccommodationSection } from "@/ui/sections/AccommodationSection";
import { BringSection } from "@/ui/sections/BringSection";
import { PlanDraftsSection } from "@/ui/sections/PlanDraftsSection";
import { QuickIdeasSection } from "@/ui/sections/QuickIdeasSection";
import { PlanTimelineSection } from "@/ui/sections/PlanTimelineSection";
import { PlanExpensesSection } from "@/ui/sections/PlanExpensesSection";
import { PlanMembersSection } from "@/ui/sections/PlanMembersSection";
import { PlanOperations } from "@/services/PlanOperations";
import { creditsOf, expensesOf } from "@/utils/expenseMath";
import { toText } from "@/utils/fm";
import {
	completePlanDraft,
	draftIsGenerated,
	editPlanDraft,
	promotePlanDraft,
	promotePlanDraftToEvent,
} from "@/views/ContactPageView/actions/planDrafts";
import {
	confirmPlanMember,
	openAddPlanMember,
	planMemberChips,
	planMemberCount,
	planParticipants,
	removePlanEntry,
	shortenPlanPeople,
} from "@/views/ContactPageView/actions/planMembers";
import {
	openQuickIdeaModal,
	openQuickIdeaView,
} from "@/views/ContactPageView/actions/planQuickIdeas";
import {
	openCostShare,
	openIdeaShare,
	openPlanShare,
	openStayShare,
} from "@/views/ContactPageView/actions/share";
import {
	addBringItem,
	openPlanAccommodationModal,
	openPlanIdeaModal,
	openPlanTravelModal,
	planRangeDays,
	removeBringItem,
	updateBringItem,
} from "@/views/ContactPageView/actions/planItems";
import {
	confirmDeleteTimelineEntry,
	editTimelineEntry,
	openTimelineEntry,
} from "@/views/ContactPageView/actions/planTimeline";
import {
	openAddExpense,
	openBreakdown,
	openCostView,
	openCreditModal,
} from "@/views/ContactPageView/actions/planCosts";
import type { PageContext } from "@/views/ContactPageView/context";
import { makeActivatable } from "@/components/activatable";

/** A plan's own page shape: members, buckets, notes. */
export function renderPlanPage(ctx: PageContext, container: HTMLElement) {
	container.appendChild(
		ctx.island(
			"plan-drafts",
			<PlanDraftsSection
				store={ctx.store}
				drafts={() => ctx.model.planDrafts().map((d) => d.text)}
				isGenerated={(i) => draftIsGenerated(ctx, ctx.model, i)}
				onMakeIdea={(index, text) =>
					promotePlanDraft(ctx, ctx.model, index, text)
				}
				onMakeEvent={(text) =>
					promotePlanDraftToEvent(ctx, ctx.model, text)
				}
				onEdit={(index, text) =>
					editPlanDraft(ctx, ctx.model, index, text)
				}
				onDone={(index, text) =>
					void completePlanDraft(ctx, ctx.model, index, text)
				}
			/>
		)
	);

	const planContent = container.createDiv({
		cls: "contact-content contact-content-stacked",
	});
	/**
	 * One section of the stacked plan page.
	 *
	 * Pass `collapseId` and it folds, remembering its state across
	 * plans and restarts — the view is rebuilt from scratch on every
	 * vault event, so anything held in memory would spring back open.
	 *
	 * Returns whatever the caller should append content to: the
	 * section itself when it's fixed, the foldable body when it
	 * isn't. Both sit inside `.contact-stack-section`, so a caller
	 * reaching back up for the header can `closest()` either way.
	 */
	const planSection = (
		icon: string,
		label: string,
		collapseId?: string,
		/** How many items are inside — shown while it's folded, so
		 * a closed section says what's in it without being opened.
		 * Zero is worth saying too: "nothing here yet" is the
		 * answer you opened the section to find. */
		count?: number
	) => {
		const wrap = planContent.createDiv({
			cls: "contact-stack-section",
		});
		const header = wrap.createDiv({
			cls: "contact-stack-header",
		});
		setIcon(
			header.createSpan({ cls: "contact-stack-header-icon" }),
			icon
		);
		const title = header.createSpan({ text: label });
		if (!collapseId) return wrap;

		if (count !== undefined) {
			// The dashboard's own badge, so a count reads the same
			// wherever it appears. CSS drops it once the section is
			// open — see .plan-accordion.is-open .plan-accordion-count.
			header.createSpan({
				cls: "dashboard-count-badge plan-accordion-count",
				text: String(count),
			});
		}

		wrap.addClass("plan-accordion");
		header.addClass("plan-accordion-header");
		// Last in the header, and `margin-left: auto` carries it to
		// the far edge — anything a caller adds afterwards is
		// inserted ahead of it rather than beyond it.
		setIcon(
			header.createSpan({ cls: "plan-accordion-chevron" }),
			"chevron-down"
		);
		const body = wrap.createDiv({ cls: "plan-accordion-body" });

		const collapsed = () =>
			collapsedPlanSections(ctx).includes(collapseId);
		const apply = () => {
			wrap.toggleClass("is-open", !collapsed());
			title.setAttribute("aria-expanded", String(!collapsed()));
		};
		apply();
		const toggle = () => {
			const current = collapsedPlanSections(ctx);
			ctx.plugin.settings.planSectionsCollapsed = collapsed()
				? current.filter((id) => id !== collapseId)
				: [...current, collapseId];
			apply();
			ctx.saveLayoutSetting();
		};
		header.addEventListener("click", (event) => {
			// Headers can carry controls of their own — the
			// timeline's "Copy as text" — and folding the section
			// out from under a click meant for one of those is not
			// what anybody pressed.
			const target = event.target as HTMLElement | null;
			if (target?.closest("button")) return;
			toggle();
		});
		// Those controls are why the header isn't a button itself: the
		// keyboard folds the section from its title instead.
		makeActivatable(title, toggle, {
			keysOnly: true,
			focusKey: `section:${collapseId}`,
		});
		return body;
	};

	const memberCount = planMemberCount(ctx, ctx.model);
	planSection("users", `Who's in (${memberCount})`).appendChild(
		ctx.island(
			"plan-members",
			<PlanMembersSection
				store={ctx.store}
				yourName={() => ctx.plugin.settings.yourName}
				members={() => planMemberChips(ctx, ctx.model, "members")}
				unconfirmed={() =>
					planMemberChips(ctx, ctx.model, "unconfirmedMembers")
				}
				onOpen={(path) =>
					void ctx.app.workspace.openLinkText(path, "", false)
				}
				onRemove={(index) =>
					void removePlanEntry(ctx, ctx.model, "members", index)
				}
				onConfirm={(index) =>
					void confirmPlanMember(ctx, ctx.model, index)
				}
				onRemoveUnconfirmed={(index) =>
					void removePlanEntry(
						ctx,
						ctx.model,
						"unconfirmedMembers",
						index
					)
				}
				onAdd={() => void openAddPlanMember(ctx, ctx.model)}
			/>
		)
	);
	planSection(
		"lightbulb",
		"Ideas",
		"ideas",
		PlanOperations.quickIdeasOf(ctx.model.data).length
	).appendChild(
		ctx.island(
			"quick-ideas",
			<QuickIdeasSection
				store={ctx.store}
				ideas={() =>
					PlanOperations.quickIdeasOf(ctx.model.data)
				}
				shortenPeople={(people) =>
					shortenPlanPeople(ctx, ctx.model, people)
				}
				onOpen={(index) => openQuickIdeaView(ctx, ctx.model, index)}
				onAdd={() => openQuickIdeaModal(ctx, ctx.model, null, null)}
				onCopy={() => openIdeaShare(ctx, ctx.model)}
			/>
		)
	);
	const timelineWrap = planSection(
		"calendar-clock",
		"Timeline",
		"timeline",
		PlanOperations.timelineOf(ctx.model.data).length
	);
	timelineWrap.appendChild(
		ctx.island(
			"plan-timeline",
			<PlanTimelineSection
				store={ctx.store}
				entries={() =>
					PlanOperations.timelineOf(ctx.model.data)
				}
				undated={() =>
					PlanOperations.undatedIdeaEntries(ctx.model.data)
				}
				rangeDays={() => planRangeDays(ctx, ctx.model)}
				shortenPeople={(people) =>
					shortenPlanPeople(ctx, ctx.model, people)
				}
				onOpen={(entry) => openTimelineEntry(ctx, ctx.model, entry)}
				onEdit={(entry) => editTimelineEntry(ctx, ctx.model, entry)}
				onDelete={(entry) =>
					confirmDeleteTimelineEntry(ctx, ctx.model, entry)
				}
				onAddItem={(day) =>
					openPlanIdeaModal(ctx, ctx.model, null, null, day)
				}
				onAddTravel={(day) =>
					openPlanTravelModal(ctx, ctx.model, null, null, day)
				}
				onCopy={() => openPlanShare(ctx, ctx.model)}
			/>
		)
	);
	// Ported to React — the host is created once and re-attached on
	// every render, so the section keeps its own subscription.
	planSection(
		"bed",
		"Accommodation",
		"accommodation",
		PlanOperations.simpleListOf(ctx.model.data, "accommodation")
			.length
	).appendChild(
		ctx.island(
			"accommodation",
			<AccommodationSection
				store={ctx.store}
				items={() =>
					PlanOperations.simpleListOf(
						ctx.model.data,
						"accommodation"
					)
				}
				onOpen={(index, item) =>
					openPlanAccommodationModal(ctx, ctx.model, index, item)
				}
				onCopy={() => openStayShare(ctx, ctx.model)}
			/>
		)
	);
	planSection(
		"backpack",
		"What to bring",
		"bring",
		PlanOperations.bringOf(ctx.model.data).length
	).appendChild(
		ctx.island(
			"bring",
			<BringSection
				store={ctx.store}
				items={() => PlanOperations.bringOf(ctx.model.data)}
				onToggle={(index, done) =>
					void updateBringItem(ctx, ctx.model, index, done)
				}
				onRemove={(index) =>
					void removeBringItem(ctx, ctx.model, index)
				}
				onAdd={(text) => void addBringItem(ctx, ctx.model, text)}
			/>
		)
	);
	planSection(
		"dollar-sign",
		"Cost breakdown",
		"costs",
		// Both halves of what the section lists.
		expensesOf(ctx.model.data).length +
			creditsOf(ctx.model.data).length
	).appendChild(
		ctx.island(
			"plan-expenses",
			<PlanExpensesSection
				store={ctx.store}
				costs={() => expensesOf(ctx.model.data)}
				credits={() => creditsOf(ctx.model.data)}
				participants={() => planParticipants(ctx, ctx.model)}
				yourName={() => ctx.plugin.settings.yourName}
				// Read, never written any more: settling moved into
				// the ledger, where it changes the figure rather than
				// only striking it through. Existing vaults still
				// carry the flag, and dropping it would un-settle
				// whoever was ticked off under the old scheme.
				paid={() =>
					Array.isArray(ctx.model.data.costsPaid)
						? ctx.model.data.costsPaid.map((v) => toText(v))
						: []
				}
				onOpenCost={(index, cost) =>
					openCostView(ctx, ctx.model, index, cost)
				}
				onOpenCredit={(index, credit) =>
					openCreditModal(ctx, ctx.model, index, credit)
				}
				onBreakdown={(person) => openBreakdown(ctx, ctx.model, person)}
				onAddExpense={() => openAddExpense(ctx, ctx.model)}
				onAddCredit={() => openCreditModal(ctx, ctx.model, null, null)}
				onCopy={() => openCostShare(ctx, ctx.model, { kind: "all" })}
			/>
		)
	);
	// A plan's body holds nothing generated, so its Notes *are* its
	// markdown — the "Links & details" render that used to follow
	// would show the same text a second time. Its "Edit markdown"
	// lives on in Notes.
	planSection("pencil", "Notes").appendChild(ctx.notes.island());
}

/** Collapsed plan sections, tolerant of a hand-edited data.json. */
function collapsedPlanSections(ctx: PageContext): string[] {
	const saved = ctx.plugin.settings.planSectionsCollapsed;
	return Array.isArray(saved) ? saved.map((v) => toText(v)) : [];
}
