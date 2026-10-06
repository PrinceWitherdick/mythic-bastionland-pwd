import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const gone = (path) => !existsSync(join(root, path));

const spark = read("module/apps/SparkTables.js");
const sparkTemplate = read("templates/apps/spark-tables.hbs");
const gmPart = read("module/apps/hex-gm-part.js");
const gmTemplate = read("templates/apps/parts/hex-gm.hbs");
const timePage = read("templates/actor/gm-toolkit/time.hbs");
const boot = read("mythic-bastionland.js");
const lang = JSON.parse(read("languages/en.json")).bastionland;

describe("Wilderness Hex, a page of the Spark Tables", () => {
	it("is no window of its own", () => {
		expect(gone("module/apps/WildernessHex.js")).toBe(true);
		expect(gone("templates/apps/wilderness-hex.hbs")).toBe(true);
	});

	it("comes before the book's pages, under its own name", () => {
		expect(spark).toContain('export const WILD_PAGE = "wild";');
		expect(spark).toContain("pages: [WILD_PAGE, ...SPARK_PAGES.map(({ key }) => key)]");
		expect(lang.spark.pages.wild).toBe("Wilderness Hex");
	});

	it("rolls, takes by hand and saves to the hex rolls are kept in", () => {
		for (const action of ["rollPick", "keepWild"]) expect(sparkTemplate).toContain(`data-action="${action}"`);
		expect(sparkTemplate).toContain('{{> "bastionland.spark-pick-tables"}}');
		expect(spark).toContain("const kept = await keepHexSparks({ ...target, page: this.#wild.page, taken });");
		expect(spark).toContain("const target = this.wildTarget;");
		// Rolls aren't kept one by one there, so the tick box and Roll a Person stay on the book's pages.
		expect(sparkTemplate).toMatch(/\{\{#unless wild\}\}\s*<label class="bastionland-check bastionland-spark__animate" data-tooltip="\{\{localize "bastionland\.spark\.keepHint"\}\}">/);
	});

	it("says where it saves as the hex chosen in Places moves", () => {
		expect(sparkTemplate).toContain("data-keep-wild");
		expect(spark).toContain('const save = window_.element.querySelector("[data-keep-wild]");');
	});

	it("is no button in a hex's Lay of the Land, while Roll the Land rolls straight into it", () => {
		expect(gmTemplate).not.toContain('data-action="browseSparks"');
		expect(gmPart).toContain("rollOnce(state, () => rollHexSparkSet({ scene, hex }))");
	});
});

describe("Time, on the GM Toolkit's Time page", () => {
	it("is no window of its own", () => {
		expect(gone("module/apps/TimePanel.js")).toBe(true);
		expect(gone("templates/apps/time-panel.hbs")).toBe(true);
	});

	it("moves time on, ends the session and shows a Curse's blight there", () => {
		for (const action of ["nextPhase", "turnSeason", "turnAge", "journey", "endSession", "weeksPass", "awardGlory"]) {
			expect(timePage).toContain(`data-action="${action}"`);
		}
		expect(timePage).toContain('{{> "bastionland.off-course" offCourse}}');
	});

	it("is where the Referee's Time button and old macros go", () => {
		expect(boot).toContain('label: "time.title", open: () => openGmToolkit("time") }');
		expect(boot).toContain('openTimePanel: () => (game.user.isGM ? openGmToolkit("time") : ui.notifications.info(calendarLabel(getCalendar()))),');
	});
});
