import { INTEREST_CATEGORIES } from "@/constants";
import type { Interest } from "@/types";
import { Icon } from "@/ui/components/Icon";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/**
 * What they're into, grouped by category in the fixed category order.
 *
 * The ordering is the constant's, not the data's: interests accumulate in
 * whatever order they were added, and reading them back grouped is the only
 * way a long list stays scannable.
 *
 * Categories are normalised by the caller, which owns the legacy-key
 * mapping — this only asks which bucket each one landed in.
 */
export function InterestsSection({
	store,
	interests,
	categoryOf,
	onEdit,
	onMakeIdea,
	onAdd,
}: {
	store: ViewStore;
	interests: () => Interest[];
	categoryOf: (interest: Interest) => string;
	/** Opens the interest in its edit modal, where Delete lives too. */
	onEdit: (index: number) => void;
	onMakeIdea: (index: number) => void;
	onAdd: () => void;
}) {
	useViewRevision(store);
	const all = interests();

	return (
		<div className="contact-interests-section">
			{all.length === 0 && (
				<div className="section-helper-text">
					What they're into — books, music, teams, the food they love.
					Handy for gifts, plans, and picking a conversation back up.
				</div>
			)}

			{INTEREST_CATEGORIES.map((cat) => {
				const items = all
					.map((interest, index) => ({ interest, index }))
					.filter(({ interest }) => categoryOf(interest) === cat.id);
				if (items.length === 0) return null;

				return (
					<div className="contact-idea-group" key={cat.id}>
						<div className="contact-idea-group-header">
							{`${cat.emoji} ${cat.plural}`}
						</div>
						<div className="contact-interest-chips">
							{items.map(({ interest, index }) => (
								<div
									className="contact-interest-chip"
									key={index}
								>
									<span>{interest.text}</span>
									{[interest.detail, interest.detail2]
										.filter(Boolean)
										.map((value, i) => (
											<span
												className="contact-interest-chip-detail"
												key={i}
											>
												{` · ${value}`}
											</span>
										))}
									{/* The note isn't shown on the chip — a marker says one
									    exists and shows it on hover, so a chip stays one
									    line however much was written. */}
									{interest.notes && (
										<span
											className="contact-interest-chip-note"
										>
											<Icon name="document" />
											{/* Not an aria-label: Obsidian's tooltip for
											    those waits about a second, and the note should
											    show on hover straight away. CSS draws this as
											    the tooltip on hover and keeps it screen-reader
											    text the rest of the time. */}
											<span className="contact-interest-chip-note-tip">
												{interest.notes}
											</span>
										</span>
									)}
									<button
										className="contact-interest-chip-action"
										aria-label="Edit"
										data-tooltip-position="top"
										onClick={() => onEdit(index)}
									>
										<Icon name="pencil" />
									</button>
									<button
										className="contact-interest-chip-action"
										aria-label="Make idea"
										data-tooltip-position="top"
										onClick={() => onMakeIdea(index)}
									>
										<Icon name="lightbulb" />
									</button>
								</div>
							))}
						</div>
					</div>
				);
			})}

			{/* Capture goes through the modal, below the list. */}
			<div className="contact-section-footer">
				<button className="callander-button" onClick={onAdd}>
					Add interest
				</button>
			</div>
		</div>
	);
}
