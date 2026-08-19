import { Icon } from "@/ui/components/Icon";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/**
 * Small things worth remembering about someone — a flat list of lines.
 *
 * Tapping a row edits it; Delete lives in that modal, so the list isn't
 * carrying a permanent row of destructive buttons.
 */
export function FunFactsSection({
	store,
	facts,
	onOpen,
	onAdd,
}: {
	store: ViewStore;
	facts: () => string[];
	onOpen: (index: number) => void;
	onAdd: () => void;
}) {
	useViewRevision(store);
	const rows = facts();

	return (
		<div className="contact-funfacts-section">
			{rows.length === 0 ? (
				<div className="section-helper-text">
					A line or two worth remembering — where you met, an inside
					joke, what they're into.
				</div>
			) : (
				<div className="contact-funfacts-list">
					{rows.map((fact, index) => (
						<div
							key={index}
							className="contact-funfact-item plan-clickable-row"
							onClick={() => onOpen(index)}
						>
							<span className="contact-funfact-text">{fact}</span>
						</div>
					))}
				</div>
			)}

			<div className="contact-section-footer">
				<button className="callander-button" onClick={onAdd}>
					<Icon name="plus" />
					<span>Add fun fact</span>
				</button>
			</div>
		</div>
	);
}
