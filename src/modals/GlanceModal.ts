import { App, Modal, TFile, setIcon } from "obsidian";
import type FriendTracker from "@/main";
import type { ContactWithCountdown, SomedayInfo } from "@/types";
import { EVENT_TYPES, IDEA_CATEGORIES, somedayType } from "@/constants";
import {
	parseFlexDate,
	formatShortFlexDate,
	formatRelativeFlex,
	formatTimeSince,
	flexSortKey,
	isFlexUpcoming,
	isFlexWithinLastMonths,
	resolveSpan,
} from "@/utils/flexdate";
import { splitLeadingEmoji } from "@/utils/emoji";
import { daysUntil } from "@/utils/somedaySort";

/** How far back "Last 12 months" reaches. */
const RECENT_MONTHS = 12;

/** One dated thing — an event or a plan — as the timeline lists want it. */
interface TimelineRow {
	key: number;
	/** How far off, in words: "in 5 days", "2 months ago". */
	when: string;
	emoji: string;
	text: string;
}

/**
 * The ten-second pre-hangout glance: who they are, open threads, what's
 * coming and what just happened — read-only, arrive as the friend who
 * remembers.
 */
export class GlanceModal extends Modal {
	constructor(
		app: App,
		private plugin: FriendTracker,
		private contact: ContactWithCountdown
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("glance-modal");
		contentEl.createEl("h2", { text: this.contact.displayName });

		const now = new Date();
		// Dividers come from CSS (.glance-group + .glance-group), so an
		// empty group must actually leave — otherwise it draws a rule with
		// nothing under it.
		this.group(contentEl, (el) => this.renderBasics(el));
		this.group(contentEl, (el) => {
			this.renderIdeas(el);
			this.renderSomedays(el, now);
		});
		this.group(contentEl, (el) => {
			this.renderUpcoming(el, now);
			this.renderRecent(el, now);
		});
		this.group(contentEl, (el) => this.renderActions(el));
	}

	private group(parent: HTMLElement, fill: (el: HTMLElement) => void) {
		const el = parent.createDiv({ cls: "glance-group" });
		fill(el);
		if (!el.hasChildNodes()) el.remove();
	}

	// ---- Who they are ----

	private renderBasics(container: HTMLElement) {
		const fact = (label: string, value: string) => {
			if (!value) return;
			const row = container.createDiv({ cls: "glance-fact" });
			row.createSpan({ cls: "glance-fact-label", text: label });
			row.createSpan({ cls: "glance-fact-value", text: value });
		};

		const birthday = parseFlexDate(this.contact.birthday);
		if (birthday && birthday.month !== null) {
			const days = this.contact.daysUntilBirthday;
			const countdown =
				days === null
					? ""
					: days === 0
					? "today! 🎂"
					: days === 1
					? "tomorrow"
					: `in ${days} days`;
			fact(
				"Birthday",
				`${formatShortFlexDate(birthday)}${
					countdown ? ` • ${countdown}` : ""
				}`
			);
		}

		const met = parseFlexDate(this.contact.met);
		if (met && met.year !== null) {
			const since = formatTimeSince(met);
			fact(
				"Met",
				`${formatShortFlexDate(met)}${since ? ` • ${since}` : ""}`
			);
		}
	}

	// ---- Open threads ----

	private renderIdeas(container: HTMLElement) {
		const openIdeas = this.contact.ideas.filter((i) => !i.done);
		// Conversations and plans first — gifts matter at birthdays, these
		// matter right now. The media categories are recommendation-shaped,
		// so they sit right beside it.
		const order = [
			"conversation",
			"activity",
			"place",
			"recommendation",
			"movie",
			"book",
			"show",
			"music",
			"gift",
			"other",
		];
		container.createDiv({
			cls: "glance-section-header",
			text: "💡 Ideas",
		});
		let any = false;
		for (const catId of order) {
			const cat = IDEA_CATEGORIES.find((c) => c.id === catId)!;
			const items = openIdeas.filter(
				(i) => (i.category as string) === catId
			);
			if (items.length === 0) continue;
			any = true;
			// A rung below the section header: the categories are a
			// breakdown of Ideas, not siblings of Upcoming and Somedays.
			container.createDiv({
				cls: "glance-subheader",
				text: `${cat.emoji} ${cat.plural}`,
			});
			const list = container.createEl("ul", { cls: "glance-list" });
			items.forEach((i) => list.createEl("li", { text: i.text }));
		}
		if (!any) {
			container.createDiv({
				cls: "section-helper-text",
				text: "No open ideas for them yet.",
			});
		}
	}

	/**
	 * Somedays this person is tagged in that are still doable — done and
	 * converted ones are history, and a closed "Within dates" window means
	 * the chance has gone.
	 */
	private renderSomedays(container: HTMLElement, now: Date) {
		const file = this.contact.file;
		const mine = this.plugin.somedayOperations
			.getSomedays()
			.filter((s) => {
				if (s.status === "done" || s.convertedTo) return false;
				const until = daysUntil(s.untilDate, now);
				if (until !== null && until < 0) return false;
				return this.linksTo(s.people, s.file, file);
			});
		if (mine.length === 0) return;

		container.createDiv({
			cls: "glance-section-header",
			text: "💭 Somedays",
		});
		const list = container.createEl("ul", { cls: "glance-list" });
		for (const s of mine) {
			list.createEl("li", { text: this.somedayLabel(s) });
		}
	}

	private somedayLabel(s: SomedayInfo): string {
		const lead = splitLeadingEmoji(s.name);
		if (lead) return s.name;
		const emoji = somedayType(s.types[0])?.emoji;
		return emoji ? `${emoji} ${s.name}` : s.name;
	}

	// ---- What's coming, what just happened ----

	/** Soonest first — the next thing you'll see them for leads. */
	private renderUpcoming(container: HTMLElement, now: Date) {
		const ahead = (f: NonNullable<ReturnType<typeof parseFlexDate>>) =>
			isFlexUpcoming(f, now);
		const rows = [
			...this.eventRows(ahead, now),
			...this.planRows("upcoming", now),
		].sort((a, b) => a.key - b.key);
		this.renderTimeline(container, "📌 Upcoming", rows);
	}

	/** Most recent first — both lists run outwards from today, so the rows
	 * nearest the middle of the modal are the ones nearest now. */
	private renderRecent(container: HTMLElement, now: Date) {
		const within = (f: NonNullable<ReturnType<typeof parseFlexDate>>) =>
			isFlexWithinLastMonths(f, RECENT_MONTHS, now);
		const rows = [
			...this.eventRows(within, now),
			...this.planRows("recent", now),
		].sort((a, b) => b.key - a.key);
		this.renderTimeline(container, "🕘 Last 12 months", rows);
	}

	private renderTimeline(
		container: HTMLElement,
		heading: string,
		rows: TimelineRow[]
	) {
		if (rows.length === 0) return;
		container.createDiv({ cls: "glance-section-header", text: heading });
		const list = container.createEl("ul", { cls: "glance-list" });
		for (const row of rows) {
			const li = list.createEl("li");
			li.createSpan({ text: `${row.emoji} ${row.text}` });
			if (row.when) {
				li.createSpan({
					cls: "glance-when",
					text: ` • ${row.when}`,
				});
			}
		}
	}

	/** This person's events whose date passes `keep`. */
	private eventRows(
		keep: (f: NonNullable<ReturnType<typeof parseFlexDate>>) => boolean,
		now: Date
	): TimelineRow[] {
		const rows: TimelineRow[] = [];
		for (const e of this.contact.events) {
			const f = parseFlexDate(e.date);
			if (!f || !keep(f)) continue;
			// The event's own name may lead with an emoji; otherwise its
			// type supplies one, and a bare calendar is the last resort.
			const lead = splitLeadingEmoji(e.name);
			const type = EVENT_TYPES.find((t) => t.id === e.type);
			rows.push({
				key: flexSortKey(f),
				when: formatRelativeFlex(f, now),
				emoji: lead ? lead.emoji : type?.emoji ?? "📅",
				text: lead ? lead.rest : e.name,
			});
		}
		return rows;
	}

	/**
	 * Plans this person is on, for one side of today or the other.
	 *
	 * Unlike an event a plan covers a span, so which date speaks for it
	 * depends on where that span sits — see resolveSpan. Because `past`
	 * decides the list and the date together, a plan can't land in both
	 * or fall through the gap between them.
	 */
	private planRows(mode: "upcoming" | "recent", now: Date): TimelineRow[] {
		const rows: TimelineRow[] = [];
		for (const plan of this.plugin.planOperations.getPlans()) {
			const start = parseFlexDate(plan.date);
			if (!start) continue;
			if (!this.linksTo(plan.members, plan.file, this.contact.file)) {
				continue;
			}
			const span = resolveSpan(start, parseFlexDate(plan.endDate), now);
			if (mode === "upcoming" ? span.past : !span.past) continue;
			if (
				mode === "recent" &&
				!isFlexWithinLastMonths(span.date, RECENT_MONTHS, now)
			) {
				continue;
			}
			const lead = splitLeadingEmoji(plan.name);
			rows.push({
				key: flexSortKey(span.date),
				// A plan you're in the middle of would otherwise read from
				// its start date — "3 days ago", under a heading that says
				// Upcoming.
				when: span.underway
					? "on now"
					: formatRelativeFlex(span.date, now),
				emoji: lead ? lead.emoji : "🗺️",
				text: lead ? lead.rest : plan.name,
			});
		}
		return rows;
	}

	/** Do any of these wikilinks resolve to `target`? */
	private linksTo(links: string[], from: TFile, target: TFile): boolean {
		return links.some((raw) => {
			const linktext = String(raw)
				.replace(/^\[\[|\]\]$/g, "")
				.split("|")[0]
				.trim();
			return (
				this.app.metadataCache.getFirstLinkpathDest(
					linktext,
					from.path
				)?.path === target.path
			);
		});
	}

	// ---- Actions ----

	private renderActions(container: HTMLElement) {
		const row = container.createDiv({ cls: "glance-actions" });
		const button = row.createEl("button", { cls: "callander-button" });
		setIcon(button, "user");
		button.createSpan({ text: "View person" });
		button.addEventListener("click", () => {
			this.close();
			void this.plugin.openContactPage(this.contact.file);
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
