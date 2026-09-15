import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import Handlebars from "handlebars";
import { describe, expect, it } from "vitest";
import { AGES, ARMOUR_KINDS, FEATS, GAMBITS, NPC_SCALES, NPC_SOURCES, PROPERTY_TYPES } from "../module/config.js";
import { KINDS, PROBLEM_REASONS, SPARK_KIND } from "../module/rules/book-art.js";
import { STANDARD_KIT, STARTS } from "../module/rules/creation.js";
import { GLORY_AWARDS, RANKS } from "../module/rules/glory.js";
import { SQUIRE_EQUIPMENT } from "../module/rules/squires.js";
import { HOLDING_STYLES, LANDMARK_TYPES, REALM_PROBLEMS, REALM_TOOLS, TERRAIN } from "../module/rules/realm.js";
import { BARRIER_STATES, FEATURE_KINDS } from "../module/rules/realm-edits.js";
import { DIRECTIONS } from "../module/rules/realm-geometry.js";
import { REALM_ICON_KINDS, REALM_ICON_PROBLEMS } from "../module/rules/realm-icons.js";
import { DRIFT_SIDES, REFEREE_TABLES } from "../module/rules/referee-rolls.js";
import { SPARK_PAGES } from "../module/rules/spark-tables.js";
import { AGE_PURSUITS, HARDSHIPS, PHASES, SEASON_PURSUITS, SEASONS } from "../module/rules/time.js";
import { MOVE_PROBLEMS } from "../module/rules/realm-movement.js";
import { WILDERNESS_MODES, WILDERNESS_RESULTS } from "../module/rules/wilderness.js";
import { SCARS } from "../module/rules/scars.js";
import { VIRTUES } from "../module/rules/virtues.js";

const root = join(import.meta.dirname, "..");
const systemManifest = JSON.parse(readFileSync(join(root, "system.json"), "utf8"));
const lang = JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8"));

/** @returns {string[]} Every file under `dir` with the given extension. */
function walk(dir, extension) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return walk(path, extension);
		return extname(entry.name) === extension ? [path] : [];
	});
}

const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
const templates = walk(join(root, "templates"), ".hbs");
const scripts = [...walk(join(root, "module"), ".js"), join(root, "mythic-bastionland.js")];

/** @returns {string[]} Keys for each part of each entry, such as "npc.scales.warband.label". */
const partsOf = (prefix, keys, parts) => keys.flatMap((key) => parts.map((part) => `${prefix}.${key}.${part}`));

describe("templates", () => {
	it.each(templates.map((file) => [relative(root, file), file]))("%s compiles", (_name, file) => {
		expect(() => Handlebars.precompile(readFileSync(file, "utf8"))).not.toThrow();
	});
});

describe("localization", () => {
	// Full keys quoted in templates, such as localize "bastionland.oath.line1".
	const templateKeys = templates.flatMap((file) =>
		[...readFileSync(file, "utf8").matchAll(/["'](bastionland\.[\w.]+)["']/g)].map((match) => match[1]));

	// Keys passed to the t/localize/format shorthands, which add the prefix, and
	// full keys quoted in scripts, such as a setting's name.
	const scriptKeys = scripts.flatMap((file) => {
		const source = readFileSync(file, "utf8");
		return [
			...[...source.matchAll(/\b(?:t|localize|format)\(\s*"([\w.]+)"/g)].map((match) => `bastionland.${match[1]}`),
			...[...source.matchAll(/["'](bastionland\.[\w.]+)["']/g)].map((match) => match[1])
		];
	});

	// Keys built at runtime from the rule tables.
	const builtKeys = [
		...VIRTUES.flatMap((key) => ["abbr", "tail", "label", "hint"].map((part) => `virtues.${key}.${part}`)),
		...VIRTUES.map((key) => `recovery.${key}`),
		...AGES.map((key) => `age.${key}`),
		...RANKS.map((rank) => `rank.${rank.key}`),
		...partsOf("glory.awards", GLORY_AWARDS, ["label", "intro", "hint"]),
		...SQUIRE_EQUIPMENT.map(({ key }) => `squire.equipment.${key}`),
		...partsOf("conditions", ["fatigued", "exposed", "mortalWound", "exhausted", "impaired"], ["label", "hint"]),
		...partsOf("feats", FEATS.map((feat) => feat.key), ["name", "tagline", "summary", "use"]),
		...GAMBITS.map((key) => `gambits.${key}`),
		...REFEREE_TABLES.flatMap(({ key, results }) => [
			`refereeRolls.tables.${key}.name`,
			`refereeRolls.tables.${key}.hint`,
			...results.map((result) => `refereeRolls.tables.${key}.results.${result}`)
		]),
		...DRIFT_SIDES.map((side) => `refereeRolls.sides.${side}`),
		...SPARK_PAGES.map(({ key }) => `spark.pages.${key}`),
		`bookArt.kinds.${SPARK_KIND}`,
		...PHASES.flatMap((key) => [`time.phases.${key}`, `time.phaseHints.${key}`]),
		...SEASONS.map((key) => `time.seasons.${key}`),
		...partsOf("time.pursuits", [...SEASON_PURSUITS, ...AGE_PURSUITS], ["label", "hint"]),
		...partsOf("time.hardship.kinds", HARDSHIPS.map(({ key }) => key), ["label", "hint"]),
		...AGES.filter((key) => key !== "young").map((key) => `time.aging.${key}`),
		...partsOf("scars", SCARS.map((scar) => scar.key), ["name", "flavour", "effect"]),
		...SCARS.filter((scar) => scar.detail).flatMap((scar) => [1, 2, 3, 4, 5, 6].map((n) => `scars.${scar.key}.detail.${n}`)),
		...ARMOUR_KINDS.map((key) => `item.kinds.${key}`),
		...["hefty", "long", "slow", "ranged", "blast", "ignoresArmour"].map((key) => `item.${key}`),
		...["unharmed", "none", "evaded", "scar", "wounded", "mortal", "slain"].map((key) => `damage.outcomes.${key}`),
		...["mortal", "slain"].map((key) => `damage.warbandOutcomes.${key}`),
		...partsOf("damage.harm", ["warband", "structure"], ["label", "hint"]),
		...partsOf("npc.scales", NPC_SCALES, ["label", "hint"]),
		...partsOf("npc.warband", ["routed", "broken", "wipedOut"], ["label", "hint"]),
		...NPC_SOURCES.flatMap((key) => [`npcChooser.sources.${key}`, `npcChooser.unnamed.${key}`]),
		...KINDS.map((kind) => `bookArt.kinds.${kind}`),
		...PROBLEM_REASONS.map((reason) => `bookArt.report.reasons.${reason}`),
		...partsOf("chooser.starts", STARTS.map((start) => start.key), ["label", "summary"]),
		...STANDARD_KIT.map((item) => `chooser.kit.${item.key}`),
		...TERRAIN.map((key) => `realm.terrain.${key}`),
		...HOLDING_STYLES.map((key) => `realm.holdings.${key}`),
		...LANDMARK_TYPES.map((key) => `realm.landmarks.${key}`),
		...MOVE_PROBLEMS.map((key) => `realm.movement.${key}`),
		...REALM_ICON_KINDS.map((kind) => `bookArt.kinds.${kind}`),
		...REALM_ICON_PROBLEMS.map((reason) => `bookArt.report.reasons.${reason}`),
		...REALM_TOOLS.map((tool) => `realm.tools.${tool}`),
		...REALM_PROBLEMS.map((reason) => `realm.problems.${reason}`),
		...WILDERNESS_MODES.map((mode) => `realm.wilderness.modes.${mode}`),
		...WILDERNESS_RESULTS.map((result) => `realm.wilderness.results.${result}`),
		...["none", ...FEATURE_KINDS].map((kind) => `realm.panel.kinds.${kind}`),
		...BARRIER_STATES.map((state) => `realm.panel.barrier.${state}`),
		...DIRECTIONS.map((direction) => `realm.directions.${direction}`)
	].map((key) => `bastionland.${key}`);

	const typeKeys = [
		...Object.keys(systemManifest.documentTypes.Actor).map((type) => `TYPES.Actor.${type}`),
		...Object.keys(systemManifest.documentTypes.Item).map((type) => `TYPES.Item.${type}`),
		...PROPERTY_TYPES.map((type) => `TYPES.Item.${type}`)
	];

	it.each([...new Set([...templateKeys, ...scriptKeys, ...builtKeys, ...typeKeys])])("%s exists", (key) => {
		expect(typeof lookup(key)).toBe("string");
	});
});
