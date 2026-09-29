import type { ContactWithCountdown } from "@/types";
import { parseFlexDate } from "@/utils/flexdate";
import { formatCount } from "@/utils/text";
import type { DashboardContext } from "@/views/DashboardView/context";

/** "On this day": events from earlier years on today's date, the most
 * recent year first. Nothing at all when there are none. */
export function renderOnThisDay(ctx: DashboardContext, container: HTMLElement) {
	const now = new Date();
	const month = now.getMonth() + 1;
	const day = now.getDate();
	const thisYear = now.getFullYear();

	const hits: Array<{
		contact: ContactWithCountdown;
		text: string;
		yearsAgo: number;
	}> = [];
	for (const c of ctx.data.contacts) {
		for (const event of c.events) {
			const p = parseFlexDate(event.date);
			if (p?.year == null || p.month == null || p.day == null) {
				continue;
			}
			if (p.month === month && p.day === day && p.year < thisYear) {
				hits.push({
					contact: c,
					text: event.name,
					yearsAgo: thisYear - p.year,
				});
			}
		}
	}
	if (hits.length === 0) return;
	hits.sort((a, b) => a.yearsAgo - b.yearsAgo);

	const section = container.createDiv({ cls: "dashboard-section" });
	section.createEl("h3", { text: "🕰️ On this day" });
	for (const hit of hits) {
		const row = section.createDiv({
			cls: "dashboard-row dashboard-row-clickable",
		});
		row.createSpan({ text: hit.text });
		row.createSpan({
			cls: "dashboard-row-meta",
			text: `${formatCount(
				hit.yearsAgo,
				"year"
			)} ago · ${hit.contact.displayName}`,
		});
		row.addEventListener("click", () =>
			void ctx.openContact(hit.contact.file)
		);
	}
}
