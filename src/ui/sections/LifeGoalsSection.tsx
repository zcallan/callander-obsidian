import type { LifeGoal } from "@/types";
import { groupLifeGoals } from "@/utils/lifeGoals";
import { Icon } from "@/ui/components/Icon";
import { useViewRevision, type ViewStore } from "@/ui/viewStore";

/**
 * Things they want to do someday.
 *
 * Completed goals stay on the page under their own heading rather than
 * disappearing — the record is half the point, and "they finally did it" is
 * worth being able to see.
 */
export function LifeGoalsSection({
	store,
	goals,
	onOpen,
	onAdd,
}: {
	store: ViewStore;
	goals: () => LifeGoal[];
	onOpen: (index: number) => void;
	onAdd: () => void;
}) {
	useViewRevision(store);
	const all = goals();
	const { open, completed } = groupLifeGoals(all);

	const row = ({ goal, index }: { goal: LifeGoal; index: number }) => (
		<div
			key={index}
			className={`contact-funfact-item plan-clickable-row contact-life-goal${
				goal.done ? " is-done" : ""
			}`}
			onClick={() => onOpen(index)}
		>
			<span className="contact-life-goal-text">{goal.text}</span>
			{/* Says a note exists without spending a line quoting it — the
			    note is the reason you'd open the goal. */}
			{goal.notes && <span className="contact-life-goal-note">📝</span>}
		</div>
	);

	return (
		<div className="contact-funfacts-section">
			{all.length === 0 && (
				<div className="section-helper-text">
					Things they want to do someday — learn Spanish, run a
					marathon. Worth asking about when it's been a while.
				</div>
			)}

			{open.map(row)}

			{completed.length > 0 && (
				<>
					<div className="plan-quick-idea-group">Completed</div>
					{completed.map(row)}
				</>
			)}

			<div className="contact-section-footer">
				<button className="callander-button" onClick={onAdd}>
					<Icon name="plus" />
					<span>Add life goal</span>
				</button>
			</div>
		</div>
	);
}
