import { IDEA_CATEGORIES } from "@/constants";
import type { Idea } from "@/types";
import { formatFlexDate, parseFlexDate } from "@/utils/flexdate";
import { Icon } from "@/ui/components/Icon";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/**
 * Things to do with, give, or say to this friend — grouped by category in
 * the fixed category order, with done ideas sinking to the bottom of their
 * own group rather than leaving the list.
 *
 * A checked idea is usually something that just happened, so the caller
 * offers to log it on the timeline; that lives in the view, which owns the
 * event machinery.
 */
export function IdeasSection({
	store,
	ideas,
	categoryOf,
	onToggleDone,
	onResurface,
	onDelete,
	onAdd,
}: {
	store: ViewStore;
	ideas: () => Idea[];
	categoryOf: (idea: Idea) => string;
	onToggleDone: (index: number, done: boolean) => void;
	onResurface: (index: number) => void;
	onDelete: (index: number) => void;
	onAdd: () => void;
}) {
	useViewRevision(store);
	const all = ideas();

	return (
		<div className="contact-ideas-section">
			{all.length === 0 && (
				<div className="section-helper-text">
					Jot quick thoughts for this friend — gifts to give,
					conversations to pick back up, things to do together, places
					to go.
				</div>
			)}

			{IDEA_CATEGORIES.map((cat) => {
				const items = all
					.map((idea, index) => ({ idea, index }))
					.filter(({ idea }) => categoryOf(idea) === cat.id)
					// Open first, done sink to the bottom of the group.
					.sort(
						(a, b) => Number(!!a.idea.done) - Number(!!b.idea.done)
					);
				if (items.length === 0) return null;

				return (
					<div className="contact-idea-group" key={cat.id}>
						<div className="contact-idea-group-header">
							{`${cat.emoji} ${cat.plural}`}
						</div>
						{items.map(({ idea, index }) => {
							const parsed = idea.resurface
								? parseFlexDate(idea.resurface)
								: null;
							return (
								<div
									key={index}
									className={`contact-idea-item ${
										idea.done ? "done" : ""
									}`}
								>
									<input
										type="checkbox"
										aria-label="Mark idea as done"
										checked={!!idea.done}
										onChange={(e) =>
											onToggleDone(
												index,
												e.currentTarget.checked
											)
										}
									/>
									<div className="contact-idea-text">
										{idea.text}
										{parsed && (
											<span className="contact-idea-resurface-badge">
												{` ⏰ ${formatFlexDate(
													parsed
												)}`}
											</span>
										)}
									</div>
									<button
										className="callander-button button-icon"
										aria-label="Resurface this idea later"
										onClick={() => onResurface(index)}
									>
										<Icon name="alarm-clock" />
									</button>
									<button
										className="callander-button button-icon button-danger"
										aria-label="Delete idea"
										onClick={() => onDelete(index)}
									>
										<Icon name="trash-2" />
									</button>
								</div>
							);
						})}
					</div>
				);
			})}

			{/* Capture goes through the modal, below the list. */}
			<div className="contact-section-footer">
				<button className="callander-button" onClick={onAdd}>
					Add idea
				</button>
			</div>
		</div>
	);
}
