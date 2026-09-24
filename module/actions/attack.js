import { inputDialog } from "../apps/ui.js";
import { plural, postCard, t } from "../chat/cards.js";
import { combatPlace, marksOn } from "../chat/gambit-marks.js";
import { GAMBITS } from "../config.js";
import {
	attackDamage,
	buildAttackPool,
	canFundGambit,
	canFundStrongGambit,
	checkWielding,
	defaultWielded,
	gambitAllowsSave,
	gambitIgnored,
	hasDeniableDie,
	isDieSpent,
	parseDice,
	sortDice,
	specialistDie,
	summarizeAttack
} from "../rules/attack.js";
import { dieMask } from "../rules/die-shapes.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { openDuelFor, saveDuelChange } from "./duel.js";
import { canDenyAttack, featContext, resolveFeat } from "./feats.js";
import { leaderCandidates } from "./leading.js";

/** Weapon qualities shown beside each choice in the Attack dialog. */
const SHOWN_QUALITIES = Object.freeze(["hefty", "long", "slow", "heftyMounted", "ranged", "blast", "trample"]);

/**
 * A specialist weapon's extra die and when it applies, as shown beside the weapon.
 * @param {object} weapon An item's system data.
 * @returns {string|null} Such as "+d10 against the undead", or null for a weapon that isn't one.
 */
export function specialistLabel(weapon) {
	const die = specialistDie(weapon);
	if (!die) return null;
	const situation = weapon.specialist.situation.trim();
	return situation ? t("item.specialistTag", { die, situation }) : t("item.specialistTagBare", { die });
}

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
 * A Knight's steed and its trample, which joins a mounted charge at enemies on foot (p10).
 * @param {Actor} actor
 * @returns {{steed: Actor, trample: Item[]}|null} Null without a steed that tramples.
 */
function mountOf(actor) {
	const steed = actor.system.steed ? fromUuidSync(actor.system.steed) : null;
	const trample = steed?.items?.filter((item) => item.type === "weapon" && item.system.trample && parseDice(item.system.damage).length) ?? [];
	return trample.length ? { steed, trample } : null;
}

/**
 * The Tokens this user has targeted, as an Attack card records them.
 * @returns {{uuid: string, name: string}[]}
 */
function currentTargets() {
	return [...game.user.targets].map((token) => ({ uuid: token.document.uuid, name: token.document.name }));
}

/**
 * Whether the actor's Token has moved this turn. Foundry records movement only
 * while a combat is running, and clears it as each turn starts.
 * @param {Actor} actor
 * @returns {boolean}
 */
function movedThisTurn(actor) {
	return actor.getActiveTokens(false, true).some((token) => token.combatant?.parent?.started && token.movementHistory.length > 0);
}

/**
 * Check the items ticked in the Attack dialog against the situation ticked there.
 * @param {Actor} actor
 * @param {Item[]} sources Everything the dialog offered.
 * @param {object} choice  The dialog's expanded form data.
 * @returns {{chosen: Item[], check: ReturnType<typeof checkWielding>}}
 */
function readWielding(actor, sources, choice) {
	const chosen = sources.filter((item) => choice.source?.[item.id]);
	const check = checkWielding(chosen.map((item) => item.system), {
		moved: Boolean(choice.moved),
		engaged: Boolean(choice.engaged),
		confined: Boolean(choice.confined),
		exhausted: actor.system.conditions.exhausted,
		// A mounted charge is made on horseback.
		mounted: Boolean(choice.mounted || choice.charge),
		spearwall: Boolean(choice.spearwall),
		// Stat blocks don't say how the Cast hold their attacks, so only Knights count hands.
		hands: actor.type === "knight"
	});
	return { chosen, check };
}

/**
 * What stops or changes the Attack as chosen, one line each.
 * @param {Actor} actor
 * @param {Item[]} chosen
 * @param {ReturnType<typeof checkWielding>} check
 * @returns {string[]}
 */
function wieldingProblems(actor, chosen, check) {
	const lines = check.refusal ? [t(`attack.refusals.${check.refusal}`, { name: actor.name })] : [];
	for (const { index, reason } of check.setAside) lines.push(t(`attack.setAside.${reason}`, { name: chosen[index].name }));
	if (check.impaired) lines.push(t("attack.confinedImpaired"));
	return lines;
}

/**
 * Keep the Attack dialog's list of problems up to date as boxes are ticked, and
 * hold back the roll while the Attack can't be made.
 * @param {foundry.applications.api.DialogV2} dialog
 * @param {Actor} actor
 * @param {Item[]} sources
 */
function watchWielding(dialog, actor, sources) {
	const form = dialog.element.querySelector("form");
	const list = form?.querySelector("[data-wielding-problems]");
	if (!list) return;
	const roll = dialog.element.querySelector("[data-action='ok']");

	const update = () => {
		const choice = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(form).object);
		const { chosen, check } = readWielding(actor, sources, choice);
		list.replaceChildren(...wieldingProblems(actor, chosen, check).map((text) => {
			const line = document.createElement("li");
			line.textContent = text;
			return line;
		}));
		list.hidden = list.childElementCount === 0;
		if (roll) roll.disabled = Boolean(check.refusal);
	};
	form.addEventListener("change", update);
	update();
}

/**
 * Ask which weapons to use, roll the Attack dice together, and post a card
 * where the table declares Deny and Gambits and applies the Damage. A Blast
 * against several targeted Tokens rolls separately for each, one card apiece.
 * @param {Actor} actor
 * @returns {Promise<ChatMessage[]|null>}
 */
export async function attack(actor) {
	const sources = attackSources(actor);
	const mount = mountOf(actor);
	const { conditions } = actor.system;
	const warband = actor.system.scale === "warband";

	const leaders = warband ? leaderCandidates(actor) : [];
	const duel = openDuelFor(actor);
	// Gambits a foe landed on them (p10): an Impair holds this turn, a Trap holds a shield back.
	const marks = marksOn(actor);
	// An Impaired attack rolls a single d4 only (p9), however it came to be Impaired,
	// so a landed Impair leaves no room for Smite's +d12 any more than SPI 0 does.
	const startsImpaired = conditions.impaired || marks.some((mark) => mark.key === "impair");

	// Somebody with a steed is taken to be riding it, but may have dismounted. A joust is fought mounted.
	const mounted = Boolean(actor.system.steed) || duel?.duel.kind === "joust";
	// Items that can't be held together open with only the hardest-hitting of them ticked.
	const wielded = defaultWielded(sources.map((item) => item.system), { mounted, hands: actor.type === "knight" });

	const data = await inputDialog({
		title: t("attack.title"),
		icon: "fa-solid fa-swords",
		template: "attack",
		context: {
			sources: sources.map((item, index) => ({
				id: item.id,
				name: item.name,
				tags: [item.system.damage, ...SHOWN_QUALITIES.filter((key) => item.system[key]).map((key) => t(`item.${key}`))].join(" · "),
				checked: wielded.includes(index),
				// Ticked by the player when the situation it's made for comes up.
				specialist: specialistLabel(item.system)
			})),
			moved: movedThisTurn(actor),
			mounted,
			duel: duel && t("duel.attackIn", { kind: t(`duel.kinds.${duel.duel.kind}.label`), name: duel.opponent.name }),
			charge: mount && t("attack.charge", { steed: mount.steed.name, dice: mount.trample.map((item) => item.system.damage).join(" + ") }),
			exhausted: conditions.exhausted,
			impaired: startsImpaired,
			marks: marks.map((mark) => mark.hint),
			smiteDisabled: conditions.fatigued || startsImpaired || !sources.length || !actor.system.knowsFeat("smite"),
			warband,
			leaders: leaders.map((leader) => ({ uuid: leader.uuid, name: leader.name, selected: leader.uuid === actor.system.leader }))
		},
		ok: { label: t("attack.roll"), icon: "fa-solid fa-dice" },
		render: (_event, dialog) => watchWielding(dialog, actor, sources)
	});
	if (!data) return null;

	const choice = foundry.utils.expandObject(data);
	const { chosen: picked, check } = readWielding(actor, sources, choice);
	if (check.refusal) {
		ui.notifications.warn(t(`attack.refusals.${check.refusal}`, { name: actor.name }));
		return null;
	}
	const chosen = check.usable.map((index) => picked[index]);
	// Leading from the front adds the leader's Attack dice to the Warband's roll (p11).
	const leader = leaders.find((candidate) => candidate.uuid === choice.leader) ?? null;
	// What rolls, each group's dice labelled with the item or whoever brings them.
	const weaponGroups = [
		{ items: chosen, label: null },
		{ items: mount && choice.charge ? mount.trample : [], label: mount?.steed.name },
		{ items: leader ? attackSources(leader) : [], label: leader?.name }
	];
	const weaponItems = weaponGroups.flatMap(({ items }) => items);
	const weaponDice = weaponGroups.flatMap(({ items, label }) =>
		items.flatMap((item) => parseDice(item.system.damage).map((faces) => ({ faces, label: label ?? item.name }))));
	// They share the Warband's Damage until their next turn, so the Warband remembers who leads it,
	// and forgets a leader who no longer does.
	const leaderUuid = leader?.uuid ?? "";
	if (warband && actor.isOwner && actor.system.leader !== leaderUuid) await actor.update({ "system.leader": leaderUuid });
	const impaired = Boolean(choice.impaired) || check.impaired || !weaponDice.length;
	// A Warband's Attack on individuals gets +d12 and Blast (Warfare, p11).
	const againstIndividuals = warband && Boolean(choice.againstIndividuals);

	// Smite is declared before rolling, and Impaired attacks cannot benefit from Feats.
	let smite = null;
	if (choice.smite && !impaired) {
		const save = await resolveFeat(actor, "smite");
		if (save) smite = { mode: choice.smite, feat: featContext("smite", save), roll: save.roll };
	}

	const bonusDice = parseDice(choice.bonus).map((faces) => ({ faces, label: t("attack.bonus") }));
	// A specialist weapon's die joins only when it's wielded in the situation it's made for (p12).
	for (const item of chosen.filter((candidate) => choice.specialist?.[candidate.id])) {
		const die = specialistDie(item.system);
		if (die) bonusDice.push(...parseDice(die).map((faces) => ({ faces, label: t("attack.specialistDie", { name: item.name }) })));
	}
	if (smite?.mode === "d12") bonusDice.push({ faces: 12, label: t("feats.smite.name") });
	if (againstIndividuals) bonusDice.push({ faces: 12, label: t("npc.scales.warband.label") });

	const pool = buildAttackPool({
		sources: weaponItems.map((item) => item.system.damage),
		bonus: bonusDice.map((die) => die.faces),
		impaired
	});
	const dice = pool.impaired
		? [{ faces: 4, label: t(weaponDice.length ? "conditions.impaired.label" : "attack.unarmed") }]
		: [...weaponDice, ...bonusDice];

	const blast = smite?.mode === "blast" || againstIndividuals || chosen.some((item) => item.system.blast);
	// An Attack in a duel is against the other duelist, whatever else is targeted.
	const inDuel = duel && choice.duel ? duel : null;
	const targets = inDuel?.opponent.token ? [{ uuid: inDuel.opponent.token, name: inDuel.opponent.name }] : currentTargets();
	// Blast attacks target everybody in their area, rolling each separately (p8).
	const groups = blast && targets.length > 1 ? targets.map((target) => [target]) : [targets];

	const shared = {
		// Cards from one Blast share an id, so a Feat used on one counts for all of them.
		attackId: foundry.utils.randomID(),
		attacker: actor.uuid,
		attackerName: actor.name,
		// Where in a running Combat this was rolled, so a Gambit's mark knows when it lapses.
		place: combatPlace(),
		melee: !chosen.some((item) => item.system.ranged),
		impaired: pool.impaired,
		// A Long weapon in a confined space is why this Attack is Impaired.
		confined: check.impaired,
		setAside: check.setAside.map(({ index, reason }) => ({ name: picked[index].name, reason })),
		blast,
		ignoresArmour: chosen.some((item) => item.system.ignoresArmour),
		// A Warband's Attack is large-scale, so it can harm another Warband.
		largeScale: warband,
		leader: leader ? { uuid: leader.uuid, name: leader.name } : null,
		smite: smite?.feat ?? null,
		duel: inDuel?.message.id ?? null,
		gambits: [],
		feats: [],
		appliedTo: []
	};

	const messages = [];
	for (const [index, group] of groups.entries()) {
		const roll = await new Roll(dice.map((die) => `1d${die.faces}`).join(" + ")).evaluate();
		const rolled = dice.map((die, i) => ({ ...die, result: roll.dice[i].total, deniedBy: null }));
		const state = { ...shared, targets: group, dice: sortDice(rolled) };
		// The Smite Save was rolled once, so only the first card carries it.
		const rolls = smite && index === 0 ? [smite.roll, roll] : [roll];
		messages.push(await postCard(actor, "attack", attackCardContext(state), {
			rolls,
			flags: { [SYSTEM_ID]: { attack: state } }
		}));
	}
	if (inDuel && messages.length) await saveDuelChange(inDuel.message, { type: "attack", actor: actor.uuid, message: messages[0].id });
	return messages;
}

/**
 * Where a declared Gambit stands with the foe it was aimed at: no Save to be
 * had, one still to roll, or one already rolled (p10).
 * @param {import("../rules/attack.js").Gambit} gambit
 * @param {number} index
 * @param {boolean} settled Whether the Damage has been applied.
 * @returns {object|null} Null once a settled Attack leaves a Save unrolled.
 */
function gambitSaveContext(gambit, index, settled) {
	// A Strong Gambit that denies the Save already says so in its tag.
	if (!gambitAllowsSave(gambit)) return gambit.strong === "noSave" ? null : { none: t("attack.gambitNoSave") };
	if (gambit.save) {
		const { by, total, target, passed } = gambit.save;
		return { passed, result: t(passed ? "attack.gambitSaved" : "attack.gambitFailed", { name: by, total, target }) };
	}
	return settled ? null : { index, button: t("attack.gambitSave") };
}

/**
 * The book's line for each Gambit, folded into the card so somebody who
 * doesn't know the rule can see what a die of 4+ would buy them (p10).
 * @returns {{label: string, lines: string[], strong: string, hint: string}}
 */
function gambitHelp() {
	return {
		label: t("attack.gambitHelp"),
		lines: GAMBITS.map((key) => t(`gambits.${key}`)),
		strong: t("gambits.strong"),
		hint: t("gambits.hint")
	};
}

/**
 * The line reminding whoever is about to be hurt that they can still Deny one
 * of these dice (p10). It names the targets who could, since they are the ones
 * with something to lose; an ally within arm's reach may Deny for them, so the
 * card falls silent rather than naming somebody who can't. An Attack rolled at
 * nobody in particular names nobody either way.
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {boolean} settled
 * @returns {string|null}
 */
function denyPrompt(attack, settled) {
	if (settled || !hasDeniableDie(attack)) return null;
	if (!attack.targets.length) return t("attack.denyPromptAny");
	const names = attack.targets
		.map((target) => fromUuidSync(target.uuid)?.actor)
		.filter((actor) => canDenyAttack(attack, actor))
		.map((actor) => actor.name);
	return names.length ? t("attack.denyPrompt", { names: names.join(", ") }) : null;
}

/**
 * Template data for an Attack card at any point: fresh from the roll, part way
 * through Deny and Gambits, or settled once the Damage is applied.
 * @param {import("../rules/attack.js").AttackState} attack
 */
export function attackCardContext(attack) {
	const { highest, bolster, damage, die: counted } = attackDamage(attack);
	const settled = attack.appliedTo.length > 0;
	const remaining = attack.dice.filter((_die, index) => !isDieSpent(attack, index)).map((die) => die.result);
	const summary = summarizeAttack(remaining, { melee: attack.melee });
	const gambitName = (key) => t(`gambits.names.${key}`);

	return {
		smite: attack.smite,
		targets: attack.targets.length ? t("attack.against", { names: attack.targets.map((target) => target.name).join(", ") }) : null,
		dice: attack.dice.map((die, index) => {
			const gambit = attack.gambits.find((entry) => entry.die === index);
			let spentOn = null;
			if (gambit) spentOn = gambitName(gambit.key);
			else if (die.deniedBy) spentOn = t("attack.deniedBy", { name: die.deniedBy });
			return {
				index,
				faces: die.faces,
				// The outline the card draws behind the result, so a d12 is told from a d6 without reading.
				shape: dieMask(die.faces),
				result: die.result,
				label: spentOn ?? die.label,
				spent: Boolean(spentOn),
				isHighest: index === counted,
				isGambit: canFundGambit(attack, index),
				isStrong: canFundStrongGambit(attack, index),
				// A die of 4+ can be spent, and a die spent on a Gambit can be taken back.
				locked: settled || !(gambit || canFundGambit(attack, index))
			};
		}),
		gambits: attack.gambits.map((gambit, index) => {
			const ignored = gambitIgnored(gambit);
			return {
				// The book's own line, which names the Gambit and says how long it lasts.
				effect: t(`gambits.${gambit.key}`),
				source: gambit.die === null
					? t("feats.focus.name")
					: t("attack.dieSource", { faces: attack.dice[gambit.die].faces, result: attack.dice[gambit.die].result }),
				strong: gambit.strong ? t(`attack.strong.${gambit.strong}`) : null,
				// A Dismount the target Saved against adds nothing, so its d6 goes unmentioned.
				bonus: gambit.bonus && !ignored ? t("attack.dismounted", { result: gambit.bonus }) : null,
				ignored,
				save: gambitSaveContext(gambit, index, settled)
			};
		}),
		damage,
		breakdown: bolster ? t("attack.breakdown", { highest, bolster }) : null,
		// Said only while there is a choice to make, so the line keeps its weight.
		gambitPrompt: settled || !summary.gambitDice ? null : plural("attack.gambitPrompt", summary.gambitDice),
		strongPrompt: settled || !summary.strongDice ? null : plural("attack.strongPrompt", summary.strongDice),
		// Said while a die is still there to discard, so the reminder lands before the Damage does.
		denyPrompt: denyPrompt(attack, settled),
		takeBack: !settled && attack.gambits.some((gambit) => gambit.die !== null) ? t("attack.takeBack") : null,
		// A Gambit is still to be had while a die can pay for one, or Focus can.
		gambitHelp: settled || !(summary.gambitDice || !attack.impaired) ? null : gambitHelp(),
		// Cards rolled before weapons could be set aside have no list.
		setAside: (attack.setAside ?? []).map(({ name, reason }) => t(`attack.setAside.${reason}`, { name })),
		impaired: attack.impaired,
		confined: Boolean(attack.confined),
		blast: attack.blast,
		ignoresArmour: attack.ignoresArmour,
		// Cards rolled before leading from the front have no leader.
		leader: attack.leader ? t("attack.ledBy", { name: attack.leader.name }) : null,
		// A duel's Attacks are applied together from the duel card.
		duel: Boolean(attack.duel),
		settled,
		appliedTo: settled ? t("attack.applied", { names: attack.appliedTo.join(", ") }) : null
	};
}

/**
 * @param {import("../rules/attack.js").AttackState} attack
 * @returns {Promise<string>} The card's HTML.
 */
export function renderAttackCard(attack) {
	return foundry.applications.handlebars.renderTemplate(templatePath("chat/attack.hbs"), attackCardContext(attack));
}
