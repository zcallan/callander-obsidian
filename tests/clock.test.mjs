import { createSuite } from "./harness.mjs";
import { exactTimeChoices } from "./.build/callander.mjs";

const FIVES = [
	"00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55",
];

/**
 * The plan item's hour-and-minute picker. Saving writes back whatever it
 * has selected, so every stored time must select itself: one that matches
 * no option silently becomes the first option on the next save.
 */
export function run() {
	const { eq, result } = createSuite("clock picker");

	{
		const c = exactTimeChoices("19:30");
		eq("a time on the steps selects itself", [c.hour, c.minute], ["19", "30"]);
		eq("…among the five-minute steps", c.minutes, FIVES);
	}
	eq(
		"an unpadded hour still selects itself",
		exactTimeChoices("9:30").hour,
		"09"
	);
	{
		const c = exactTimeChoices("19:07");
		eq("a minute between the steps selects itself", c.minute, "07");
		eq(
			"…offered in its place among them",
			c.minutes.slice(0, 4),
			["00", "05", "07", "10"]
		);
		eq("…as the one extra", c.minutes.length, FIVES.length + 1);
	}
	eq("midnight is an hour like any other", exactTimeChoices("0:00").hour, "00");
	eq(
		"no time starts at noon",
		[exactTimeChoices(undefined).hour, exactTimeChoices("").minute],
		["12", "00"]
	);
	eq(
		"…as does a rough time",
		exactTimeChoices("morning"),
		exactTimeChoices(undefined)
	);
	eq(
		"…and a time that can't be one",
		[exactTimeChoices("25:00").hour, exactTimeChoices("19:75").minutes],
		["12", FIVES]
	);

	return result();
}
