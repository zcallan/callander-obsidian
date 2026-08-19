import { Icon } from "@/ui/components/Icon";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/**
 * Unsorted thoughts captured against a plan, sitting above everything.
 *
 * Renders nothing at all when there are none — this is a nag strip, and an
 * empty nag is just a heading taking up the top of the page.
 */
export function PlanDraftsSection({
	store,
	drafts,
	onMakeIdea,
	onDiscard,
}: {
	store: ViewStore;
	/** Draft text in stored order; the index is what edits address. */
	drafts: () => string[];
	onMakeIdea: (index: number, text: string) => void;
	onDiscard: (index: number, text: string) => void;
}) {
	useViewRevision(store);
	const rows = drafts();
	if (rows.length === 0) return null;

	return (
		<div className="contact-drafts-strip">
			<div className="contact-idea-group-header">✏️ Drafts to sort</div>
			{rows.map((text, index) => (
				<div className="contact-draft-row" key={index}>
					<span className="contact-draft-text">{text}</span>
					<button
						className="callander-button"
						onClick={() => onMakeIdea(index, text)}
					>
						Make idea
					</button>
					<button
						className="callander-button button-icon button-danger"
						aria-label="Discard draft"
						onClick={() => onDiscard(index, text)}
					>
						<Icon name="trash-2" />
					</button>
				</div>
			))}
		</div>
	);
}
