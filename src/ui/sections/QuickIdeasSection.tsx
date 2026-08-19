import { PLAN_IDEA_CATEGORIES } from "@/constants";
import { PlanOperations } from "@/services/PlanOperations";
import {
	formatItemCost,
	formatItemTime,
	formatQuickIdeaDates,
	startsWithEmoji,
} from "@/utils/planFormat";
import type { PlanQuickIdea } from "@/types";
import { Icon } from "@/ui/components/Icon";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/** One parked idea: type emoji, text, then the days it could happen on. */
function QuickIdeaRow({
	idea,
	people,
	onClick,
}: {
	idea: PlanQuickIdea;
	/** Already shortened by the caller, which owns the plan's roster. */
	people: string;
	onClick: () => void;
}) {
	const type = PLAN_IDEA_CATEGORIES.find((c) => c.id === idea.type);
	const emoji = type && !startsWithEmoji(idea.text) ? `${type.emoji} ` : "";

	// The candidate days are what distinguishes this from a timeline row, so
	// they lead the meta rather than trailing it.
	const metaBits: string[] = [];
	if (idea.dates && idea.dates.length > 0) {
		metaBits.push(formatQuickIdeaDates(idea.dates));
	}
	if (idea.time) metaBits.push(formatItemTime(idea.time));
	if (idea.cost !== undefined) metaBits.push(formatItemCost(idea.cost));

	return (
		<div
			className="contact-timeline-item plan-timeline-item timeline-idea plan-quick-idea-row"
			onClick={onClick}
		>
			<div className="contact-timeline-dot timeline-dot-idea" />
			<div className="contact-timeline-text">
				{`${emoji}${idea.text}`}
				{metaBits.length > 0 && (
					<span className="plan-travel-meta">
						{`  ·  ${metaBits.join("  ·  ")}`}
					</span>
				)}
			</div>
			{people && <div className="plan-travel-people">{people}</div>}
		</div>
	);
}

/**
 * Ideas parked against the plan — things you might do, with no day
 * committed. Grouped by the plan's own categories when any are set.
 *
 * An idea in two categories appears under both, deliberately: the grouping
 * is a lens, not a filing cabinet. Each row carries the idea's real index so
 * a click in any group edits the one object.
 */
export function QuickIdeasSection({
	store,
	ideas,
	shortenPeople,
	onOpen,
	onAdd,
}: {
	store: ViewStore;
	ideas: () => PlanQuickIdea[];
	shortenPeople: (people: string) => string;
	onOpen: (index: number) => void;
	onAdd: () => void;
}) {
	useViewRevision(store);
	const all = ideas();
	const groups = PlanOperations.groupQuickIdeas(all);

	return (
		<div className="contact-ideas-section plan-items-section">
			{all.length === 0 && (
				<div className="section-helper-text">
					Things you could do — a restaurant someone mentioned, a game
					while you're in town. Give one a day when you're ready and it
					moves to the timeline.
				</div>
			)}

			{groups.map((group, g) => (
				<div key={group.label || `ungrouped-${g}`}>
					{/* A blank label is the single ungrouped case — nothing is
					    categorised, so a heading would name a distinction
					    that isn't being drawn. */}
					{group.label && (
						<div className="plan-quick-idea-group">
							{group.label}
						</div>
					)}
					{group.entries.map(({ idea, index }) => (
						<QuickIdeaRow
							key={index}
							idea={idea}
							people={
								idea.people ? shortenPeople(idea.people) : ""
							}
							onClick={() => onOpen(index)}
						/>
					))}
				</div>
			))}

			<div className="contact-section-footer">
				<button className="callander-button" onClick={onAdd}>
					<Icon name="plus" />
					<span>Add idea</span>
				</button>
			</div>
		</div>
	);
}
