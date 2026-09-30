import { chooseDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { DEFAULT_DIRE_WEATHER_RISK, DIRE_WEATHER_RISKS, LUCK_ODDS, luckAtOdds, readRefereeTable, REFEREE_TABLES, weatherAfter } from "../rules/referee-rolls.js";
import { readMythTable } from "../rules/gm-toolkit.js";
import { samePhase } from "../rules/time.js";
import { getCalendar } from "./calendar.js";
import { sparkPrompt } from "../rules/spark-tables.js";
import { SYSTEM_ID } from "../system-id.js";

/** When the Realm's lands suffer dire weather, one of DIRE_WEATHER_RISKS. */
const DIRE_WEATHER_SETTING = "direWeather";

/**
 * The Dire Weather table's last roll: in which Phase, what the die gave, and
 * what that came to, so a second Looming in a row reads as dire (p18):
 * {when, rolled, result}, or null.
 */
const WEATHER_NOW_SETTING = "weatherNow";

/** Register what the weather table last gave, and when it's rolled. Called during init. */
export function registerWeatherStreakSetting() {
	game.settings.register(SYSTEM_ID, WEATHER_NOW_SETTING, { scope: "world", config: false, type: Object, default: null });
	game.settings.register(SYSTEM_ID, DIRE_WEATHER_SETTING, {
		name: "bastionland.refereeRolls.direWeather.name",
		hint: "bastionland.refereeRolls.direWeather.hint",
		scope: "world",
		config: true,
		type: String,
		default: DEFAULT_DIRE_WEATHER_RISK,
		// Settings are registered before the language files are ready, so these are keys for Foundry to localize.
		choices: Object.fromEntries(DIRE_WEATHER_RISKS.map((risk) => [risk, `bastionland.refereeRolls.direWeather.risks.${risk}`]))
	});
}

/**
 * What the weather table came to in a Phase, with a second Looming read as dire.
 * @param {import("../rules/time.js").Calendar} calendar
 * @returns {string|null} Null where it wasn't rolled then.
 */
export function weatherIn(calendar) {
	const now = game.settings.get(SYSTEM_ID, WEATHER_NOW_SETTING);
	return samePhase(now?.when, calendar) ? now.result ?? null : null;
}

/** @returns {string} When the lands suffer dire weather, one of DIRE_WEATHER_RISKS. */
export function direWeatherRisk() {
	const risk = game.settings.get(SYSTEM_ID, DIRE_WEATHER_SETTING);
	return DIRE_WEATHER_RISKS.includes(risk) ? risk : DEFAULT_DIRE_WEATHER_RISK;
}

/**
 * Roll a d6 on one of the Referee's tables and post what it gives.
 * @param {string} key One of REFEREE_TABLES.
 * @returns {Promise<{d6: number, result: string, side: string|null}|null>} Null for a table that doesn't exist.
 */
export async function rollRefereeTable(key) {
	const table = REFEREE_TABLES.find((candidate) => candidate.key === key);
	if (!table) return null;

	const roll = await new Roll("1d6").evaluate();
	const read = readRefereeTable(key, roll.total);
	let streak = false;
	if (key === "weather") {
		const rolled = read.result;
		({ result: read.result, streak } = weatherAfter(rolled, game.settings.get(SYSTEM_ID, WEATHER_NOW_SETTING)?.rolled ?? null));
		// What was rolled is kept, so a third Looming in a row is still a second one in a row, and kept
		// with its Phase, so the Night's end knows whether dire weather kept the Company from sleep.
		if (game.user.isGM) await game.settings.set(SYSTEM_ID, WEATHER_NOW_SETTING, { when: { ...getCalendar() }, rolled, result: read.result });
	}
	const text = (part, data) => t(`refereeRolls.tables.${key}.${part}`, data);
	await postCard(null, "referee-roll", {
		name: text("name"),
		page: t("refereeRolls.page", { page: table.page }),
		d6: roll.total,
		result: text(`results.${read.result}`, { side: read.side ? t(`refereeRolls.sides.${read.side}`) : "" }),
		hint: streak ? `${t("refereeRolls.loomingAgain")} ${text("hint")}` : text("hint")
	}, { rolls: [roll] });
	return { d6: roll.total, ...read };
}

/**
 * Ask what the odds are, then make a Luck Roll: on its table, or at the odds
 * the Referee states ("a slim chance", "straight 50/50", p182, p184).
 * @param {string} [odds] One of LUCK_ODDS, or "table"; asked when not given.
 * @returns {Promise<object|null>} What was rolled, or null if the question was closed.
 */
export async function rollLuck(odds) {
	odds ??= await chooseDialog({
		title: t("refereeRolls.tables.luck.name"),
		icon: "fa-solid fa-dice-d6",
		classes: ["bastionland-referee-rolls"],
		message: t("refereeRolls.odds.question"),
		buttons: [
			{ action: "table", label: t("refereeRolls.odds.table"), default: true },
			...LUCK_ODDS.map(({ key, needs }) => ({ action: key, label: t("refereeRolls.odds.label", { odds: t(`refereeRolls.odds.${key}`), needs }) }))
		]
	});
	if (odds === "table") return rollRefereeTable("luck");
	if (!LUCK_ODDS.some(({ key }) => key === odds)) return null;

	const roll = await new Roll("1d6").evaluate();
	const read = luckAtOdds(odds, roll.total);
	await postCard(null, "referee-roll", {
		name: t("refereeRolls.tables.luck.name"),
		page: t("refereeRolls.page", { page: REFEREE_TABLES.find(({ key }) => key === "luck").page }),
		d6: roll.total,
		result: t(read.favoured ? "refereeRolls.odds.favoured" : "refereeRolls.odds.against"),
		hint: t("refereeRolls.odds.hint", { odds: t(`refereeRolls.odds.${odds}`), needs: read.needs })
	}, { rolls: [roll] });
	return { d6: roll.total, odds, ...read };
}

/**
 * Ask which of the Referee's tables to roll on, then roll it. GMs only.
 * @returns {Promise<object|null>}
 */
export async function openRefereeRolls() {
	if (!game.user.isGM) return null;
	const key = await chooseDialog({
		title: t("refereeRolls.title"),
		icon: "fa-solid fa-dice-d6",
		classes: ["bastionland-referee-rolls"],
		message: t("refereeRolls.intro"),
		buttons: REFEREE_TABLES.map(({ key: action }, index) => ({
			action,
			label: t(`refereeRolls.tables.${action}.name`),
			default: index === 0
		}))
	});
	if (key === "luck") return rollLuck();
	return REFEREE_TABLES.some((table) => table.key === key) ? rollRefereeTable(key) : null;
}

/**
 * Roll on a Spark Table, one d12 for each column.
 * @param {import("../rules/spark-tables.js").SparkTable} table
 * @returns {Promise<{roll: Roll, results: ReturnType<typeof sparkPrompt>, prompt: string}>}
 */
export async function rollSpark(table) {
	const roll = await new Roll(table.columns.map(() => "1d12").join(" + ")).evaluate();
	const results = sparkPrompt(table, roll.dice.map((die) => die.total));
	return { roll, results, prompt: results.map(({ entry }) => entry).filter(Boolean).join(" ") };
}

/**
 * Roll on the table printed on a Myth's page, a d6 for each column asked for.
 * @param {import("../rules/book-art.js").MythTable} table
 * @param {number[]} [columns] By index: both unless one is named.
 * @returns {Promise<{roll: Roll, results: ReturnType<typeof readMythTable>, prompt: string}>}
 */
export async function rollMythTable(table, columns = table.columns.map((_, index) => index)) {
	const roll = await new Roll(columns.map(() => "1d6").join(" + ")).evaluate();
	const results = readMythTable(table, columns, roll.dice.map((die) => die.total));
	return { roll, results, prompt: results.map(({ entry }) => entry).filter(Boolean).join(" · ") };
}
