import { chooseDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { readRefereeTable, REFEREE_TABLES } from "../rules/referee-rolls.js";
import { readMythTable } from "../rules/gm-toolkit.js";
import { sparkPrompt } from "../rules/spark-tables.js";

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
	const text = (part, data) => t(`refereeRolls.tables.${key}.${part}`, data);
	await postCard(null, "referee-roll", {
		name: text("name"),
		page: t("refereeRolls.page", { page: table.page }),
		d6: roll.total,
		result: text(`results.${read.result}`, { side: read.side ? t(`refereeRolls.sides.${read.side}`) : "" }),
		hint: text("hint")
	}, { rolls: [roll] });
	return { d6: roll.total, ...read };
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
