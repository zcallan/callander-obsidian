import { IDEA_CATEGORIES } from "@/constants";
import type { Idea } from "@/types";
import { formatFlexDate, parseFlexDate } from "@/utils/flexdate";
import { Icon } from "@/ui/components/Icon";
import { GeneratedBadge } from "@/ui/components/GeneratedBadge";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/** An idea with the index it's stored at, for the callbacks below. */
interface IndexedIdea {
	idea: Idea;
	index: number;
}

/**
 * Things to do with, give, or say to this friend — grouped by category in
 * the fixed category order. Done ideas move out of the list entirely and
 * into one disclosure at the bottom, closed by default — the same move
 * the cost breakdown makes for people who've settled up: what's done is
 * the record, not the to-do, and doesn't need to compete with it for room.
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
	onEdit,
	onResurface,
	onDelete,
	onAdd,
}: {
	store: ViewStore;
	ideas: () => Idea[];
	categoryOf: (idea: Idea) => string;
	onToggleDone: (index: number, done: boolean) => void;
	onEdit: (index: number) => void;
	onResurface: (index: number) => void;
	onDelete: (index: number) => void;
	onAdd: () => void;
}) {
	useViewRevision(store);
	const all = ideas();

	const indexed = all.map((idea, index) => ({ idea, index }));
	const open = indexed.filter(({ idea }) => !idea.done);
	const done = indexed.filter(({ idea }) => !!idea.done);

	/** `items`, grouped into the fixed category order — categories with
	 * nothing in this subset are left out rather than drawing an empty
	 * header. */
	const byCategory = (items: IndexedIdea[]) =>
		IDEA_CATEGORIES.map((cat) => ({
			cat,
			items: items.filter(({ idea }) => categoryOf(idea) === cat.id),
		})).filter((group) => group.items.length > 0);

	const row = ({ idea, index }: IndexedIdea) => {
		const parsed = idea.resurface ? parseFlexDate(idea.resurface) : null;
		return (
			<div
				key={index}
				className={`contact-idea-item ${idea.done ? "done" : ""}`}
			>
				<input
					type="checkbox"
					aria-label="Mark idea as done"
					checked={!!idea.done}
					onChange={(e) =>
						onToggleDone(index, e.currentTarget.checked)
					}
				/>
				<div className="contact-idea-text">
					{idea.text}
					{parsed && (
						<span className="contact-idea-resurface-badge">
							{` ⏰ ${formatFlexDate(parsed)}`}
						</span>
					)}
					<GeneratedBadge generated={idea.generated} />
				</div>
				<button
					className="callander-button button-icon"
					aria-label="Edit idea"
					onClick={() => onEdit(index)}
				>
					<Icon name="pencil" />
				</button>
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
	};

	const group = ({
		cat,
		items,
	}: {
		cat: (typeof IDEA_CATEGORIES)[number];
		items: IndexedIdea[];
	}) => (
		<div className="contact-idea-group" key={cat.id}>
			<div className="contact-idea-group-header">
				{`${cat.emoji} ${cat.plural}`}
			</div>
			{items.map(row)}
		</div>
	);

	return (
		<div className="contact-ideas-section">
			{all.length === 0 && (
				<div className="section-helper-text">
					Jot quick thoughts for this friend — gifts to give,
					conversations to pick back up, things to do together, places
					to go.
				</div>
			)}

			{byCategory(open).map(group)}

			{done.length > 0 && (
				<details className="contact-ideas-done-group">
					<summary className="contact-ideas-done-summary">
						<Icon
							name="chevron-down"
							className="contact-ideas-done-chevron"
						/>
						<span>Show completed ideas</span>
					</summary>
					{byCategory(done).map(group)}
				</details>
			)}

			{/* Capture goes through the modal, below the list. */}
			<div className="contact-section-footer">
				<button className="callander-button" onClick={onAdd}>
					Add idea
				</button>
			</div>
		</div>
	);
}
