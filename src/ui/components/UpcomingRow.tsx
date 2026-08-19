// The DOM's own MouseEvent, not the renderer's. Preact hands native events
// to handlers, and its own JSX event type is generic over the element — a
// handler taking the base type is assignable to it, so this stays neutral
// about which renderer is underneath.
import type { RowTone } from "@/utils/upcomingWhen";
import { Icon } from "@/ui/components/Icon";

/**
 * The two-line "when / what" row — the React twin of
 * components/UpcomingRow.ts, which the Events page still uses.
 *
 * Keeps the same class names deliberately: the styling lives in base.css and
 * is shared with the imperative version, so the two can't drift while both
 * exist. It moves to a module when the Events page comes across.
 */
export function UpcomingRow({
	icon,
	date,
	time,
	name,
	suffix,
	relative,
	tone,
	suffixTone,
	cancelled,
	action,
	onClick,
}: {
	icon: string;
	date: string;
	time?: string;
	name: string;
	suffix: string;
	relative: string;
	tone?: RowTone;
	suffixTone?: RowTone;
	cancelled?: boolean;
	action?: {
		icon: string;
		label: string;
		ariaLabel: string;
		onClick: (e: MouseEvent) => void;
	};
	onClick: () => void;
}) {
	// Rows without a date (missed birthdays) are single-line — skip the when
	// line entirely rather than leaving an empty gap above the name.
	const hasWhen = !!(icon || date || time);

	return (
		<div
			className="dashboard-row dashboard-row-clickable dashboard-upcoming-row"
			onClick={onClick}
		>
			<div className="dashboard-upcoming-main">
				{hasWhen && (
					<div className="dashboard-upcoming-when">
						{icon ? `${icon} ` : ""}
						{date}
						{time ? ` · ${time}` : ""}
					</div>
				)}
				<div className="dashboard-upcoming-name">
					<span className={cancelled ? "is-cancelled" : undefined}>
						{name}
					</span>
					{suffix && (
						<span
							className={[
								"dashboard-upcoming-person",
								suffixTone ? `dashboard-rel-${suffixTone}` : "",
								cancelled ? "is-cancelled-note" : "",
							]
								.filter(Boolean)
								.join(" ")}
						>
							{` • ${suffix}`}
						</span>
					)}
				</div>
			</div>

			{action ? (
				<button
					className="callander-button dashboard-row-action"
					aria-label={action.ariaLabel}
					onClick={action.onClick}
				>
					<Icon name={action.icon} />
					<span>{action.label}</span>
				</button>
			) : (
				relative && (
					<span
						className={`dashboard-upcoming-rel${
							tone ? ` dashboard-rel-${tone}` : ""
						}`}
					>
						{relative}
					</span>
				)
			)}
		</div>
	);
}
