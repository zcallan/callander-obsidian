import { Icon } from "@/ui/components/Icon";
import { GeneratedBadge } from "@/ui/components/GeneratedBadge";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/**
 * Unsorted thoughts captured against a plan, sitting above everything —
 * the ones with no day yet. One with a day sits on the Timeline instead
 * (see PlanOperations.timelineOf), which is what "Edit" here can hand it
 * off to, by giving it one.
 *
 * Shaped like the dashboard's own draft row: Make idea and Make event
 * leave the draft in place, since filing it as something else isn't the
 * same as being done with the thought — only the tick on the right is.
 *
 * Renders nothing at all when there are none — this is a nag strip, and an
 * empty nag is just a heading taking up the top of the page.
 */
export function PlanDraftsSection({
	store,
	drafts,
	isGenerated,
	onMakeIdea,
	onMakeEvent,
	onEdit,
	onDone,
}: {
	store: ViewStore;
	/** Draft text in stored order; the index is what edits address. */
	drafts: () => string[];
	/** Whether the draft at this index was added by Claude. */
	isGenerated: (index: number) => boolean;
	onMakeIdea: (index: number, text: string) => void;
	onMakeEvent: (text: string) => void;
	onEdit: (index: number, text: string) => void;
	onDone: (index: number, text: string) => void;
}) {
	useViewRevision(store);
	const rows = drafts();
	if (rows.length === 0) return null;

	return (
		<div className="contact-drafts-strip">
			<div className="contact-idea-group-header">✏️ Drafts to sort</div>
			{rows.map((text, index) => (
				<div className="contact-draft-row" key={index}>
					<span className="contact-draft-text">
						{text}
						<GeneratedBadge generated={isGenerated(index)} />
					</span>
					<button
						className="callander-button"
						onClick={() => onMakeIdea(index, text)}
					>
						Make idea
					</button>
					<button
						className="callander-button"
						onClick={() => onMakeEvent(text)}
					>
						Make event
					</button>
					<button
						className="callander-button button-icon"
						aria-label="Edit draft"
						onClick={() => onEdit(index, text)}
					>
						<Icon name="pencil" />
					</button>
					<button
						className="callander-button button-icon"
						aria-label="Done with this draft"
						onClick={() => onDone(index, text)}
					>
						<Icon name="checkmark" />
					</button>
				</div>
			))}
		</div>
	);
}
