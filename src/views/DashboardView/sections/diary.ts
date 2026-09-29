import { shortenMemberNames, shortNameOverrides } from "@/utils/nameFormat";
import type { DashboardContext } from "@/views/DashboardView/context";

/** How many recent diary entries the dashboard shows. */
const DASHBOARD_DIARY_ENTRIES = 3;

export function renderDiary(ctx: DashboardContext, container: HTMLElement) {
	const section = container.createDiv({
		cls: "dashboard-section",
	});
	const header = section.createDiv({
		cls: "dashboard-section-header",
	});
	header.createEl("h3", { text: "📖 Diary" });
	const buttons = header.createDiv({
		cls: "dashboard-section-buttons",
	});
	const newButton = buttons.createEl("button", {
		cls: "callander-button",
		text: "New entry",
	});
	newButton.addEventListener("click", () =>
		ctx.plugin.openNewDiaryEntry()
	);
	const openButton = buttons.createEl("button", {
		cls: "callander-button",
		text: "Open diary",
	});
	openButton.addEventListener("click", () =>
		void ctx.plugin.activateDiaryView({ here: true })
	);

	const entries = ctx.plugin.diaryOperations
		.getEntriesMeta()
		.slice(0, DASHBOARD_DIARY_ENTRIES);
	if (entries.length === 0) {
		section.createDiv({
			cls: "section-helper-text",
			text: "No entries yet — each one files under the date it's about.",
		});
		return;
	}

	const resolvedLinks = ctx.app.metadataCache.resolvedLinks;
	// Shortened against every friend, not per entry: disambiguation has
	// to be stable, or the same person would read "Riley" on an entry
	// where she's alone and "Riley S" on one she shares with another
	// Riley. Built once — the roster doesn't change between rows.
	const shortByPath = new Map(
		shortenMemberNames(
			ctx.data.contacts.map((c) => c.displayName),
			shortNameOverrides(ctx.data.contacts)
		).map((short, i) => [ctx.data.contacts[i].file.path, short])
	);
	for (const entry of entries) {
		const row = section.createDiv({
			cls: "dashboard-row dashboard-row-clickable dashboard-diary-row",
		});
		const main = row.createDiv({
			cls: "dashboard-diary-main",
		});
		main.createSpan({ text: entry.title });

		// Second line: tagged friends (when any), then the date
		const links = resolvedLinks[entry.file.path] ?? {};
		const tagged = ctx.data.contacts
			.filter((c) => (links[c.file.path] ?? 0) > 0)
			.map((c) => shortByPath.get(c.file.path) ?? c.displayName);
		const detailParts: string[] = [];
		if (tagged.length > 0) {
			detailParts.push(`with ${tagged.join(", ")}`);
		}
		const dateLabel = formatEntryDate(ctx, entry.date);
		if (dateLabel) detailParts.push(dateLabel);
		if (detailParts.length > 0) {
			row.createDiv({
				cls: "dashboard-diary-tagged",
				text: detailParts.join(" · "),
			});
		}

		row.addEventListener("click", () =>
			void ctx.app.workspace.getLeaf(false).openFile(entry.file)
		);
	}
}

export function formatEntryDate(
	ctx: DashboardContext,
	dateStr: string
): string {
	const [y, m, d] = dateStr.split("-").map(Number);
	if (!y || !m || !d) return dateStr;
	const date = new Date(y, m - 1, d);
	return date.toLocaleDateString("en-AU", {
		weekday: "short",
		day: "numeric",
		month: "long",
		...(y !== new Date().getFullYear() && { year: "numeric" }),
	});
}
