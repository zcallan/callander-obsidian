import { App, Modal, setIcon } from "obsidian";
import type { PlanInfo } from "@/types";
import { PlanOperations } from "@/services/PlanOperations";
import { formatFlexDate, parseFlexDate } from "@/utils/flexdate";
import { summarisePeople } from "@/utils/nameFormat";
import { resolvePeopleInfo } from "@/utils/people";
import { upcomingWhen } from "@/utils/upcomingWhen";
import { formatCount } from "@/utils/text";

/**
 * A plan at a glance, from the dashboard's Upcoming list or the Events page.
 *
 * The dashboard is a page you read, not one you work from, and a plan is a
 * whole page of its own — so tapping one there opens this rather than
 * navigating away from everything else you were looking at. It answers "what
 * is this and is it in hand?" and offers the trip itself for anything more.
 *
 * Deliberately not the plan page in miniature: no editing, no sections, no
 * counts of things you'd only act on from the plan itself.
 */
export class PlanGlanceModal extends Modal {
	constructor(
		app: App,
		private plan: PlanInfo,
		private onOpenPlan: () => void,
		/** Takes the plan off whichever list opened this, or puts it back. */
		private onSetHidden?: (hidden: boolean) => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("someday-view-modal");

		contentEl.createEl("h2", { text: this.plan.name });

		const when = upcomingWhen(this.plan.date, new Date());
		// formatFlexDate takes the parsed shape, and a plan's date is stored
		// at whatever precision it was given — "2026-10" is a real answer.
		const show = (raw: string) => {
			const parsed = parseFlexDate(raw);
			return parsed ? formatFlexDate(parsed) : "";
		};
		const from = show(this.plan.date);
		const to = show(this.plan.endDate);
		const dates = from && to ? `${from} – ${to}` : from;
		if (dates) {
			const line = contentEl.createDiv({ cls: "someday-view-meta" });
			line.appendText(`📅 ${dates}`);
			// The countdown is the reason it's on the dashboard at all.
			if (when.relative) line.appendText(` · ${when.relative}`);
		}
		if (this.plan.location) {
			contentEl.createDiv({
				cls: "someday-view-meta",
				text: `📍 ${this.plan.location}`,
			});
		}

		const people = resolvePeopleInfo(
			this.app,
			this.plan.file.path,
			this.plan.members
		);
		if (people.length > 0) {
			contentEl.createDiv({
				cls: "someday-view-meta",
				// Summarised the same way the row that opened this is — a
				// glance shouldn't be the first place a long roster unfolds.
				text: `👥 ${summarisePeople(people, 4)}`,
			});
		}

		// What's actually been decided. Nothing here is a link: the plan
		// itself is one tap away and does all of this better.
		const counts = this.summary();
		if (counts) {
			contentEl.createDiv({ cls: "someday-view-meta", text: counts });
		}

		contentEl.createDiv({ cls: "someday-view-divider" });

		// Its own class alongside the shared one: someday-view-actions is
		// reused by half a dozen other view modals, most with a single
		// full-width primary button by design, so the natural-width
		// override below has to land only here.
		const actions = contentEl.createDiv({
			cls: "someday-view-actions plan-glance-actions",
		});
		const open = actions.createEl("button", {
			cls: "callander-button button-primary",
		});
		setIcon(open, "milestone");
		open.createSpan({ text: "View full plan" });
		open.addEventListener("click", () => {
			this.close();
			this.onOpenPlan();
		});

		// A trip you're not thinking about yet still belongs in Plans; it
		// just isn't what "what's next" means. Closes on the way out — the
		// row that opened this is about to disappear from under it.
		if (this.onSetHidden) {
			const hide = actions.createEl("button", {
				cls: "callander-button",
			});
			setIcon(hide, "eye");
			hide.createSpan({ text: "Hide from this list" });
			hide.addEventListener("click", () => {
				this.close();
				void this.onSetHidden!(true);
			});
		}
	}

	/**
	 * "4 on the timeline · 2 stays · 3 to bring", skipping whatever is
	 * empty — a plan early on has none of it, and a row of zeroes says
	 * nothing except that you haven't started.
	 */
	private summary(): string {
		const data = this.app.metadataCache.getFileCache(this.plan.file)
			?.frontmatter;
		if (!data) return "";
		const bits: string[] = [];
		const timeline = PlanOperations.timelineOf(data).length;
		const stays = PlanOperations.simpleListOf(data, "accommodation").length;
		const bring = PlanOperations.bringOf(data).length;
		if (timeline > 0) bits.push(`${timeline} on the timeline`);
		if (stays > 0) bits.push(formatCount(stays, "stay"));
		if (bring > 0) bits.push(`${bring} to bring`);
		return bits.join(" · ");
	}

	onClose() {
		this.contentEl.empty();
	}
}
