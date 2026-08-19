import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/** A diary entry that links to this person. */
export interface DiaryMention {
	path: string;
	date: string;
	title: string;
}

/**
 * Diary entries that mention this person, resolved from the link index
 * rather than by reading any diary bodies.
 *
 * Silent when there are none — a heading over an empty list would imply
 * you'd written about them and it had gone missing.
 */
export function DiaryMentionsSection({
	store,
	mentions,
	onOpen,
}: {
	store: ViewStore;
	mentions: () => DiaryMention[];
	onOpen: (path: string) => void;
}) {
	useViewRevision(store);
	const rows = mentions();
	if (rows.length === 0) return null;

	return (
		<div className="contact-diary-mentions">
			<div className="contact-idea-group-header">📖 Mentioned in diary</div>
			{rows.map((entry) => (
				<a
					key={entry.path}
					className="contact-diary-mention-row"
					onClick={(e) => {
						e.preventDefault();
						onOpen(entry.path);
					}}
				>
					{`${entry.date} — ${entry.title}`}
				</a>
			))}
		</div>
	);
}
