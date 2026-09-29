import type { App } from "obsidian";
import type { CallanderSettings } from "@/types";
import type { ContactOperations } from "@/services/ContactOperations";
import type { EventOperations } from "@/services/EventOperations";
import type { PlanOperations } from "@/services/PlanOperations";

/**
 * What a service needs from the plugin: the app, the settings, and the
 * other services it calls. The plugin class satisfies it structurally, and
 * so does the tests' FakePlugin, which is why a service can be built in a
 * fake vault without the rest of the plugin.
 */
export interface ServiceHost {
	app: App;
	settings: CallanderSettings;
	contactOperations: ContactOperations;
	eventOperations: EventOperations;
	planOperations: PlanOperations;
}
