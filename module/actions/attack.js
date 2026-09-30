import { inputDialog } from "../apps/ui.js";
import { plural, postCard, t } from "../chat/cards.js";
import { combatPlace, marksOn } from "../chat/gambit-marks.js";
import { GAMBITS } from "../config.js";
import {
	ALTERNATE_QUALITIES,
	HARM_BARS,
	atIndividuals,
	buildAttackPool,
	canFundGambit,
	canFundStrongGambit,
	canJoin,
	checkWielding,
	damageAgainst,
	defaultWielded,
	gambitAllowsSave,
	gambitIgnored,
	gambitSaveVirtue,
	harmBarred,
	harmTargetOf,
	hasDeniableDie,
	isIndividual,
	knownWeakness,
	parseDice,
	shareOf,
	sortDice,
	specialistDie,
	swarmImpairs,
	trampleJoins,
	weaknessFaces,
	wieldsInHands
} from "../rules/attack.js";
import { dieMask } from "../rules/die-shapes.js";
import { impairedItem, impairsWhole } from "../rules/gambit-marks.js";
import { countAfter, isAtHand, isCounted } from "../rules/restock.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { chatIsPublic, playBlowFx } from "./attack-fx.js";
import { alternateText } from "./items.js";
import { recallAttack, rememberAttack, rememberedTicks, wieldedWith } from "./attack-memory.js";
import { openDuelFor, saveDuelChange } from "./duel.js";
import { canDenyAttack, featContext, payFeat, rollFeat } from "./feats.js";
import { leaderCandidates } from "./leading.js";
import { structureHarm } from "../rules/structures.js";

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
 * @typedef {object} AttackSource One way to add dice to an Attack: a weapon or
 *   shield, or a weapon's other way to fight, such as a bolt-guisarme shot.
 * @property {string} id      The item's id, or for its other way, the id with "-alt" after it.
 * @property {string} name
 * @property {object} system  What it rolls and how it's held, as an item's system data has it.
 * @property {Item} item      The item it comes from.
 */

/** What an Attack reads off a weapon's or shield's system data. */
const WIELDED_KEYS = Object.freeze(["damage", "hefty", "long", "slow", "ranged", "blast", "ignoresArmour", "heftyMounted", "trample", "specialist", "usedUp"]);

/**
 * Worn or wielded items that add Attack dice: weapons, and armour with an
 * attack die such as a shield. A weapon fought two ways is offered once for
 * each, and a broken one, or one all used up, not at all.
 * @param {Actor} actor
 * @returns {AttackSource[]}
 */
function attackSources(actor) {
	return armedWith(actor).filter(({ item }) => isAtHand(item.system)).flatMap((source) => {
		const { item } = source;
		const alternate = item.system.alternate;
		if (!alternate?.damage?.trim()) return [source];
		const how = alternate.label?.trim() || alternateText(item.system);
		return [source, {
			id: `${item.id}-alt`,
			name: t("attack.alternateName", { name: item.name, how }),
			item,
			system: {
				...source.system,
				damage: alternate.damage,
				...Object.fromEntries(ALTERNATE_QUALITIES.map((key) => [key, alternate[key]])),
				heftyMounted: false
			}
		}];
	});
}

/**
 * Everything worn or wielded that has Attack dice, usable or not.
 * @param {Actor} actor
 * @returns {AttackSource[]}
 */
function armedWith(actor) {
	return actor.items
		.filter((item) => item.system.equipped && parseDice(item.system.damage).length)
		.map((item) => ({
			id: item.id,
			name: item.name,
			item,
			// Both ways of a weapon fought two ways name it, so only one of them is ticked, and
			// so do attacks printed with "or" between them.
			system: { ...Object.fromEntries(WIELDED_KEYS.map((key) => [key, item.system[key]])), of: item.system.either || item.id }
		}));
}

/**
 * Names of what is worn or wielded with Attack dice but can't be used, being
 * broken or all used up, for a line under the weapons in the Attack dialog.
 * @param {Actor} actor
 * @returns {string|null}
 */
function unavailableNames(actor) {
	const names = armedWith(actor).filter(({ item }) => !isAtHand(item.system)).map(({ name }) => name);
	return names.length ? t("attack.unavailable", { names: names.join(", ") }) : null;
}

/**
 * Take one off the count of each thing whose every Attack uses one up, such
 * as a titan bead thrown, and say how many are left.
 * @param {AttackSource[]} chosen
 */
async function useUpThrown(chosen) {
	const items = [...new Set(chosen.map(({ item }) => item))].filter((item) => item.system.usedUp && isCounted(item.system) && item.isOwner);
	await Promise.all(items.map((item) => {
		const left = countAfter(item.system.quantity, -1);
		ui.notifications.info(t("attack.usedOne", { name: item.name, left }));
		return item.update({ "system.quantity.value": left });
	}));
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
 * How a targeted Token stands: whether it's mounted or a structure, for a
 * steed's trample, which only joins a charge at enemies on foot (p10), and
 * whether it's a swarm, which one person's Attack only harms Impaired unless
 * it's a Blast (p61). A Token whose actor can't be found is taken to
 * be one person on foot. A Warband is told apart too, since a Warband's Attack
 * at individuals gets +d12 and Blast (p11).
 * @param {{uuid: string}} target
 * @returns {{mounted: boolean, structure: boolean, swarm: boolean, warband: boolean}}
 */
function standingOf({ uuid }) {
	const actor = fromUuidSync(uuid)?.actor;
	if (!actor) return { mounted: false, structure: false, swarm: false, warband: false };
	return {
		mounted: Boolean(actor.system.conditions?.mounted),
		structure: actor.type === "structure" || Boolean(actor.system.structure),
		swarm: actor.type === "npc" && actor.system.scale === "swarm",
		warband: actor.type === "npc" && actor.system.scale === "warband"
	};
}

/**
 * How a Warband's Attack dialog opens its Against individuals box (p11, p189):
 * ticked when everybody targeted is one person or beast, unticked when a
 * Warband, a swarm or a structure is among them, and as they last rolled it
 * when nobody is targeted. Its tooltip says which way the targets read.
 * @param {{uuid: string, name: string}[]} targets
 * @param {boolean} remembered How the box opens with nobody targeted.
 * @returns {{checked: boolean, tip: string|null}}
 */
function individualsTick(targets, remembered) {
	const standing = targets.map(standingOf);
	const all = atIndividuals(standing);
	if (all === null) return { checked: remembered, tip: null };
	if (all) return { checked: true, tip: t("attack.individualsAll", { names: targets.map(({ name }) => name).join(", ") }) };
	const others = targets.filter((_target, index) => !isIndividual(standing[index])).map(({ name }) => name);
	return { checked: false, tip: t("attack.individualsNot", { names: others.join(", ") }) };
}

/**
 * Why a charge's trample can't join an Attack at these targets, for the Attack
 * dialog to say beside its charge box.
 * @param {{uuid: string, name: string}[]} targets
 * @returns {string|null} Null when it joins, or nobody is targeted yet.
 */
function trampleBarred(targets) {
	if (trampleJoins(targets.map(standingOf))) return null;
	return t("attack.chargeBarred", { names: targets.map(({ name }) => name).join(", ") });
}

/**
 * The weaknesses of these targets that the Knights have learned, each of which
 * gives every Attack that uses it a bonus die (p188). The Attack dialog offers
 * them ticked, to be unticked for a blow that doesn't use it.
 * @param {{uuid: string, name: string}[]} targets
 * @returns {{uuid: string, name: string, text: string, die: string}[]}
 */
function weaknessesOf(targets) {
	return targets.flatMap((target) => {
		const weakness = knownWeakness(fromUuidSync(target.uuid)?.actor?.system);
		return weakness ? [{ ...target, ...weakness }] : [];
	});
}

/**
 * The die a card at these targets gains from the weaknesses ticked in the
 * Attack dialog, one die however many of them it hits.
 * @param {{uuid: string}[]} group The card's targets.
 * @param {ReturnType<typeof weaknessesOf>} used The weaknesses ticked.
 * @returns {{faces: number, label: string}[]}
 */
function weaknessDice(group, used) {
	const hit = used.filter((weakness) => group.some((target) => target.uuid === weakness.uuid));
	const faces = weaknessFaces(hit);
	if (!faces) return [];
	const { text } = hit.find((weakness) => parseDice(weakness.die)[0] === faces);
	// Marked, so whoever joins the Attack doesn't add a second (p8).
	return [{ faces, label: text ? t("attack.weaknessDie", { text }) : t("attack.weaknessDieBare"), weakness: true }];
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
 * Whether an Attack is held to what two hands can wield (p12): always for a
 * Knight, never for a Warband, whose Attack is its members', and for anybody
 * else as their sheet or their gear says.
 * @param {Actor} actor
 * @returns {boolean}
 */
function countsHands(actor) {
	if (actor.type === "knight") return true;
	if (actor.type !== "npc" || actor.system.scale === "warband") return false;
	return wieldsInHands(actor.system.wields, [...actor.items]);
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
		smite: Boolean(choice.smite),
		hands: countsHands(actor)
	});
	return { chosen, check };
}

/**
 * What stops or changes the Attack as chosen, one line each.
 * @param {Actor} actor
 * @param {AttackSource[]} chosen
 * @param {ReturnType<typeof checkWielding>} check
 * @param {import("../rules/gambit-marks.js").Mark[]} [marks] Gambits a foe landed on them.
 * @returns {string[]}
 */
function wieldingProblems(actor, chosen, check, marks = []) {
	const lines = check.refusal ? [t(`attack.refusals.${check.refusal}`, { name: actor.name })] : [];
	for (const { index, reason } of check.setAside) lines.push(t(`attack.setAside.${reason}`, { name: chosen[index].name }));
	if (check.impaired) lines.push(t("attack.confinedImpaired"));
	// A foe's Impair on one of their weapons holds any Attack made with it (p186).
	const held = impairedItem(marks, check.usable.map((index) => chosen[index].item));
	if (held) lines.push(t("attack.weaponImpaired", { name: held }));
	return lines;
}

/**
 * Keep the Attack dialog's list of problems up to date as boxes are ticked, and
 * hold back the roll while the Attack can't be made.
 * @param {foundry.applications.api.DialogV2} dialog
 * @param {Actor} actor
 * @param {AttackSource[]} sources
 * @param {import("../rules/gambit-marks.js").Mark[]} marks
 */
function watchWielding(dialog, actor, sources, marks) {
	const form = dialog.element.querySelector("form");
	const list = form?.querySelector("[data-wielding-problems]");
	if (!list) return;
	const roll = dialog.element.querySelector("[data-action='ok']");

	const update = () => {
		const choice = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(form).object);
		const { chosen, check } = readWielding(actor, sources, choice);
		list.replaceChildren(...wieldingProblems(actor, chosen, check, marks).map((text) => {
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
 * Which weapons the dialog opens ticked: the ones this actor last rolled with,
 * and the hardest-hitting of anything they've taken up since. A remembered set
 * that can't be held together any more — a shield beside a weapon since made
 * Hefty — gives way to the hardest-hitting set instead, so the dialog doesn't
 * open on an Attack that can't be rolled. A weapon a foe's Impair holds opens
 * unticked while there's anything else to fight with (p186).
 * @param {Actor} actor
 * @param {AttackSource[]} sources
 * @param {import("./attack-memory.js").AttackChoice|null} remembered
 * @param {boolean} mounted
 * @param {import("../rules/gambit-marks.js").Mark[]} [marks] Gambits a foe landed on them.
 * @returns {number[]} Indexes into sources.
 */
function openingWielded(actor, sources, remembered, mounted, marks = []) {
	const items = sources.map((item) => item.system);
	const options = { mounted, hands: countsHands(actor) };
	const hardest = defaultWielded(items, options);
	const kept = remembered ? wieldedWith(remembered, sources.map((item) => item.id), hardest) : hardest;
	const opening = kept === hardest || !checkWielding(kept.map((index) => items[index]), options).refusal ? kept : hardest;
	const held = sources.map((source) => impairedItem(marks, [source.item]) !== null);
	const free = sources.flatMap((_source, index) => (held[index] ? [] : [index]));
	if (!free.length || !opening.some((index) => held[index])) return opening;
	return defaultWielded(free.map((index) => items[index]), options).map((at) => free[at]);
}

/**
 * @typedef {object} AttackPlan How somebody attacks, as their Attack dialog was
 *   answered: what they wield, the dice that brings before anything is rolled,
 *   and what the card says of it.
 * @property {Actor} actor
 * @property {object} choice             The dialog's expanded form data.
 * @property {AttackSource[]} picked     Everything ticked.
 * @property {AttackSource[]} chosen     What's used of it, once set-aside weapons are left out.
 * @property {ReturnType<typeof checkWielding>} check
 * @property {ReturnType<typeof mountOf>} mount
 * @property {boolean} warband
 * @property {Actor|null} leader
 * @property {object[]} weaponItems      What adds dice: their weapons, a steed's trample, a leader's.
 * @property {{faces: number, label: string, trample: boolean}[]} weaponDice
 * @property {{faces: number, label: string}[]} dice The dice to roll, before a card's targets are weighed.
 * @property {{impaired: boolean}} pool
 * @property {() => Promise<void>} settle What the Attack does to the actor once it counts: remembers
 *   the choices, marks them riding or led, pays for Smite, and uses up whatever is thrown.
 * @property {{mode: string, feat: object, roll: Roll, save: object}|null} smite
 * @property {ReturnType<typeof weaknessesOf>} exploited The known weaknesses ticked.
 * @property {boolean} blast
 * @property {object|null} inDuel        The duel this is a blow in.
 * @property {{uuid: string, name: string}[]} targets
 * @property {string|null} impairedWeapon The weapon a foe's Impair holds, when that alone Impairs this Attack.
 * @property {boolean} againstIndividuals A Warband's Attack ticked as against individuals, whose +d12 joins
 *   only the cards at individuals (p11).
 */

/**
 * Ask how an actor attacks and gather the dice they bring: the Attack dialog,
 * and what answering it settles before anything is rolled, such as a Smite's
 * Save, riding or not, and who leads a Warband. A fresh Attack and joining
 * another's are both made this way (p8).
 * @param {Actor} actor
 * @param {import("../rules/attack.js").AttackState|null} [joining] The card they join, whose targets they strike.
 * @returns {Promise<AttackPlan|null>} Null if the dialog was closed or the Attack can't be made.
 */
async function planAttack(actor, joining = null) {
	const sources = attackSources(actor);
	const mount = mountOf(actor);
	const { conditions } = actor.system;
	const warband = actor.system.scale === "warband";

	const leaders = warband ? leaderCandidates(actor) : [];
	// Joining somebody's Attack is never a blow in a duel, which is one on one.
	const duel = joining ? null : openDuelFor(actor);
	// Gambits a foe landed on them (p10): an Impair holds this turn, a Trap holds a shield back.
	const marks = marksOn(actor);
	// An Impaired attack rolls a single d4 only (p9), however it came to be Impaired,
	// so a landed Impair leaves no room for Smite's +d12 any more than SPI 0 does.
	// An Impair that named one weapon holds only an Attack made with it (p186).
	const startsImpaired = conditions.impaired || impairsWhole(marks);

	// What this actor last rolled an Attack with, which the dialog opens on again.
	const remembered = recallAttack(actor);
	// A joust is fought mounted, and so is anybody marked Mounted. Otherwise nobody is taken to be
	// riding, steed or no, until they say so.
	const mounted = duel?.duel.kind === "joust" || Boolean(conditions.mounted) || Boolean(remembered?.mounted);
	const wielded = openingWielded(actor, sources, remembered, mounted, marks);
	// Who the Attack is aimed at as the dialog opens: the card's targets for a joint Attack, the
	// other duelist in a duel, and otherwise whoever this user targets.
	const aimedAt = joining ? joining.targets : duel?.opponent.token ? [{ uuid: duel.opponent.token, name: duel.opponent.name }] : currentTargets();
	// Nobody on foot among the targets leaves the steed nobody to trample.
	const chargeBarred = mount ? trampleBarred(aimedAt) : null;
	// A joint Attack is one Attack, so a weakness whose die is already on the card adds no second (p188).
	const weaknesses = joining?.dice.some((die) => die.weakness) ? [] : weaknessesOf(aimedAt);
	const ticks = rememberedTicks(remembered);
	// A Warband's Attack at individuals only gets +d12 and Blast (p11), so the targets tick the box.
	const individuals = warband ? individualsTick(aimedAt, ticks.againstIndividuals) : null;

	const data = await inputDialog({
		title: joining ? t("attack.joinTitle", { name: joining.attackerName ?? fromUuidSync(joining.attacker)?.name ?? "" }) : t("attack.title"),
		icon: "fa-solid fa-swords",
		template: "attack",
		context: {
			sources: sources.map((item, index) => ({
				id: item.id,
				name: item.name,
				tags: [item.system.damage, ...SHOWN_QUALITIES.filter((key) => item.system[key]).map((key) => t(`item.${key}`)), isCounted(item.item.system) ? t("item.quantityTagBare", { value: item.item.system.quantity.value }) : null].filter(Boolean).join(" · "),
				checked: wielded.includes(index),
				// Ticked by the player when the situation it's made for comes up.
				specialist: specialistLabel(item.system),
				specialistChecked: Boolean(remembered?.specialist?.[item.id])
			})),
			...ticks,
			againstIndividuals: individuals?.checked ?? ticks.againstIndividuals,
			againstIndividualsTip: individuals?.tip ?? null,
			// Worn or wielded, but broken or all used up, so not offered.
			unavailable: unavailableNames(actor),
			moved: movedThisTurn(actor),
			// Read off the world rather than remembered, so it follows the steed.
			mounted,
			// A sparring bout says so, since its Damage is shaken off afterwards (p188).
			duel: duel && t(duel.duel.sparring ? "duel.attackInSparring" : "duel.attackIn", { kind: t(`duel.kinds.${duel.duel.kind}.label`), name: duel.opponent.name }),
			charge: mount && t("attack.charge", { steed: mount.steed.name, dice: mount.trample.map((item) => item.system.damage).join(" + ") }),
			chargeBarred,
			exhausted: conditions.exhausted,
			impaired: startsImpaired,
			// A swarm aimed at is named, so a Blast, which isn't Impaired by it, can be chosen before rolling.
			marks: [...marks.map((mark) => mark.hint), ...aimedAt.filter((target) => standingOf(target).swarm).map(({ name }) => t("attack.swarmHint", { name }))],
			weaknesses: weaknesses.map(({ name, text, die }, index) => ({
				index,
				label: text ? t("attack.weakness", { name, text, die }) : t("attack.weaknessBare", { name, die })
			})),
			smiteDisabled: conditions.fatigued || startsImpaired || !sources.length || !actor.system.knowsFeat("smite"),
			warband,
			leaders: leaders.map((leader) => ({ uuid: leader.uuid, name: leader.name, selected: leader.uuid === actor.system.leader }))
		},
		ok: { label: t(joining ? "attack.joinRoll" : "attack.roll"), icon: "fa-solid fa-dice" },
		render: (_event, dialog) => watchWielding(dialog, actor, sources, marks)
	});
	if (!data) return null;

	const choice = foundry.utils.expandObject(data);
	const { chosen: picked, check } = readWielding(actor, sources, choice);
	if (check.refusal) {
		ui.notifications.warn(t(`attack.refusals.${check.refusal}`, { name: actor.name }));
		return null;
	}
	const riding = Boolean(choice.mounted || choice.charge);
	const chosen = check.usable.map((index) => picked[index]);
	// Leading from the front adds the leader's Attack dice to the Warband's roll (p11).
	const leader = leaders.find((candidate) => candidate.uuid === choice.leader) ?? null;
	// What rolls, each group's dice labelled with the item or whoever brings them. The actor's
	// own dice name the item too, so a foe can Impair the weapon it has seen (p186).
	const weaponGroups = [
		{ items: chosen, label: null, own: true },
		{ items: mount && choice.charge ? mount.trample : [], label: mount?.steed.name, trample: true },
		{ items: leader ? armedWith(leader).filter(({ item }) => isAtHand(item.system)) : [], label: leader?.name }
	];
	const weaponItems = weaponGroups.flatMap(({ items }) => items);
	const weaponDice = weaponGroups.flatMap(({ items, label, trample = false, own = false }) =>
		items.flatMap((source) => parseDice(source.system.damage).map((faces) => ({
			faces,
			label: label ?? source.name,
			trample,
			...(own ? { item: source.item.id } : {})
		}))));
	// A foe's Impair on one weapon holds this Attack only if it's made with that weapon (p186).
	const impairedWeapon = impairedItem(marks, chosen.map(({ item }) => item));
	// Impaired is read off the actor and the marks on them, never declared in the dialog.
	const impaired = startsImpaired || Boolean(impairedWeapon) || check.impaired || !weaponDice.length;
	// A Warband's Attack on individuals gets +d12 and Blast (Warfare, p11).
	const againstIndividuals = warband && Boolean(choice.againstIndividuals);

	// Smite is declared before rolling, and Impaired attacks cannot benefit from Feats.
	let smite = null;
	if (choice.smite && !impaired) {
		const save = await rollFeat(actor, "smite");
		if (save) smite = { mode: choice.smite, feat: featContext("smite", save), roll: save.roll, save };
	}

	const bonusDice = parseDice(choice.bonus).map((faces) => ({ faces, label: t("attack.bonus") }));
	// A specialist weapon's die joins only when it's wielded in the situation it's made for (p12).
	for (const item of chosen.filter((candidate) => choice.specialist?.[candidate.id])) {
		const die = specialistDie(item.system);
		if (die) bonusDice.push(...parseDice(die).map((faces) => ({ faces, label: t("attack.specialistDie", { name: item.name }), item: item.item.id })));
	}
	// Smite for a lasting mark adds no dice: the Wound it deals leaves the mark (p187).
	if (smite?.mode === "d12") bonusDice.push({ faces: 12, label: t("feats.smite.name") });
	// A known weakness joins each card at whoever has it, and only while it's ticked.
	const exploited = weaknesses.filter((_weakness, index) => choice.weakness?.[index]);

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
	let targets = currentTargets();
	if (joining) targets = joining.targets;
	else if (inDuel?.opponent.token) targets = [{ uuid: inDuel.opponent.token, name: inDuel.opponent.name }];

	// What making the Attack does to the actor, held back until it's certain to count, since
	// a card can refuse a join after the dialog is answered.
	const settle = async () => {
		// Their next Attack with this actor opens on what they chose here.
		await rememberAttack(actor, choice);
		// Riding or not, as ticked here, is marked on them, so a rider's plate counts while they ride.
		if (actor.isOwner && typeof actor.system.mounted === "boolean" && actor.system.mounted !== riding) await actor.update({ "system.mounted": riding });
		// They share the Warband's Damage until their next turn, so the Warband remembers who leads it,
		// and forgets a leader who no longer does.
		const leaderUuid = leader?.uuid ?? "";
		if (warband && actor.isOwner && actor.system.leader !== leaderUuid) await actor.update({ "system.leader": leaderUuid });
		if (smite) await payFeat(actor, smite.save);
		await useUpThrown(chosen);
	};

	return {
		settle,
		actor,
		choice,
		picked,
		chosen,
		check,
		mount,
		warband,
		leader,
		weaponItems,
		weaponDice,
		dice,
		pool,
		smite,
		exploited,
		blast,
		inDuel,
		targets,
		againstIndividuals,
		// Said on the card only where nothing else Impaired it first.
		impairedWeapon: startsImpaired || check.impaired ? null : impairedWeapon
	};
}

/**
 * What an Attack card says of how the Attack was made, beyond its dice.
 * @param {AttackPlan} plan
 * @returns {object} Part of an AttackState.
 */
function madeWith({ actor, chosen, picked, check, pool, smite, leader, warband, blast, impairedWeapon }) {
	return {
		melee: !chosen.some((item) => item.system.ranged),
		impaired: pool.impaired,
		// A Long weapon in a confined space is why this Attack is Impaired.
		confined: check.impaired,
		// A foe's Impair on the weapon it's made with is why.
		impairedWeapon,
		setAside: check.setAside.map(({ index, reason }) => ({ name: picked[index].name, reason })),
		blast,
		ignoresArmour: chosen.some((item) => item.system.ignoresArmour),
		// Its Damage never Slays or leaves anybody dying (p173).
		nonLethal: chosen.length > 0 && chosen.every((item) => item.system.nonLethal),
		// What a Cast member's weapon does besides its dice, as its stat block says: "sets area alight".
		notes: actor.type === "knight" ? [] : chosen.map((item) => ({ name: item.name, note: plainNote(item.system.description) })).filter(({ note }) => note),
		// A Warband's Attack is large-scale, so it can harm another Warband.
		largeScale: warband,
		// Fire, a siege weapon or a suitably large creature harms a structure (p11).
		structureHarm: structureHarm({
			fromSiege: actor.type === "structure",
			large: actor.type === "npc" && Boolean(actor.system.structure),
			texts: chosen.map((item) => `${item.name} ${item.system.description ?? ""}`)
		}),
		leader: leader ? { uuid: leader.uuid, name: leader.name } : null,
		smite: smite?.feat ?? null,
		// A Smite made to leave a lasting mark rather than more Damage, which a Wound brings (p187).
		smiteMark: smite?.mode === "mark"
	};
}

/**
 * How an Attack was made, as one card's roll leaves it: Impaired at a swarm,
 * and with a steed's trample set aside where it met only riders.
 * @param {ReturnType<typeof madeWith>} made
 * @param {Awaited<ReturnType<typeof rollAt>>} card
 * @returns {ReturnType<typeof madeWith>}
 */
const withCard = (made, card) => ({
	...made,
	impaired: made.impaired || card.impaired,
	setAside: card.trampleOut ? [...made.setAside, card.trampleOut] : made.setAside
});

/**
 * Roll an Attack's dice at one card's targets. A steed tramples only enemies
 * on foot (p10), so a card at riders alone leaves its dice out, and a charge
 * that was all trample fights them unarmed. An individual's Attack at a swarm
 * is Impaired unless it's a Blast (p61), and a known weakness adds its die. A
 * Warband's Attack against individuals adds its +d12 only to the cards at
 * individuals (p11, p189), not to one at a Warband, a swarm or a structure.
 * @param {AttackPlan} plan
 * @param {{uuid: string, name: string}[]} group The card's targets.
 * @returns {Promise<{roll: Roll, dice: import("../rules/attack.js").AttackDie[],
 *   trampleOut: {name: string, reason: string}|null, impaired: boolean, swarm: boolean}>}
 *   `impaired` is true where these targets alone Impair it.
 */
async function rollAt(plan, group) {
	const { weaponDice, dice, pool, mount, exploited } = plan;
	const standing = group.map(standingOf);
	const trampleOut = weaponDice.some((die) => die.trample) && !trampleJoins(standing);
	const unarmed = trampleOut && !pool.impaired && weaponDice.every((die) => die.trample);
	const swarmed = !pool.impaired && !unarmed && swarmImpairs({ blast: plan.blast, largeScale: plan.warband }, standing);
	const individuals = plan.againstIndividuals && !pool.impaired && atIndividuals(standing) !== false
		? [{ faces: 12, label: t("npc.scales.warband.label") }]
		: [];
	// An Impaired Attack rolls its d4 alone, known weakness or not.
	const cardDice = unarmed || swarmed
		? [{ faces: 4, label: t(unarmed ? "attack.unarmed" : "npc.scales.swarm.label") }]
		: [...dice.filter((die) => !(trampleOut && die.trample)), ...individuals, ...(pool.impaired ? [] : weaknessDice(group, exploited))];
	const roll = await new Roll(cardDice.map((die) => `1d${die.faces}`).join(" + ")).evaluate();
	const rolled = cardDice.map((die, i) => ({
		faces: die.faces,
		label: die.label,
		result: roll.dice[i].total,
		deniedBy: null,
		...(die.item ? { item: die.item } : {}),
		...(die.weakness ? { weakness: true } : {})
	}));
	return {
		roll,
		dice: sortDice(rolled),
		trampleOut: trampleOut ? { name: mount.steed.name, reason: "mountedFoe" } : null,
		impaired: unarmed || swarmed,
		swarm: swarmed
	};
}

/**
 * The blows on the map, as the card lands (module/actions/attack-fx.js): one for
 * each thing that added dice, the biggest die first. Once for the whole Attack,
 * however many cards a Blast split it into, and never awaited: the dice are
 * rolled and the cards are posted, so it can't cost the table anything.
 * @param {AttackPlan} plan
 */
function playBlows(plan) {
	playBlowFx({
		attacker: plan.actor,
		weapons: plan.weaponItems.map((item) => ({ name: item.name, damage: item.system.damage, ranged: Boolean(item.system.ranged) })),
		mounted: Boolean(plan.choice.mounted || plan.choice.charge),
		warband: plan.warband,
		// An Impaired Attack rolls one d4 whatever they hold (p9), so it strikes once.
		impaired: plan.pool.impaired,
		targets: plan.targets,
		// A card the table wasn't shown isn't drawn on their map either.
		whispered: !chatIsPublic()
	});
}

/**
 * Ask which weapons to use, roll the Attack dice together, and post a card
 * where the table declares Deny and Gambits and applies the Damage. A Blast
 * against several targeted Tokens rolls separately for each, one card apiece.
 * @param {Actor} actor
 * @returns {Promise<ChatMessage[]|null>}
 */
export async function attack(actor) {
	const plan = await planAttack(actor);
	if (!plan) return null;
	await plan.settle();
	const { targets, inDuel } = plan;
	// A Blast rolls for everybody in its area, one target at a time (p8).
	const groups = plan.blast && targets.length > 1 ? targets.map((target) => [target]) : [targets];

	const shared = {
		// Cards from one Blast share an id, so a Feat used on one counts for all of them.
		attackId: foundry.utils.randomID(),
		attacker: actor.uuid,
		attackerName: actor.name,
		// Where in a running Combat this was rolled, so a Gambit's mark knows when it lapses.
		place: combatPlace(),
		...madeWith(plan),
		duel: inDuel?.message.id ?? null,
		gambits: [],
		feats: [],
		appliedTo: []
	};

	const messages = [];
	for (const [index, group] of groups.entries()) {
		const card = await rollAt(plan, group);
		const state = { ...withCard(shared, card), targets: group, dice: card.dice };
		if (card.swarm) state.swarm = true;
		// The Smite Save was rolled once, so only the first card carries it.
		const rolls = plan.smite && index === 0 ? [plan.smite.roll, card.roll] : [card.roll];
		messages.push(await postCard(actor, "attack", attackCardContext(state), {
			rolls,
			flags: { [SYSTEM_ID]: { attack: state } }
		}));
	}
	if (inDuel && messages.length) await saveDuelChange(inDuel.message, { type: "attack", actor: actor.uuid, message: messages[0].id });
	playBlows(plan);
	return messages;
}

/**
 * Show dice rolled into a card that's already posted, as Dice So Nice shows a
 * new card's, to the table or only to GMs as the chat would. Adding a roll to a
 * posted message keeps its tooltip but tumbles nothing.
 * @param {Roll[]} rolls
 */
function showRolls(rolls) {
	if (!game.dice3d) return;
	const whisper = chatIsPublic() ? null : game.users.filter((user) => user.isGM).map((user) => user.id);
	for (const roll of rolls) game.dice3d.showForRoll(roll, game.user, true, whisper);
}

/**
 * Join an Attack card that hasn't landed yet: all who attack one target roll
 * together, as one Attack (p8). The joiner
 * answers their own Attack dialog, with their own Smite, aimed at the card's
 * targets, and rolls. A Blast card is joined alone, being one target's roll,
 * and a Blast can't join a card at several, since it rolls for each (p8).
 *
 * Nothing is spent until the card takes the join: `settle` pays for Smite,
 * uses up what's thrown, and shows the dice and the blows. The card can still
 * refuse it, a Gambit or Deny having been declared while the dialog stood open.
 * @param {Actor} actor Whoever joins.
 * @param {import("../rules/attack.js").AttackState} attackState The card they join.
 * @returns {Promise<{change: object, settle: () => Promise<void>}|null>} The card's `join` change
 *   (see changeAttack), or null if the dialog was closed or the join can't be made.
 */
export async function joinAttack(actor, attackState) {
	const plan = await planAttack(actor, attackState);
	if (!plan) return null;
	if (plan.blast && attackState.targets.length > 1) {
		ui.notifications.warn(t("attack.joinBlastSeveral", { name: actor.name }));
		return null;
	}
	const card = await rollAt(plan, attackState.targets);
	const rolls = [plan.smite?.roll, card.roll].filter(Boolean);
	return {
		change: {
			type: "join",
			actor: actor.uuid,
			name: actor.name,
			dice: card.dice,
			// Kept on the card's message beside its own, so the joiner's roll has its tooltip too.
			rolls: rolls.map((roll) => roll.toJSON()),
			// Made as their own card would be, a joining Warband led from the front as on one (p11).
			...withCard(madeWith(plan), card),
			swarm: card.swarm
		},
		settle: async () => {
			await plan.settle();
			showRolls(rolls);
			playBlows(plan);
		}
	};
}

/** The longest weapon note an Attack card repeats; anything longer is on the weapon itself. */
const NOTE_LENGTH = 160;

/**
 * A weapon's note as one short line of plain text for a card.
 * @param {string} html
 * @returns {string} Empty for a note too long to repeat, or none.
 */
function plainNote(html) {
	const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
	return text.length <= NOTE_LENGTH ? text : "";
}

/**
 * @param {import("../rules/attack.js").FocusSave|null|undefined} save
 * @returns {{passed: boolean, result: string}|null}
 */
function focusSaveContext(save) {
	if (!save) return null;
	const { by, total, target, passed } = save;
	return { passed, result: t(passed ? "attack.focusPassed" : "attack.focusFailed", { name: by, total, target }) };
}

/**
 * Where a declared Gambit stands with the foe it was aimed at: no Save to be
 * had, one still to roll, or one already rolled (p10).
 * @param {import("../rules/attack.js").Gambit} gambit
 * @param {number} index
 * @param {boolean} settled Whether the Damage has been applied.
 * @returns {object|null} Null once a settled Attack leaves a Save unrolled.
 */
/**
 * @param {import("../rules/attack.js").Gambit} gambit
 * @returns {string} The Virtue the foe Saves in against it, as its short name.
 */
const virtueOf = (gambit) => t(`virtues.${gambitSaveVirtue(gambit)}.abbr`);

function gambitSaveContext(gambit, index, settled) {
	// A Strong Gambit that denies the Save already says so in its tag.
	if (!gambitAllowsSave(gambit)) return gambit.strong === "noSave" ? null : { none: t("attack.gambitNoSave") };
	if (gambit.save) {
		const { by, total, target, passed } = gambit.save;
		return { passed, result: t(passed ? "attack.gambitSaved" : "attack.gambitFailed", { name: by, total, target, virtue: virtueOf(gambit) }) };
	}
	return settled ? null : { index, button: t("attack.gambitSave", { virtue: virtueOf(gambit) }) };
}

/**
 * A Strong Gambit's Greater effect (p10): disarming, taking off a helm or
 * breaking something wooden, carried out on the foe's sheet from the card.
 * It waits while the foe's VIG Save is still to roll, and once done the card
 * says what it did.
 * @param {import("../rules/attack.js").Gambit} gambit
 * @param {number} index
 * @param {boolean} settled Whether the Damage has been applied.
 * @returns {{done?: string, waiting?: string, index?: number, label?: string, hint?: string}|null}
 */
function greaterContext(gambit, index, settled) {
	if (gambit.strong !== "greater" || gambitIgnored(gambit)) return null;
	if (gambit.greater) return { done: gambit.greater };
	if (gambitAllowsSave(gambit) && !gambit.save && !settled) return { waiting: t("attack.greater.waiting", { virtue: virtueOf(gambit) }) };
	return { index, label: t("attack.greater.button"), hint: t("attack.greater.hint") };
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
 * A die as the card and the Deny window name it: by what rolled it, and once
 * others have joined the Attack, by who rolled it too (p8).
 * @param {import("../rules/attack.js").AttackDie} die
 * @returns {string}
 */
export function dieLabel(die) {
	return die.by ? t("attack.pooledDie", { name: die.by, label: die.label }) : die.label;
}

/**
 * Why an Attack, or one attacker's share of a joint Attack, is Impaired.
 * @param {{confined?: boolean, swarm?: boolean, impairedWeapon?: string|null}} made
 * @returns {string}
 */
function impairedText({ confined = false, swarm = false, impairedWeapon = null }) {
	if (confined) return t("attack.confinedImpaired");
	if (swarm) return t("attack.swarmImpaired");
	if (impairedWeapon) return t("attack.weaponImpairedCard", { name: impairedWeapon });
	return t("attack.impaired");
}

/**
 * What the card says of each who joined the Attack (p8): that they did, the
 * Smite they declared with its Save, and what set aside or Impaired their share.
 * @param {import("../rules/attack.js").JoinedAttacker[]} joined
 * @returns {object[]}
 */
function joinedContext(joined) {
	return joined.map((entry) => ({
		line: t(entry.smite ? "attack.joinedSmite" : "attack.joined", { name: entry.name }),
		smite: entry.smite,
		smiteMark: entry.smiteMark ? t("attack.smiteMarkLine") : null,
		leader: entry.leader ? t("attack.ledBy", { name: entry.leader.name }) : null,
		warnings: [
			...(entry.setAside ?? []).map(({ name, reason }) => t(`attack.setAside.${reason}`, { name })),
			...(entry.impaired ? [impairedText(entry)] : [])
		]
	}));
}

/**
 * What a joint Attack card's target is, for reckoning the Damage against it
 * (p11): a Warband, a structure, a stone wall. A card at several reads them as
 * one only where they all are. A lone attacker's card, and one whose target
 * can't be found, is reckoned as it always was.
 * @param {import("../rules/attack.js").AttackState} attack
 * @returns {{warband?: boolean, structure?: boolean, stone?: boolean}}
 */
export function cardTarget(attack) {
	if (!attack.joined?.length || !attack.targets.length) return {};
	const actors = attack.targets.map((target) => fromUuidSync(target.uuid)?.actor);
	if (!actors.every(Boolean)) return {};
	const each = actors.map((actor) => harmTargetOf(actor.system));
	return Object.fromEntries(HARM_BARS.map((bar) => [bar, each.every((target) => target[bar])]));
}

/**
 * Template data for an Attack card at any point: fresh from the roll, part way
 * through Deny and Gambits, or settled once the Damage is applied. A joint
 * Attack's Damage is the highest die left of those that can harm its target
 * (p8, p11), and the dice that can't are struck through, saying why.
 * @param {import("../rules/attack.js").AttackState} attack
 */
export function attackCardContext(attack) {
	const target = cardTarget(attack);
	const blow = damageAgainst(attack, target);
	const { highest, bolster, damage, die: counted } = blow;
	// Why each die can't harm the target, or null where it can.
	const barred = attack.dice.map((die) => harmBarred(shareOf(attack, die), target));
	const unharmed = barred.some(Boolean) && blow.unharmed;
	const struck = attack.targets.map((each) => each.name).join(", ");
	const settled = attack.appliedTo.length > 0;
	// Counted die by die, since in a joint Attack only the melee dice make Strong Gambits.
	const gambitDice = attack.dice.filter((_die, index) => canFundGambit(attack, index)).length;
	const strongDice = attack.dice.filter((_die, index) => canFundStrongGambit(attack, index)).length;
	const joined = attack.joined ?? [];
	// Focus is had by any attacker whose share wasn't Impaired (p8).
	const focusable = !attack.impaired || joined.some((entry) => !entry.impaired);
	const gambitName = (key) => t(`gambits.names.${key}`);

	return {
		smite: attack.smite,
		smiteMark: attack.smiteMark ? t("attack.smiteMarkLine") : null,
		targets: attack.targets.length ? t("attack.against", { names: attack.targets.map((target) => target.name).join(", ") }) : null,
		joined: joinedContext(joined),
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
				label: spentOn ?? dieLabel(die),
				spent: Boolean(spentOn),
				// Can't harm this card's target, so it never counts toward its Damage (p11).
				barred: barred[index] ? t(`attack.barred.${barred[index]}`) : null,
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
				// The one weapon an Impair holds (p186); without one it holds their whole next Attack.
				weapon: gambit.weapon ? t("attack.impairsWeapon", { name: gambit.weapon.name }) : null,
				// The CLA Save Focus cost the attacker (p10). Cards from before it was kept have none.
				focus: focusSaveContext(gambit.focus),
				// A Dismount the target Saved against adds nothing, so its d6 goes unmentioned.
				bonus: gambit.bonus && !ignored ? t("attack.dismounted", { result: gambit.bonus }) : null,
				greater: greaterContext(gambit, index, settled),
				ignored,
				save: gambitSaveContext(gambit, index, settled)
			};
		}),
		damage,
		// Said instead of a number when nobody's blow can harm the target.
		unharmed: unharmed ? t("attack.cantHarm", { names: struck }) : null,
		barredNote: !unharmed && barred.some(Boolean) ? t("attack.barredNote", { names: struck }) : null,
		breakdown: bolster && !unharmed ? t("attack.breakdown", { highest, bolster }) : null,
		// Said only while there is a choice to make, so the line keeps its weight.
		gambitPrompt: settled || !gambitDice ? null : plural("attack.gambitPrompt", gambitDice),
		strongPrompt: settled || !strongDice ? null : plural("attack.strongPrompt", strongDice),
		// Said while a die is still there to discard, so the reminder lands before the Damage does.
		denyPrompt: denyPrompt(attack, settled),
		takeBack: !settled && attack.gambits.some((gambit) => gambit.die !== null) ? t("attack.takeBack") : null,
		// A Gambit is still to be had while a die can pay for one, or Focus can.
		gambitHelp: settled || !(gambitDice || focusable) ? null : gambitHelp(),
		// Cards rolled before weapons could be set aside have no list.
		setAside: (attack.setAside ?? []).map(({ name, reason }) => t(`attack.setAside.${reason}`, { name })),
		impaired: attack.impaired,
		// Why: a Long weapon in a confined space, a swarm struck without a Blast, or a foe's Impair on the weapon.
		impairedText: attack.impaired ? impairedText(attack) : null,
		focusable,
		blast: attack.blast,
		// In a joint Attack, as the die that counts says.
		ignoresArmour: blow.ignoresArmour && !unharmed,
		// Cards rolled before weapon notes were kept have none.
		weaponNotes: (attack.notes ?? []).map(({ name, note }) => `${name}: ${note}`),
		// Cards rolled before leading from the front have no leader.
		leader: attack.leader ? t("attack.ledBy", { name: attack.leader.name }) : null,
		// A duel's Attacks are applied together from the duel card.
		duel: Boolean(attack.duel),
		// Others attacking the same target may still roll into it until a Deny, Gambit or Focus
		// is declared (p8), but never into a duel's blow.
		joinable: canJoin(attack),
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
