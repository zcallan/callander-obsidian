import { TFile, TFolder, normalizePath } from "obsidian";
import type FriendTracker from "@/main";
import type { PlanIdeaCategory, PlanPriority } from "@/constants";
import {
	ACCOMMODATION_EMOJI,
	PLAN_IDEA_CATEGORIES,
	TRAVEL_TYPE_EMOJI,
	timeSortValue,
} from "@/constants";
import type {
	PlanInfo,
	PlanItem,
	PlanSimpleItem,
	PlanTimelineEntry,
} from "@/types";
import { asArray, fieldOf, toText } from "@/utils/fm";
import { ContactOperations } from "@/services/ContactOperations";
import { todayISO } from "@/utils/flexdate";

/** The named field when it's a non-empty string, else undefined. */
function strFieldOf(value: unknown, key: string): string | undefined {
	const v = fieldOf(value, key);
	return typeof v === "string" && v ? v : undefined;
}

export class PlanOperations {
	constructor(private plugin: FriendTracker) {}

	private get app() {
		return this.plugin.app;
	}

	getPlansFolderPath(): string {
		return normalizePath(`${this.plugin.settings.baseFolder}/Plans`);
	}

	isPlanFile(path: string): boolean {
		return (
			path.startsWith(this.getPlansFolderPath() + "/") &&
			path.endsWith(".md")
		);
	}

	/** Plan ideas — category + priority. Legacy bucket shapes are mapped. */
	static itemsOf(metadata: unknown): PlanItem[] {
		return asArray(fieldOf(metadata, "items"))
			.map((i): PlanItem => {
				const legacyBucket = fieldOf(i, "bucket");
				// "food" split into restaurant + cooking; old items → restaurant
				const rawCat = fieldOf(i, "category");
				const category =
					rawCat === "food"
						? "restaurant"
						: typeof rawCat === "string" && rawCat
						? (rawCat as PlanIdeaCategory)
						: "activity";
				const rawPriority = fieldOf(i, "priority");
				const priority =
					typeof rawPriority === "string" && rawPriority
						? (rawPriority as PlanPriority)
						: legacyBucket === "must"
						? "must"
						: "maybe";
				const rawText = fieldOf(i, "text");
				const cost = fieldOf(i, "cost");
				return {
					text:
						typeof rawText === "string"
							? rawText
							: rawText == null
							? String(i)
							: "",
					category,
					priority,
					...(strFieldOf(i, "date") && { date: strFieldOf(i, "date") }),
					...(strFieldOf(i, "time") && { time: strFieldOf(i, "time") }),
					...(strFieldOf(i, "people") && {
						people: strFieldOf(i, "people"),
					}),
					...(strFieldOf(i, "location") && {
						location: strFieldOf(i, "location"),
					}),
					...(typeof cost === "number" && { cost }),
					...(strFieldOf(i, "notes") && {
						notes: strFieldOf(i, "notes"),
					}),
				};
			})
			.filter((i) => i.text.length > 0);
	}

	/** Flat list readers (travel, accommodation) */
	static simpleListOf(metadata: unknown, key: string): PlanSimpleItem[] {
		return asArray(fieldOf(metadata, key))
			.map((i): PlanSimpleItem => {
				if (typeof i === "string") return { text: i };
				// Legacy free-text `day` is dropped; an ISO one is kept as date.
				const day = strFieldOf(i, "day");
				const date =
					strFieldOf(i, "date") ??
					(day && /^\d{4}-\d{2}-\d{2}$/.test(day)
						? day
						: undefined);
				const type = strFieldOf(i, "type");
				const rawText = fieldOf(i, "text");
				const cost = fieldOf(i, "cost");
				const stay = strFieldOf(i, "stay");
				const booked = strFieldOf(i, "booked");
				const nights = fieldOf(i, "nights");
				return {
					text: typeof rawText === "string" ? rawText : "",
					...(type && { type: type as PlanSimpleItem["type"] }),
					...(stay && { stay: stay as PlanSimpleItem["stay"] }),
					...(date && { date }),
					...(strFieldOf(i, "time") && { time: strFieldOf(i, "time") }),
					...(strFieldOf(i, "people") && {
						people: strFieldOf(i, "people"),
					}),
					...(strFieldOf(i, "duration") && {
						duration: strFieldOf(i, "duration"),
					}),
					...(typeof nights === "number" &&
						nights > 0 && { nights }),
					...(strFieldOf(i, "address") && {
						address: strFieldOf(i, "address"),
					}),
					...(booked && {
						booked: booked as PlanSimpleItem["booked"],
					}),
					...(strFieldOf(i, "notes") && {
						notes: strFieldOf(i, "notes"),
					}),
					...(typeof cost === "number" && { cost }),
				};
			})
			.filter((i) => i.text.length > 0);
	}

	/**
	 * Derived, read-only itinerary: every dated item across ideas, travel and
	 * accommodation, sorted chronologically. Pure — computed on demand, never
	 * stored. `index` is the position in each item's own source list, so the
	 * caller can route an edit/delete straight back to the one real object.
	 */
	static timelineOf(metadata: unknown): PlanTimelineEntry[] {
		const entries: PlanTimelineEntry[] = [];

		PlanOperations.itemsOf(metadata).forEach((item, index) => {
			if (!item.date) return;
			const cat = PLAN_IDEA_CATEGORIES.find(
				(c) => c.id === item.category
			);
			entries.push({
				source: "idea",
				index,
				date: item.date,
				...(item.time && { time: item.time }),
				...(item.people && { people: item.people }),
				text: item.text,
				emoji: cat?.emoji ?? "💡",
				...(item.category && { category: item.category }),
				...(item.priority && { priority: item.priority }),
				...(item.location && { location: item.location }),
				...(item.cost !== undefined && { cost: item.cost }),
				...(item.notes && { notes: item.notes }),
			});
		});

		// Drafts that have been given a day. They're unfinished by nature —
		// no category, no priority, nothing to show but the words — so they
		// carry only what a row needs, and the row marks them as drafts.
		ContactOperations.draftsOf(metadata).forEach((draft, index) => {
			if (!draft.date) return;
			entries.push({
				source: "draft",
				index,
				date: draft.date,
				text: draft.text,
				emoji: "✏️",
			});
		});

		(["travel", "accommodation"] as const).forEach((key) => {
			PlanOperations.simpleListOf(metadata, key).forEach(
				(item, index) => {
					if (!item.date) return;
					const isStay = key === "accommodation";
					const emoji = isStay
						? (item.stay && ACCOMMODATION_EMOJI[item.stay]) || "🛏️"
						: item.type
						? TRAVEL_TYPE_EMOJI[item.type]
						: "🧭";
					entries.push({
						source: isStay ? "accommodation" : "travel",
						index,
						date: item.date,
						// A stay has no clock time — it always closes the day.
						...(!isStay && item.time && { time: item.time }),
						...(item.people && { people: item.people }),
						text: item.text,
						emoji,
						...(!isStay &&
							item.duration && { duration: item.duration }),
						...(!isStay && item.type && { travel: item.type }),
						...(isStay && item.stay && { stay: item.stay }),
						...(isStay && item.nights && { nights: item.nights }),
						...(isStay && item.address && { address: item.address }),
						// A flight needs booking as much as a hotel does, so
						// this rides along for legs too — unlike address, which
						// only means something for a stay.
						...(item.booked && { booked: item.booked }),
						// Notes apply to any stay or leg, not just stays —
						// unlike address/booking, which only make sense there.
						...(item.notes && { notes: item.notes }),
						...(item.cost !== undefined && { cost: item.cost }),
					});
				}
			);
		});

		// Within a day: timed entries, then untimed, then stays last — you go
		// to bed after everything else. The tier digit outranks the clock.
		const key = (e: PlanTimelineEntry) =>
			`${e.date}T${e.source === "accommodation" ? "1" : "0"}${timeSortValue(
				e.time
			)}`;
		return entries.sort((a, b) => key(a).localeCompare(key(b)));
	}

	static membersOf(metadata: unknown): string[] {
		return asArray(fieldOf(metadata, "members")).map(String);
	}

	/** All plans, straight from the metadata cache — zero file I/O */
	getPlans(): PlanInfo[] {
		const folder = this.app.vault.getAbstractFileByPath(
			this.getPlansFolderPath()
		);
		if (!(folder instanceof TFolder)) return [];
		return folder.children
			.filter(
				(f): f is TFile => f instanceof TFile && f.extension === "md"
			)
			.map((file) => {
				const fm: unknown =
					this.app.metadataCache.getFileCache(file)?.frontmatter;
				const str = (key: string): string => {
					const v = fieldOf(fm, key);
					return v ? toText(v) : "";
				};
				return {
					file,
					name: str("name") || file.basename,
					date: str("date"),
					endDate: str("endDate"),
					location: str("location"),
					status: str("status") || "planning",
					items: PlanOperations.itemsOf(fm),
					members: PlanOperations.membersOf(fm),
				};
			});
	}

	async createPlan(
		name: string,
		date: string,
		location = "",
		endDate = ""
	): Promise<TFile> {
		const folderPath = this.getPlansFolderPath();
		if (!this.app.vault.getAbstractFileByPath(folderPath)) {
			await this.app.vault.createFolder(folderPath);
		}
		const safeName = name.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim();
		let path = normalizePath(`${folderPath}/${safeName}.md`);
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(path)) {
			path = normalizePath(`${folderPath}/${safeName} ${counter++}.md`);
		}
		const loc = location.trim()
			? `location: ${JSON.stringify(location.trim())}\n`
			: "";
		const end = endDate.trim() ? `endDate: ${endDate.trim()}\n` : "";
		return await this.app.vault.create(
			path,
			`---\nname: ${JSON.stringify(
				name
			)}\ndate: ${date}\n${end}${loc}status: planning\ncreated: ${todayISO()}\nupdated: ${todayISO()}\n---\n`
		);
	}

	/** Every write goes through here so the file's `updated` stamp stays true. */
	private async writePlan(
		file: TFile,
		fn: (fm: Record<string, unknown>) => void
	): Promise<void> {
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fn(fm);
				fm.updated = todayISO();
			}
		);
	}

	/** Quick-capture path: append an idea without opening the plan */
	async addItem(file: TFile, item: PlanItem): Promise<void> {
		await this.writePlan(file, (fm) => {
			fm.items = [...PlanOperations.itemsOf(fm), item];
		});
	}

	/** Bring items are a checklist; legacy plain strings read as unchecked */
	static bringOf(metadata: unknown): Array<{ text: string; done: boolean }> {
		return asArray(fieldOf(metadata, "bring"))
			.map((b) => {
				if (typeof b === "string") return { text: b, done: false };
				const text = fieldOf(b, "text");
				return {
					text: typeof text === "string" ? text : "",
					done: !!fieldOf(b, "done"),
				};
			})
			.filter((b) => b.text.length > 0);
	}

	/** Quick-capture path for the bring list */
	async addBringItem(file: TFile, text: string): Promise<void> {
		await this.writePlan(file, (fm) => {
			fm.bring = [...PlanOperations.bringOf(fm), { text, done: false }];
		});
	}

	/** Sum of per-item costs across ideas, travel and accommodation */
	static estimate(metadata: unknown): number {
		const items = PlanOperations.itemsOf(metadata);
		const travel = PlanOperations.simpleListOf(metadata, "travel");
		const stay = PlanOperations.simpleListOf(metadata, "accommodation");
		return [...items, ...travel, ...stay].reduce(
			(sum, i) => sum + (i.cost ?? 0),
			0
		);
	}
}
