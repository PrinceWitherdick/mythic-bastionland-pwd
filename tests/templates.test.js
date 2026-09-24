import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import Handlebars from "handlebars";
import { describe, expect, it } from "vitest";
import { AGES, ARMOUR_KINDS, DERIVED_CONDITIONS, FEATS, GAMBIT_DETAILS, GAMBITS, LINKED_ACTORS, MARKED_CONDITIONS, NPC_SCALES, NPC_SOURCES, PROPERTY_TYPES } from "../module/config.js";
import { CITY_QUEST_KIND, KINDS, PROBLEM_REASONS, RULES_KIND, SPARK_KIND } from "../module/rules/book-art.js";
import { RULE_PAGES } from "../module/rules/rule-pages.js";
import { STANDARD_KIT, STARTS } from "../module/rules/creation.js";
import { GLORY_AWARDS, RANKS } from "../module/rules/glory.js";
import { DIVISIONS, PAINT_TOOLS, TINCTURES } from "../module/rules/heraldry.js";
import { CHARGE_GROUPS } from "../module/rules/heraldry-charges.js";
import { SQUIRE_EQUIPMENT } from "../module/rules/squires.js";
import { HOLDING_STYLES, LANDMARK_TYPES, REALM_BRUSHES, REALM_PROBLEMS, REALM_TOOLS, RIVER_SHAPES, TERRAIN } from "../module/rules/realm.js";
import { REALM_PALETTES, REALM_SKINS, TERRAIN_FITS } from "../module/rules/realm-skins.js";
import { SETUP_PARTS } from "../module/rules/realm-setup.js";
import { BARRIER_STATES, FEATURE_KINDS } from "../module/rules/realm-edits.js";
import { DIRECTIONS } from "../module/rules/realm-geometry.js";
import { ATTACK_REFUSALS, SET_ASIDE_REASONS, STRONG_GAMBITS } from "../module/rules/attack.js";
import { DRIFT_SIDES, REFEREE_TABLES } from "../module/rules/referee-rolls.js";
import { SPARK_PAGES } from "../module/rules/spark-tables.js";
import { ENTRANCE_KINDS, POINT_KINDS, ROUTE_KINDS, SITE_MODES, SITE_PRESETS, SITE_STEPS, STEP_ROLLS, STEP_STATES } from "../module/rules/sites.js";
import { GOODS_KIND, GOODS_KINDS, RARITIES } from "../module/rules/arms-and-goods.js";
import { COLLECTION_RESULTS, COUNCIL_SEATS, CRISES, CRISIS_RESULTS, DRAMA_RESULTS } from "../module/rules/dominion.js";
import { FOLK_SOURCES, SEARCH_AIMS } from "../module/rules/exploration.js";
import { AGE_PURSUITS, HARDSHIPS, PHASES, SEASON_PURSUITS, SEASONS } from "../module/rules/time.js";
import { MOVE_PROBLEMS } from "../module/rules/realm-movement.js";
import { GROUP_ORDER, MORALE_TRIGGERS } from "../module/rules/morale.js";
import { DUEL_KINDS } from "../module/rules/duel.js";
import { WILDERNESS_MODES, WILDERNESS_RESULTS } from "../module/rules/wilderness.js";
import { SCARS } from "../module/rules/scars.js";
import { STRUCTURE_KINDS } from "../module/rules/structures.js";
import { COMPANY_STARTS } from "../module/rules/company.js";
import { HEX_PROMPT_MODES } from "../module/rules/hex-lore.js";
import { TOOLKIT_TABS } from "../module/rules/gm-toolkit.js";
import { KNIGHTHOOD_SECTIONS } from "../module/rules/knighthood.js";
import { DRAWING_RULES } from "../module/rules/realm-drawing.js";
import { TRAVEL_GROUPS, TRAVEL_RULES, TRAVEL_SIDES } from "../module/rules/travel-rules.js";
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
		...RANKS.map((rank) => `rank.worthy.${rank.key}`),
		...partsOf("glory.awards", GLORY_AWARDS, ["label", "intro", "hint"]),
		...partsOf("heraldry.tinctures", TINCTURES.map(({ key }) => key), ["label", "hint"]),
		...PAINT_TOOLS.map((tool) => `heraldry.tools.${tool}`),
		...DIVISIONS.map(({ key }) => `heraldry.divisions.${key}`),
		...CHARGE_GROUPS.map((group) => `heraldry.charges.groups.${group}`),
		...SQUIRE_EQUIPMENT.map(({ key }) => `squire.equipment.${key}`),
		...partsOf("conditions", [...MARKED_CONDITIONS, ...DERIVED_CONDITIONS], ["label", "hint"]),
		...LINKED_ACTORS.map(({ label }) => label),
		...partsOf("feats", FEATS.map((feat) => feat.key), ["name", "tagline", "summary", "use"]),
		...GAMBITS.flatMap((key) => [`gambits.${key}`, `gambits.names.${key}`]),
		...GAMBIT_DETAILS.map((key) => `gambits.details.${key}`),
		...STRONG_GAMBITS.map((key) => `attack.strong.${key}`),
		...SET_ASIDE_REASONS.map((key) => `attack.setAside.${key}`),
		...ATTACK_REFUSALS.map((key) => `attack.refusals.${key}`),
		...MORALE_TRIGGERS.map((key) => `morale.triggers.${key}`),
		...partsOf("duel.kinds", DUEL_KINDS, ["label", "hint"]),
		...partsOf("morale.group.orders", GROUP_ORDER, ["label", "hint"]),
		...REFEREE_TABLES.flatMap(({ key, results }) => [
			`refereeRolls.tables.${key}.name`,
			`refereeRolls.tables.${key}.hint`,
			...results.map((result) => `refereeRolls.tables.${key}.results.${result}`)
		]),
		...DRIFT_SIDES.map((side) => `refereeRolls.sides.${side}`),
		...SPARK_PAGES.map(({ key }) => `spark.pages.${key}`),
		...partsOf("sites.modes", SITE_MODES, ["label", "hint", "help"]),
		...partsOf("sites.points", POINT_KINDS, ["label", "plural", "hint", "placeholder"]),
		...partsOf("sites.routes", ROUTE_KINDS, ["label", "plural", "hint", "to"]),
		...partsOf("sites.entrances", ENTRANCE_KINDS, ["label", "plural", "hint", "placeholder"]),
		...partsOf("sites.steps", SITE_STEPS, ["label", "hint"]),
		...Object.keys(STEP_ROLLS).map((step) => `sites.steps.${step}.roll`),
		...STEP_STATES.map((state) => `sites.steps.states.${state}`),
		...Object.keys(STEP_ROLLS).map((group) => `sites.rules.${group}`),
		...SITE_PRESETS.map(({ key }) => `sites.presets.${key}`),
		`bookArt.kinds.${SPARK_KIND}`,
		`bookArt.kinds.${GOODS_KIND}`,
		`bookArt.kinds.${CITY_QUEST_KIND}`,
		`bookArt.kinds.${RULES_KIND}`,
		...Object.keys(RULE_PAGES).map((key) => `bookArt.rulePages.${key}`),
		"bookArt.readingRules",
		"bookArt.report.rulesRead",
		...["omens", "cast"].map((part) => `bookArt.cityQuestParts.${part}`),
		...GOODS_KINDS.map((kind) => `goods.folders.${kind}`),
		...RARITIES.map((rarity) => `goods.rarities.${rarity}`),
		...partsOf("domain.council", COUNCIL_SEATS, ["label", "hint"]),
		...partsOf("domain.crises", CRISES, ["name", "flavour", "resolution"]),
		...CRISIS_RESULTS.map((result) => `domain.results.crisis.${result}`),
		...COLLECTION_RESULTS.map((result) => `domain.results.collections.${result}`),
		...DRAMA_RESULTS.map((result) => `domain.results.drama.${result}`),
		...PHASES.flatMap((key) => [`time.phases.${key}`, `time.phaseHints.${key}`]),
		...SEASONS.map((key) => `time.seasons.${key}`),
		...partsOf("time.pursuits", [...SEASON_PURSUITS, ...AGE_PURSUITS], ["label", "hint"]),
		...partsOf("time.hardship.kinds", HARDSHIPS.map(({ key }) => key), ["label", "hint"]),
		...AGES.filter((key) => key !== "young").map((key) => `time.aging.${key}`),
		...partsOf("scars", SCARS.map((scar) => scar.key), ["name", "flavour", "effect"]),
		...SCARS.filter((scar) => scar.detail).flatMap((scar) => [1, 2, 3, 4, 5, 6].map((n) => `scars.${scar.key}.detail.${n}`)),
		...ARMOUR_KINDS.map((key) => `item.kinds.${key}`),
		...["hefty", "long", "slow", "heftyMounted", "ranged", "blast", "ignoresArmour", "trample"].map((key) => `item.${key}`),
		...["unharmed", "none", "evaded", "scar", "wounded", "mortal", "slain", "destroyed"].map((key) => `damage.outcomes.${key}`),
		...["mortal", "slain"].map((key) => `damage.warbandOutcomes.${key}`),
		...["evaded", "destroyed"].map((key) => `damage.structureOutcomes.${key}`),
		...partsOf("damage.harm", ["warband", "structure"], ["label", "hint"]),
		...partsOf("npc.scales", NPC_SCALES, ["label", "hint"]),
		...partsOf("structure.kinds", STRUCTURE_KINDS, ["label", "hint"]),
		...partsOf("npc.warband", ["routed", "broken", "wipedOut"], ["label", "hint"]),
		...NPC_SOURCES.flatMap((key) => [`npcChooser.sources.${key}`, `npcChooser.unnamed.${key}`]),
		...KINDS.map((kind) => `bookArt.kinds.${kind}`),
		...PROBLEM_REASONS.map((reason) => `bookArt.report.reasons.${reason}`),
		...partsOf("chooser.starts", STARTS.map((start) => start.key), ["label", "summary"]),
		...STANDARD_KIT.map((item) => `chooser.kit.${item.key}`),
		...TERRAIN.map((key) => `realm.terrain.${key}`),
		...HOLDING_STYLES.map((key) => `realm.holdings.${key}`),
		...LANDMARK_TYPES.map((key) => `realm.landmarks.${key}`),
		...COMPANY_STARTS.flatMap((start) => [`company.starts.${start}.name`, `company.starts.${start}.hint`]),
		"company.begins",
		...COMPANY_STARTS.map((start) => `company.choose.${start}`),
		"hexLore.settings.prompt.name",
		"hexLore.settings.prompt.hint",
		...HEX_PROMPT_MODES.map((mode) => `hexLore.settings.prompt.modes.${mode}`),
		...TOOLKIT_TABS.map((tab) => `gmToolkit.tabs.${tab}`),
		...KNIGHTHOOD_SECTIONS.map(({ label }) => label),
		...["once", "many"].map((count) => `gmToolkit.visits.${count}`),
		...MOVE_PROBLEMS.map((key) => `realm.movement.${key}`),
		...REALM_TOOLS.map((tool) => `realm.tools.${tool}`),
		...REALM_BRUSHES.map((brush) => `realm.brushes.${brush}`),
		...REALM_BRUSHES.map((brush) => `realm.panel.hints.${brush}`),
		...["map", ...SETUP_PARTS].map((part) => `realm.setup.parts.${part}`),
		...["cols", "rows", "cluster", "lakes"].map((field) => `realm.setup.fields.${field}`),
		...["rivers", "holdings", "myths", "landmarks", "barriers"].map((part) => `realm.setup.notes.${part}`),
		...partsOf("realm.look.skins", REALM_SKINS, ["label", "hint"]),
		...REALM_PALETTES.map(({ key }) => `realm.look.palettes.${key}`),
		...RIVER_SHAPES.map((shape) => `realm.look.rivers.${shape}`),
		...TERRAIN_FITS.map((fit) => `realm.look.fits.${fit}`),
		...REALM_PROBLEMS.map((reason) => `realm.problems.${reason}`),
		...WILDERNESS_MODES.map((mode) => `realm.wilderness.modes.${mode}`),
		...WILDERNESS_RESULTS.map((result) => `realm.wilderness.results.${result}`),
		...["none", ...FEATURE_KINDS].map((kind) => `realm.panel.kinds.${kind}`),
		...BARRIER_STATES.map((state) => `realm.panel.barrier.${state}`),
		...DIRECTIONS.map((direction) => `realm.directions.${direction}`),
		...DRAWING_RULES.map((group) => `realmDrawing.groups.${group.key}`),
		...DRAWING_RULES.flatMap((group) => group.sections.flatMap(({ key, lines = [] }) => [
			"text",
			...lines.flatMap((line) => [`lines.${line}.label`, `lines.${line}.text`])
		].map((part) => `realmDrawing.sections.${key}.${part}`))),
		...["intro", "credit", "bookCredit", "inspectHint", "more"].map((key) => `realmDrawing.${key}`),
		...["terrain", "barriers", "river", "rivers", "riverNone", "holdings", "seat", "seatNone", "seatMany", "myths", "landmark"].map((key) => `realmDrawing.tally.${key}`),
		...["fold", "unfold", "page"].map((key) => `travelRules.${key}`),
		"rulebook.openPage",
		...TRAVEL_SIDES.flatMap((side) => [`travelRules.titles.${side}`, `travelRules.credits.${side}`]),
		...TRAVEL_GROUPS.map((group) => `travelRules.groups.${group}`),
		...partsOf("explore.folklore.sources", [...FOLK_SOURCES], ["label", "hint"]),
		...partsOf("explore.search.aims", [...SEARCH_AIMS], ["label", "hint"]),
		...TRAVEL_RULES.flatMap(({ sections }) => sections.flatMap(({ key, intro, lines = [], rows = [], note, roll, act }) => [
			"text",
			...(intro ? [] : ["heading"]),
			...lines.flatMap((line) => [`lines.${line}.label`, `lines.${line}.text`]),
			...rows.map((row) => `rows.${row}`),
			...(note ? ["note"] : []),
			...(roll ? ["roll"] : []),
			...(act ? ["act"] : [])
		].map((part) => `travelRules.sections.${key}.${part}`)))
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
