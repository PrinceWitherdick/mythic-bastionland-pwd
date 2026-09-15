import { postCard, t } from "../chat/cards.js";
import {
	buildAttackPool,
	GAMBIT_MINIMUM,
	parseDice,
	STRONG_GAMBIT_MINIMUM,
	summarizeAttack
} from "../rules/attack.js";
import { templatePath } from "../system-id.js";
import { featContext, resolveFeat } from "./feats.js";

/**
 * Worn or wielded items that add Attack dice: weapons, and armour with an
 * attack die such as a shield.
 * @param {Actor} actor
 * @returns {Item[]}
 */
function attackSources(actor) {
	return actor.items.filter((item) => item.system.equipped && parseDice(item.system.damage).length);
}

/**
 * Ask which weapons to use, roll the Attack dice together, and post the dice
 * so the table can declare Deny and Gambits before taking the highest die.
 * @param {Actor} actor
 */
export async function attack(actor) {
	const sources = attackSources(actor);
	const { conditions } = actor.system;
	const warband = actor.system.scale === "warband";

	const content = await foundry.applications.handlebars.renderTemplate(templatePath("dialogs/attack.hbs"), {
		sources: sources.map((item) => ({
			id: item.id,
			name: item.name,
			damage: item.system.damage,
			ranged: item.system.ranged,
			blast: item.system.blast
		})),
		impaired: conditions.impaired,
		smiteDisabled: conditions.fatigued || conditions.impaired || !sources.length || !actor.system.knowsFeat("smite"),
		warband
	});

	const data = await foundry.applications.api.DialogV2.input({
		window: { title: t("attack.title"), icon: "fa-solid fa-swords" },
		classes: ["bastionland-dialog"],
		content,
		ok: { label: t("attack.roll"), icon: "fa-solid fa-dice" },
		rejectClose: false
	});
	if (!data) return null;

	const choice = foundry.utils.expandObject(data);
	const chosen = sources.filter((item) => choice.source?.[item.id]);
	const weaponDice = chosen.flatMap((item) => parseDice(item.system.damage).map((faces) => ({ faces, label: item.name })));
	const impaired = Boolean(choice.impaired) || !weaponDice.length;
	// A Warband's Attack on individuals gets +d12 and Blast (Warfare, p11).
	const againstIndividuals = warband && Boolean(choice.againstIndividuals);

	// Smite is declared before rolling, and Impaired attacks cannot benefit from Feats.
	let smite = null;
	if (choice.smite && !impaired) {
		const save = await resolveFeat(actor, "smite");
		if (save) smite = { mode: choice.smite, feat: featContext("smite", save), roll: save.roll };
	}

	const bonusDice = parseDice(choice.bonus).map((faces) => ({ faces, label: t("attack.bonus") }));
	if (smite?.mode === "d12") bonusDice.push({ faces: 12, label: t("feats.smite.name") });
	if (againstIndividuals) bonusDice.push({ faces: 12, label: t("npc.scales.warband.label") });

	const pool = buildAttackPool({
		sources: chosen.map((item) => item.system.damage),
		bonus: bonusDice.map((die) => die.faces),
		impaired
	});
	const dice = pool.impaired
		? [{ faces: 4, label: t(weaponDice.length ? "conditions.impaired.label" : "attack.unarmed") }]
		: [...weaponDice, ...bonusDice];

	const roll = await new Roll(dice.map((die) => `1d${die.faces}`).join(" + ")).evaluate();
	const results = roll.dice.map((term) => term.total);
	const melee = !chosen.some((item) => item.system.ranged);
	const summary = summarizeAttack(results, { melee });

	let highestShown = false;
	const shown = dice
		.map((die, index) => ({ ...die, result: results[index] }))
		.sort((a, b) => b.result - a.result)
		.map((die) => {
			const isHighest = !highestShown && die.result === summary.highest;
			highestShown ||= isHighest;
			return {
				...die,
				isHighest,
				isGambit: die.result >= GAMBIT_MINIMUM,
				isStrong: melee && die.result >= STRONG_GAMBIT_MINIMUM
			};
		});

	await postCard(actor, "attack", {
		dice: shown,
		highest: summary.highest,
		gambitDice: t("attack.gambitDice", { count: summary.gambitDice }),
		strongDice: melee ? t("attack.strongDice", { count: summary.strongDice }) : null,
		impaired: pool.impaired,
		blast: smite?.mode === "blast" || againstIndividuals || chosen.some((item) => item.system.blast),
		ignoresArmour: chosen.some((item) => item.system.ignoresArmour),
		smite: smite?.feat ?? null
	}, { rolls: smite ? [smite.roll, roll] : [roll] });

	return { roll, summary };
}
