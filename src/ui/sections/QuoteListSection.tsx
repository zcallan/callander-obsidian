import { Icon } from "@/ui/components/Icon";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/** A line with optional context — the shape quotes and inside jokes share. */
export interface QuoteLike {
	text: string;
	context?: string;
}

/**
 * Quotes and inside jokes, which are the same list twice: a line of text and
 * a muted attribution under it.
 *
 * One component rather than two near-identical ones — they share every class
 * name, and the only real difference is whether the text is wrapped in
 * quotation marks. Tapping a row edits it; Delete lives in that modal, so
 * the list isn't carrying a permanent row of destructive buttons.
 */
export function QuoteListSection({
	store,
	items,
	helperText,
	addLabel,
	quoted = false,
	onOpen,
	onAdd,
}: {
	store: ViewStore;
	items: () => QuoteLike[];
	helperText: string;
	addLabel: string;
	/** Wraps the text in curly quotes — true for quotes, false for jokes. */
	quoted?: boolean;
	onOpen: (index: number) => void;
	onAdd: () => void;
}) {
	useViewRevision(store);
	const rows = items();

	return (
		<div className="contact-quotes-section">
			{rows.length === 0 && (
				<div className="section-helper-text">{helperText}</div>
			)}

			{rows.map((row, index) => (
				<div
					key={index}
					className="contact-quote-item plan-clickable-row"
					onClick={() => onOpen(index)}
				>
					<div className="contact-quote-text">
						{quoted ? `“${row.text}”` : row.text}
					</div>
					{row.context && (
						<div className="contact-quote-context">
							{`— ${row.context}`}
						</div>
					)}
				</div>
			))}

			<div className="contact-section-footer">
				<button className="callander-button" onClick={onAdd}>
					<Icon name="plus" />
					<span>{addLabel}</span>
				</button>
			</div>
		</div>
	);
}
