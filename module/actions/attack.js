import { inputDialog } from "../apps/ui.js";
import { postCard, rollDicePool, t, warn } from "../chat/cards.js";
import { againstLine, attackCardContext, cardTarget, packCardContext, plainNote } from "../chat/attack-view.js";
import { targeted } from "../chat/attack-flag.js";
import { combatPlace, marksOn } from "../chat/gambit-marks.js";
import {
	ALTERNATE_FLAGS,
	ON_WOUND,
	atIndividuals,
	combineDice,
	checkWielding,
	heldAs,
	isBlastAttack,
	defaultWielded,
	impairment,
	isIndividual,
	isShieldItem,
	knownWeakness,
	newAttackState,
	parseDice,
	readImprovised,
	unreadDiceTerms,
	shieldTrapped,
	sortDice,
	specialistDie,
	swarmImpairs,
	trampleJoins,
	weaknessFaces,
	wieldsInHands
} from "../rules/attack.js";
import { PACK_FLAG, joinablePool, newPack, packAsJoining, packAttackState, packDice, packJoinsDice, packPreview } from "../rules/pack.js";
import { impairedItem, impairsWhole } from "../rules/gambit-marks.js";
import { countAfter, isAtHand, isCounted, isUsedUp } from "../rules/restock.js";
import { WOUND_EFFECTS, abilityOffers, abilityUpdatesAfterAttack, declarableBy, declaredGrants, linkedAbilities, sideCounts, unmetNeed, warbandFighting } from "../rules/ability-uses.js";
import { KIT_FLAG } from "../rules/ability-kits.js";
import { combatantOf, keepLastingDice, lastingDiceOf, lastingDieLabel } from "./lasting-dice.js";
import { diceAimedAt, diceForBlow } from "../rules/lasting-dice.js";
import { downBy, outOfFight } from "../rules/virtues.js";
import { SYSTEM_ID } from "../system-id.js";
import { chatIsPublic, gmIds, playBlowFx } from "./attack-fx.js";
import { alternateText } from "./items.js";
import { recallAttack, rememberAttack, rememberedTicks, wieldedWith } from "./attack-memory.js";
import { knockedDownIn, openDuelFor, saveDuelChange } from "./duel.js";
import { mountedNow } from "../rules/duel.js";
import { featContext, payFeat, rollFeat } from "./feats.js";
import { leaderCandidates } from "./leading.js";
import { structureHarm } from "../rules/structures.js";
import { causedBy } from "./ledger.js";
import { isKnight } from "../rules/knight-types.js";
import { handsLeft } from "./scars.js";
import { steedOf } from "./steeds.js";
import { offerDrawnFire } from "./knight-powers.js";
import { wornWarnings } from "./possession-effects.js";

/** Weapon qualities shown beside each choice in the Attack dialog. */
const SHOWN_QUALITIES = Object.freeze(["hefty", "long", "slow", "heftyMounted", "ranged", "blast", "trample", "noHand", "lingers"]);

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
const WIELDED_KEYS = Object.freeze(["damage", "hefty", "long", "slow", "ranged", "blast", "ignoresArmour", "heftyMounted", "trample", "specialist", "usedUp", "noHand", "lingers"]);

/**
 * Worn or wielded items that add Attack dice: weapons, and armour with an
 * attack die such as a shield. A weapon fought two ways is offered once for
 * each, and a broken one, or one all used up, not at all.
 * @param {AttackSource[]} armed What they wear or wield with Attack dice, as armedWith gives it.
 * @returns {AttackSource[]}
 */
function attackSources(armed) {
	return armed.filter(({ item }) => isAtHand(item.system)).flatMap((source) => {
		const { item } = source;
		const alternate = item.system.alternate;
		if (!alternate?.damage?.trim()) return [source];
		const how = alternate.label?.trim() || alternateText(item.system);
		// Something fought only its other way, as a shield with no Attack die of its own that can be thrown.
		const main = parseDice(item.system.damage).length ? [source] : [];
		return [...main, {
			id: `${item.id}-alt`,
			name: t("attack.alternateName", { name: item.name, how }),
			item,
			system: {
				...source.system,
				damage: alternate.damage,
				...Object.fromEntries(ALTERNATE_FLAGS.map((key) => [key, Boolean(alternate[key])])),
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
		.filter((item) => item.system.equipped && (parseDice(item.system.damage).length || parseDice(item.system.alternate?.damage ?? "").length))
		.map((item) => ({
			id: item.id,
			name: item.name,
			item,
			// Both ways of a weapon fought two ways name it, so only one of them is ticked, and
			// so do attacks printed with "or" between them.
			system: { ...Object.fromEntries(WIELDED_KEYS.map((key) => [key, item.system[key]])), of: item.system.either || item.id, shield: isShieldItem(item) }
		}));
}

/**
 * Names of what is worn or wielded with Attack dice but can't be used, being
 * broken or all used up, for a line under the weapons in the Attack dialog.
 * @param {AttackSource[]} armed What they wear or wield with Attack dice, as armedWith gives it.
 * @returns {string|null}
 */
function unavailableNames(armed) {
	const names = armed.filter(({ item }) => !isAtHand(item.system)).map(({ name }) => name);
	return names.length ? t("attack.unavailable", { names: names.join(", ") }) : null;
}

/**
 * One off the count of each thing whose every Attack uses one up, such as a
 * titan bead thrown. How many are left is said by tellUsedUp, to whoever plays
 * the actor, which on a Pack card may not be whoever spends it.
 * @param {Item[]} wielded What the Attack was made with, each once.
 * @returns {{_id: string, "system.quantity.value": number}[]} The item updates.
 */
function useUpThrown(wielded) {
	return wielded.filter((item) => item.system.usedUp && isCounted(item.system)).map((item) => ({ _id: item.id, "system.quantity.value": countAfter(item.system.quantity, -1) }));
}

/** The update option marking a write that used up something thrown, so whoever plays the actor is told. */
const USED_UP_OPTION = "bastionlandUsedUp";

/**
 * Whether this user is the one to tell about an actor: a player who owns it,
 * or the Referee where no player who owns it is logged in.
 * @param {Actor|null|undefined} actor
 * @returns {boolean}
 */
function playsActor(actor) {
	if (!actor?.isOwner) return false;
	if (!game.user.isGM) return true;
	return !Array.from(game.users ?? []).some((user) => user.active && !user.isGM && actor.testUserPermission?.(user, "OWNER"));
}

/**
 * Say how many are left of something thrown an Attack used up, on the client
 * of whoever plays its actor, wherever it was spent from.
 * @param {Item} item
 * @param {object} changes
 * @param {object} options
 */
export function tellUsedUp(item, changes, options) {
	if (!options?.[USED_UP_OPTION] || !item.system?.usedUp) return;
	const left = foundry.utils.getProperty(changes, "system.quantity.value");
	if (left === undefined || !playsActor(item.actor)) return;
	ui.notifications.info(t("attack.usedOne", { name: item.name, left }));
}

/** Called during init. */
export function registerUsedUpNotices() {
	Hooks.on("updateItem", tellUsedUp);
}

/**
 * The weapons an Attack was made with, each once: not a shield, which a charge
 * that shatters its lance leaves whole (p92).
 * @param {AttackSource[]} chosen
 * @returns {Item[]}
 */
const weaponsIn = (chosen) => [...new Set(chosen.map(({ item }) => item))].filter((item) => item.type === "weapon");

/**
 * Mark broken the weapons an Attack was made with, as a lance is shattered by
 * the charge it's used in (p92), until mended.
 * @param {Item[]} wielded What the Attack was made with, each once.
 * @returns {{_id: string, "system.broken": true}[]} The item updates.
 */
function shatter(wielded) {
	return wielded.filter((item) => item.type === "weapon" && !item.system.broken).map((item) => ({ _id: item.id, "system.broken": true }));
}

/**
 * Spend what an Attack uses up, once it's rolled: a thrown weapon, the lance a
 * charge shatters (p92), an Ability's use (p112), and bonus dice kept for the
 * rest of the fight. Kept as plain data, so a Pack card can spend it when its
 * dice are rolled, and a Pack called off spends none of it. What it does to
 * the actor's items is one write, each item's changes merged, so the Ledger
 * hears them as one.
 * @param {Actor} actor
 * @param {import("../rules/pack.js").PackSpend} spend
 */
export async function spendAttack(actor, spend) {
	const items = Array.from(actor.items ?? []);
	const owner = Boolean(actor.isOwner);
	const wielded = owner ? spend.items.map((id) => items.find((item) => item.id === id)).filter(Boolean) : [];
	const merged = new Map();
	const thrown = useUpThrown(wielded);
	for (const update of [
		...thrown,
		...(spend.shatters ? shatter(wielded) : []),
		// An Ability good once an Attack is ready again for this one, and those used here spend a use.
		...(owner ? abilityUpdatesAfterAttack(items, spend.abilities) : [])
	]) merged.set(update._id, { ...merged.get(update._id), ...update });
	await Promise.all([
		merged.size ? actor.updateEmbeddedDocuments("Item", [...merged.values()], { ...causedBy("attack"), ...(thrown.length ? { [USED_UP_OPTION]: true } : {}) }) : null,
		spend.keep.length ? keepLastingDice(actor, spend.keep) : null
	]);
}

/**
 * Ask which dice to join into bigger ones before the roll, as an Ability may
 * let its Knight do with allies at their side: a d4 and a d8 make a d12, and
 * nothing joins past a d12 (p56).
 * @param {{faces: number, label: string}[]} dice What would be rolled.
 * @returns {Promise<{faces: number, label: string}[]|null>} The dice to roll, or null if the window was closed.
 */
async function chooseCombined(dice) {
	if (dice.length < 2) return dice;
	const picked = await askGroups(dice);
	if (!picked) return null;
	return combineDice(dice, picked).dice.map((die) => (die.joined ? { faces: die.faces, label: t("attack.combine.joined", { dice: die.label }) } : die));
}

/**
 * @typedef {object} CombinedLine What the dice window says will roll, as its groups stand.
 * @property {string} text
 * @property {boolean} warning Said as a warning.
 * @property {boolean} blocked Holds back the roll, as a group past a d12 does.
 */

/**
 * What the dice window says while a group comes to more than a d12, which holds back the roll.
 * @param {number[]} over The groups past a d12.
 * @returns {CombinedLine}
 */
const overLine = (over) => ({ text: t("attack.combine.over", { groups: over.join(", ") }), warning: true, blocked: true });

/**
 * What one's own dice roll as, grouped so: their sizes, or which group comes
 * to no die up to a d12.
 * @param {{faces: number}[]} dice
 * @returns {(groups: number[]) => CombinedLine}
 */
const ownDiceLine = (dice) => (groups) => {
	const { dice: rolled, over } = combineDice(dice, groups);
	if (over.length) return overLine(over);
	return { text: t("attack.combine.rolls", { dice: rolled.map((die) => `d${die.faces}`).join(", ") }), warning: false, blocked: false };
};

/**
 * The Join Dice window: which group each die joins, or none.
 * @param {{faces: number, label: string}[]} dice What would be rolled, each labelled as the window lists it.
 * @param {{legend?: string, hint?: string, line?: (groups: number[]) => CombinedLine}} [options] What the list
 *   of dice is headed, "Your dice" unless told; the line under the window; and what it says will roll.
 * @returns {Promise<number[]|null>} The group each die joins, by index, 0 for alone; null if the window was closed.
 */
async function askGroups(dice, { legend = t("attack.combine.legend"), hint = t("attack.combine.hint"), line = ownDiceLine(dice) } = {}) {
	// Enough groups for every die to pair off, and never fewer than three.
	const groups = Array.from({ length: Math.max(3, Math.floor(dice.length / 2)) }, (_value, index) => index + 1);
	const data = await inputDialog({
		title: t("attack.combine.title"),
		icon: "fa-solid fa-object-group",
		template: "combine-dice",
		context: {
			legend,
			hint,
			dice: dice.map((die, index) => ({ index, label: t("attack.combine.die", { faces: die.faces, label: die.label }) })),
			groups: groups.map((group) => ({ value: group, label: t("attack.combine.group", { group }) }))
		},
		ok: { label: t("attack.combine.ok"), icon: "fa-solid fa-dice" },
		render: (_event, dialog) => watchCombined(dialog, dice, line)
	});
	if (!data) return null;
	return dice.map((_die, index) => Number(data[`group.${index}`]) || 0);
}

/**
 * Keep the dice window's line saying what will be rolled, and hold back the
 * roll while a group comes to more than a d12.
 * @param {foundry.applications.api.DialogV2} dialog
 * @param {{faces: number}[]} dice
 * @param {(groups: number[]) => CombinedLine} describe
 */
function watchCombined(dialog, dice, describe) {
	const form = dialog.element.querySelector("form");
	const line = form?.querySelector("[data-combined]");
	if (!line) return;
	const roll = dialog.element.querySelector("[data-action='ok']");
	const update = () => {
		const said = describe(dice.map((_die, index) => Number(form.querySelector(`[name='group.${index}']`)?.value) || 0));
		line.textContent = said.text;
		line.classList.toggle("is-warning", said.warning);
		if (roll) roll.disabled = said.blocked;
	};
	form.addEventListener("change", update);
	update();
}

/**
 * A Knight's steed and its trample, which joins a mounted charge at enemies on foot (p10).
 * A steed that's down, or Exhausted at VIG 0, carries nobody into a charge.
 * @param {Actor} actor
 * @returns {{steed: Actor, trample: Item[]}|null} Null without a steed that tramples.
 */
function mountOf(actor) {
	const steed = steedOf(actor);
	if (steed && (downBy(steed.system) || steed.system.virtues?.vig.value === 0)) return null;
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
 * Who an Attack is aimed at: the card's targets for a joint Attack, the other
 * duelist in a duel, and otherwise whoever this user targets.
 * @param {{targets: {uuid: string, name: string}[]}|null|undefined} joining The card joined, if any.
 * @param {object|null|undefined} duel The duel it's a blow in, if any.
 * @returns {{uuid: string, name: string}[]}
 */
function aimFor(joining, duel) {
	if (joining) return joining.targets;
	if (duel?.opponent.token) return [{ uuid: duel.opponent.token, name: duel.opponent.name }];
	return currentTargets();
}

/**
 * The Attack dialog's first line: who the blow is at, or that nobody is targeted yet.
 * @param {{name: string}[]} targets
 * @returns {string}
 */
function aimLine(targets) {
	return againstLine(targets) ?? t("attack.againstNobody");
}

/**
 * Keep the Attack dialog's first line on whoever the blow is at while it
 * stands open: the other duelist while the duel is ticked, and otherwise
 * whoever this user targets, since the blow lands on those targeted as it's rolled.
 * @param {{element: HTMLElement}} dialog
 * @param {object|null} [duel] The duel it may be a blow in, as openDuelFor finds it.
 * @returns {() => void} Stops following.
 */
function followAim(dialog, duel = null) {
	const line = dialog.element?.querySelector("[data-attack-aim]");
	if (!line) return () => {};
	const duelBox = duel ? dialog.element.querySelector("input[name='duel']") : null;
	const show = () => (line.textContent = aimLine(aimFor(null, duelBox?.checked ? duel : null)));
	duelBox?.addEventListener("change", show);
	// A dialog opened again on an unticked duel says so straight away.
	if (duelBox && !duelBox.checked) show();
	const id = Hooks.on("targetToken", (user) => {
		if (user !== game.user) return;
		show();
		// What the dialog checks at its targets, such as several of them without a Blast, is read again too.
		dialog.element.querySelector?.("form")?.dispatchEvent(new Event("change"));
	});
	return () => {
		Hooks.off("targetToken", id);
		duelBox?.removeEventListener("change", show);
	};
}

/**
 * Whether two lists of targets name the same Tokens, in any order.
 * @param {{uuid: string}[]} a
 * @param {{uuid: string}[]} b
 * @returns {boolean}
 */
function sameTargets(a, b) {
	const uuids = new Set(a.map(({ uuid }) => uuid));
	return a.length === b.length && b.every(({ uuid }) => uuids.has(uuid));
}

/**
 * What the Attack dialog weighs at its targets: a steed's trample barred, the
 * weaknesses known, a Warband's at-individuals tick, the lasting dice offered
 * at them, and the lines said about them. The signature tells whether other
 * targets would draw the dialog any differently.
 * @param {Actor} actor
 * @param {{uuid: string, name: string}[]} aimedAt
 * @param {object} by
 * @returns {{chargeBarred: string|null, weaknesses: object[], individuals: object|null, lasting: object[], said: string[], signature: string}}
 */
function weighTargets(actor, aimedAt, { joining, duel, mount, warband, ticks, combatant }) {
	// Nobody on foot among the targets leaves the steed nobody to trample.
	const chargeBarred = mount ? trampleBarred(aimedAt, duel) : null;
	// A joint Attack is one Attack, so a weakness whose die is already on the card adds no second (p188).
	const weaknesses = joining?.dice.some((die) => die.weakness) ? [] : weaknessesOf(aimedAt);
	// A Warband's Attack at individuals only gets +d12 and Blast (p11), so the targets tick the box.
	const individuals = warband ? individualsTick(aimedAt, ticks.againstIndividuals) : null;
	// One kept against a single foe is offered only at them (p42).
	const aimedActors = aimedAt.map(({ uuid }) => fromUuidSync(uuid)?.actor?.uuid).filter(Boolean);
	const lasting = diceAimedAt(lastingDiceOf(actor, combatant), aimedActors).map((die) => ({ ...die, label: die.label || t("attack.bonus") }));
	const said = [
		// A swarm aimed at is named, so a Blast, which isn't Impaired by it, can be chosen before rolling.
		...aimedAt.filter((target) => standingOf(target).swarm).map(({ name }) => t("attack.swarmHint", { name })),
		...aimedAt.flatMap(targetDownHint),
		// A helm that Impairs a foe's first ever Attack at its wearer (p42): said, for the Referee to judge.
		...aimedAt.flatMap(({ uuid }) => wornWarnings(fromUuidSync(uuid)?.actor))
	];
	const signature = JSON.stringify([
		// Several targets need a Blast, which the dialog checks before it's rolled.
		aimedAt.length > 1,
		chargeBarred,
		weaknesses.map(({ uuid, name, text, die }) => [uuid, name, text, die]),
		individuals,
		lasting,
		said
	]);
	return { chargeBarred, weaknesses, individuals, lasting, said, signature };
}

/** Boxes drawn for the targets themselves, which open as the new targets have them rather than as answered. */
const TARGET_BOXES = /^(weakness|lasting)\.|^againstIndividuals$/;

/**
 * Open the Attack dialog again on what was answered before its targets
 * changed, all but the boxes drawn for the targets themselves.
 * @param {{element: HTMLElement}} dialog
 * @param {object} answered The form as it was sent, flat.
 */
function refillAttackForm(dialog, answered) {
	const form = dialog.element?.querySelector?.("form");
	if (!form) return;
	for (const field of form.querySelectorAll("[name]")) {
		const { name } = field;
		if (field.disabled || TARGET_BOXES.test(name) || !(name in answered)) continue;
		if (field.type === "checkbox") field.checked = Boolean(answered[name]);
		else field.value = answered[name] ?? "";
	}
}

/**
 * A line for the Attack dialog where a target is already beyond harm: Slain,
 * destroyed or wiped out (p8, p11). The Attack is still allowed.
 * @param {{uuid: string, name: string}} target
 * @returns {string[]}
 */
function targetDownHint({ uuid, name }) {
	const system = fromUuidSync(uuid)?.actor?.system;
	if (!system) return [];
	const state = system.slain ? "slain" : system.destroyed ? "destroyed" : system.warband?.wipedOut ? "wipedOut" : null;
	return state ? [t(`attack.targetDown.${state}`, { name })] : [];
}

/**
 * How a targeted Token stands: whether it's mounted or a structure, for a
 * steed's trample, which only joins a charge at enemies on foot (p10), and
 * whether it's a swarm, which one person's Attack only harms Impaired unless
 * it's a Blast (p61). A Token whose actor can't be found is taken to
 * be one person on foot. A Warband is told apart too, since a Warband's Attack
 * at individuals gets +d12 and Blast (p11). The other duelist in a joust rides,
 * as both do (p10), before they've rolled and been marked so, unless thrown
 * in an earlier exchange.
 * @param {{uuid: string}} target
 * @param {{duel: object}|null} [duel] The duel it's a blow in, as openDuelFor finds it.
 * @returns {{mounted: boolean, structure: boolean, swarm: boolean, warband: boolean}}
 */
function standingOf({ uuid }, duel = null) {
	const actor = fromUuidSync(uuid)?.actor;
	if (!actor) return { mounted: false, structure: false, swarm: false, warband: false };
	return {
		mounted: mountedNow(actor, duel?.duel, uuid),
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
	const standing = targets.map((target) => standingOf(target));
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
 * @param {object|null} [duel] The duel it may be a blow in, as openDuelFor finds it.
 * @returns {string|null} Null when it joins, or nobody is targeted yet.
 */
function trampleBarred(targets, duel = null) {
	if (trampleJoins(targets.map((target) => standingOf(target, duel)))) return null;
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
 * while a combat is running, and clears it as each turn starts. Read off their
 * place in any running Combat, so it holds whichever Scene this user is viewing.
 * @param {Actor} actor
 * @returns {boolean}
 */
function movedThisTurn(actor) {
	// Every Token of theirs in a running Combat: a linked actor placed twice may have moved either.
	const running = (game.combats?.contents ?? []).filter((combat) => combat.started);
	return running.some((combat) => [...combat.combatants].some((combatant) =>
		combatant.actor?.uuid === actor.uuid && (combatant.token?.movementHistory?.length ?? 0) > 0));
}

/**
 * Whether an Attack is held to what two hands can wield (p12): always for a
 * Knight, less any arm a Mutilation took that they've not yet got by without (p9),
 * never for a Warband, whose Attack is its members', and for anybody else as
 * their sheet or their gear says.
 * @param {Actor} actor
 * @returns {boolean|number} How many hands a Knight has, or whether two count.
 */
function countsHands(actor) {
	if (isKnight(actor)) return handsLeft(actor);
	if (actor.type !== "npc" || actor.system.scale === "warband") return false;
	return wieldsInHands(actor.system.wields, [...actor.items]);
}

/**
 * How the Attack dialog has them placed for the blow. Riding: a mounted charge
 * is made on horseback. Moving this turn: a charge is a move, so it bars an
 * Exhausted rider's Attack and a Slow weapon as moving does. Charging, for an
 * Ability used only on a mounted charge (p92): without a steed that tramples
 * there's no charge box, so riding in after moving is the charge.
 * @param {object} choice The dialog's expanded form data.
 * @param {ReturnType<typeof mountOf>} [mount] A steed that tramples, which draws the charge box.
 * @returns {{riding: boolean, moved: boolean, charging: boolean}}
 */
const situationOf = (choice, mount = null) => ({
	riding: Boolean(choice.mounted || choice.charge),
	moved: Boolean(choice.moved || choice.charge),
	charging: mount ? Boolean(choice.charge) : Boolean(choice.mounted && choice.moved)
});

/**
 * Check the items ticked in the Attack dialog against the situation ticked there.
 * @param {Actor} actor
 * @param {Item[]} sources Everything the dialog offered.
 * @param {object} choice  The dialog's expanded form data.
 * @param {object} [aim]   Who the Attack is aimed at, for what only a Blast does.
 * @param {import("../rules/attack.js").AttackState|null} [aim.joining] The card joined, whose targets it takes as they are.
 * @param {object|null} [aim.duel] The duel it may be a blow in, as openDuelFor finds it.
 * @param {object[]} [aim.offers] The Abilities offered, any of which may make the blow a Blast.
 * @param {boolean} [aim.trapped] A foe's Trap holds their shield (p10).
 * @param {ReturnType<typeof mountOf>} [aim.mount] A steed that tramples, which draws the charge box.
 * @returns {{chosen: Item[], check: ReturnType<typeof checkWielding>, situation: ReturnType<typeof situationOf>}}
 */
function readWielding(actor, sources, choice, { joining = null, duel = null, offers = [], trapped = false, mount = null } = {}) {
	const chosen = sources.filter((item) => choice.source?.[item.id]);
	const situation = situationOf(choice, mount);
	// Read as the Attack will be rolled: whoever is targeted now, or the other duelist where it's a blow in the duel.
	const targets = aimFor(joining, duel && choice.duel ? duel : null);
	const warband = actor.system.scale === "warband";
	// A Blast however it comes; checkWielding adds a Blast weapon, of those not set aside.
	const blast = isBlastAttack({
		granted: declaredGrants(choice, offers, declarableBy(actor)).blast,
		smite: choice.smite,
		againstIndividuals: warband && Boolean(choice.againstIndividuals)
	});
	const check = checkWielding(chosen.map((item) => item.system), {
		// A card joined keeps the targets it was rolled at.
		several: !joining && targets.length > 1,
		blast,
		// Smite for anything but a Blast is lost on a swarm, whose Impair takes every bonus and Feat (p61).
		smiteSwarm: Boolean(choice.smite) && choice.smite !== "blast" && !warband && targets.some((target) => standingOf(target).swarm),
		moved: situation.moved,
		engaged: Boolean(choice.engaged),
		confined: Boolean(choice.confined),
		exhausted: actor.system.conditions.exhausted,
		mounted: situation.riding,
		spearwall: Boolean(choice.spearwall),
		smite: Boolean(choice.smite),
		hands: countsHands(actor),
		trapped
	});
	return { chosen, check, situation };
}

/**
 * The dialog's boxes that dice are typed in, each with what it says when one
 * can't be read, and whether what's typed in it can't. An improvised weapon's
 * words are its name, but it needs a die to be swung at all (p10, p194). The
 * improvised box is read once by whoever asks, and handed in as `swung`.
 */
const DICE_BOXES = [
	{
		name: "improvised",
		unread: "attack.improvisedUnread",
		misread: (_typed, swung) => swung.unread.length > 0 || !swung.dice.length
	},
	{ name: "bonus", unread: "attack.bonusUnread", misread: (typed) => unreadDiceTerms(typed).length > 0 }
];

/**
 * What can't be read in the boxes dice are typed in, such as "8", the "+2" of
 * "d8+2", or an improvised "barrel" with no die. Rolled as it stands, it would
 * be quietly dropped, and an improvised weapon with no die read would leave the
 * Attack unarmed and Impaired (p10), so the Attack waits for dice or an empty box.
 * @param {object} choice The dialog's expanded form data.
 * @param {ReturnType<typeof readImprovised>} [swung] The improvised box, read.
 * @returns {string[]} One line for each box with anything unread in it.
 */
function unreadDice(choice, swung = readImprovised(choice.improvised)) {
	return DICE_BOXES.flatMap(({ name, unread, misread }) => {
		const typed = String(choice[name] ?? "").trim();
		return typed && misread(typed, swung) ? [t(unread, { text: typed })] : [];
	});
}

/**
 * Who leads a Warband from the front, as the Attack dialog names them (p11).
 * @param {Actor[]} leaders Those who could.
 * @param {object} choice The dialog's expanded form data.
 * @returns {Actor|null}
 */
const leaderOf = (leaders, choice) => leaders.find((candidate) => candidate.uuid === choice.leader) ?? null;

/**
 * What strikes in an Attack and the dice it brings, each labelled with the
 * item or whoever brings it: the weapons wielded, a steed's trample on a
 * charge (p10), the arms of a leader at a Warband's front (p11), and
 * something grabbed and swung (p194). The actor's own dice name the item too,
 * so a foe can Impair the weapon it has seen (p186). With none of it, the
 * Attack is unarmed, and so Impaired (p10). Read alike by the Attack dialog,
 * as boxes are ticked, and by the Attack it makes.
 * @param {AttackSource[]} chosen What's wielded, less anything set aside.
 * @param {object} choice The dialog's expanded form data.
 * @param {{mount: ReturnType<typeof mountOf>, leader: Actor|null}} arms A steed that tramples, and who leads.
 * @param {ReturnType<typeof readImprovised>} [swung] The improvised box, read.
 * @returns {{weaponItems: object[], improvised: {name: string, damage: string}|null,
 *   weaponDice: {faces: number, label: string, trample: boolean, item?: string}[]}}
 */
function weaponDiceOf(chosen, choice, { mount, leader }, swung = readImprovised(choice.improvised)) {
	const weaponGroups = [
		{ items: chosen, label: null, own: true },
		{ items: mount && choice.charge ? mount.trample : [], label: mount?.steed.name, trample: true },
		{ items: leader ? leaderArms(leader) : [], label: leader?.name }
	];
	// Something grabbed and swung, such as a barrel, whose die the Referee rules (p194). It's a
	// weapon, so it isn't unarmed (p10), and bonus dice join it as they would any other. The words
	// typed beside its die are its name on the card, so "barrel d8" rolls a Barrel's d8.
	const improvised = swung.dice.length
		? { name: swung.name || t("attack.improvised"), damage: swung.dice.map((faces) => `d${faces}`).join(" + ") }
		: null;
	return {
		weaponItems: weaponGroups.flatMap(({ items }) => items),
		improvised,
		weaponDice: [
			...weaponGroups.flatMap(({ items, label, trample = false, own = false }) =>
				items.flatMap((source) => parseDice(source.system.damage).map((faces) => ({
					faces,
					label: label ?? source.name,
					trample,
					...(own ? { item: source.item.id } : {})
				})))),
			...swung.dice.map((faces) => ({ faces, label: improvised.name, trample: false }))
		]
	};
}

/** Refusals that come of the weapons ticked together, said beside the boxes that fix them. */
const WEAPON_REFUSALS = new Set(["twoWays", "hefty", "long", "armLost", "hands", "allSetAside"]);

/**
 * What stops or changes the Attack as chosen, one line each: what comes of the
 * weapons ticked, said in their fieldset, and the rest, said below it.
 * @param {Actor} actor
 * @param {AttackSource[]} chosen
 * @param {ReturnType<typeof checkWielding>} check
 * @param {import("../rules/gambit-marks.js").Mark[]} [marks] Gambits a foe landed on them.
 * @param {boolean} [smite] Smite is ticked.
 * @param {boolean} [unarmed] Nothing strikes: no weapon dice at all, as weaponDiceOf reads them (p10).
 * @returns {{weapons: string[], others: string[]}}
 */
function wieldingProblems(actor, chosen, check, marks = [], smite = false, unarmed = false) {
	const weapons = [];
	const others = [];
	if (check.refusal) (WEAPON_REFUSALS.has(check.refusal) ? weapons : others).push(t(`attack.refusals.${check.refusal}`, { name: actor.name }));
	for (const { index, reason } of check.setAside) weapons.push(t(`attack.setAside.${reason}`, { name: chosen[index].name }));
	// A foe's Impair on one of their weapons holds any Attack made with it (p186).
	const held = impairedItem(marks, check.usable.map((index) => chosen[index].item));
	if (held) weapons.push(t("attack.weaponImpaired", { name: held }));
	if (check.impaired) others.push(t("attack.confinedImpaired"));
	// An Impaired Attack can't benefit from Feats (p8), so Smite isn't made, and costs nothing. Weighed
	// only on what the ticks bring: Impaired before the dialog opened, its Smite box is disabled
	// already (smiteDisabled), and Smite at a swarm is refused (smiteSwarm).
	if (smite && impairment({ confined: check.impaired, weapon: held, unarmed }).impaired) others.push(t("attack.smiteImpaired"));
	return { weapons, others };
}

/**
 * Fill a dialog's list of problems, hiding it while there are none.
 * @param {HTMLElement|null} list
 * @param {string[]} lines
 */
function showProblems(list, lines) {
	if (!list) return;
	list.replaceChildren(...lines.map((text) => {
		const line = document.createElement("li");
		line.textContent = text;
		return line;
	}));
	list.hidden = list.childElementCount === 0;
}

/**
 * Keep the Attack dialog's list of problems up to date as boxes are ticked, and
 * hold back the roll while the Attack can't be made.
 * @param {foundry.applications.api.DialogV2} dialog
 * @param {Actor} actor
 * @param {AttackSource[]} sources
 * @param {import("../rules/gambit-marks.js").Mark[]} marks
 * @param {Parameters<typeof readWielding>[3]} aim Who it is aimed at, as readWielding takes it.
 * @param {{mount: ReturnType<typeof mountOf>, leaders: Actor[]}} arms A steed that tramples, and who could lead.
 */
function watchWielding(dialog, actor, sources, marks, aim, { mount, leaders }) {
	const form = dialog.element.querySelector("form");
	const list = form?.querySelector("[data-wielding-problems]");
	if (!list) return;
	const weaponList = form.querySelector("[data-weapon-problems]");
	const roll = dialog.element.querySelector("[data-action='ok']");

	/** The whole form as last read, and what it wields, which typing dice changes none of. */
	let read = null;
	const show = (choice) => {
		const { chosen, check } = read;
		const swung = readImprovised(choice.improvised);
		// Unarmed is Impaired (p10), weighed on the dice the Attack would roll.
		const { weaponDice } = weaponDiceOf(check.usable.map((index) => chosen[index]), choice, { mount, leader: leaderOf(leaders, choice) }, swung);
		const unread = unreadDice(choice, swung);
		const { weapons, others } = wieldingProblems(actor, chosen, check, marks, Boolean(choice.smite), !weaponDice.length);
		// Without a list in the weapons fieldset, everything is said in the one below.
		showProblems(weaponList, weapons);
		showProblems(list, [...unread, ...(weaponList ? [] : weapons), ...others]);
		if (roll) roll.disabled = Boolean(check.refusal || unread.length);
	};
	const update = () => {
		const choice = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(form).object);
		read = { choice, ...readWielding(actor, sources, choice, aim) };
		show(choice);
	};
	form.addEventListener("change", update);
	// Dice are read as they're typed, so a slip shows before Enter rolls it. Only the box typed in
	// has changed since the form was last read; leaving it reads the whole form again.
	form.addEventListener("input", (event) => {
		const { name, value } = event.target;
		if (DICE_BOXES.some((box) => box.name === name)) show({ ...read.choice, [name]: value });
	});
	update();
	// A charge is what runs onto a spearwall (p10), so ticking it opens the fold its box is in.
	const more = form.querySelector(".bastionland-attack__more");
	form.addEventListener("change", (event) => {
		if (more && event.target.name === "charge" && event.target.checked) more.open = true;
	});
}

/**
 * Which weapons the dialog opens ticked: the ones this actor last rolled with,
 * and the hardest-hitting of anything they've taken up since. A remembered set
 * that can't be held together any more — a shield beside a weapon since made
 * Hefty — gives way to the hardest-hitting set instead, so the dialog doesn't
 * open on an Attack that can't be rolled. A weapon a foe's Impair holds opens
 * unticked while there's anything else to fight with (p186), and a shield their Trap holds does too (p10).
 * @param {Actor} actor
 * @param {AttackSource[]} sources
 * @param {import("./attack-memory.js").AttackChoice|null} remembered
 * @param {boolean} mounted
 * @param {import("../rules/gambit-marks.js").Mark[]} [marks] Gambits a foe landed on them.
 * @returns {number[]} Indexes into sources.
 */
function openingWielded(actor, sources, remembered, mounted, marks = []) {
	const items = sources.map((item) => item.system);
	const options = { mounted, hands: countsHands(actor), trapped: shieldTrapped(marks) };
	const hardest = defaultWielded(items, options);
	const kept = remembered ? wieldedWith(remembered, sources.map((item) => item.id), hardest) : hardest;
	const opening = kept === hardest || !checkWielding(kept.map((index) => items[index]), options).refusal ? kept : hardest;
	// A foe's Impair holds one weapon, and a Trap holds their shield (p10, p186).
	const held = sources.map((source) => impairedItem(marks, [source.item]) !== null || (options.trapped && source.system.shield));
	const free = sources.flatMap((_source, index) => (held[index] ? [] : [index]));
	if (!free.length || !opening.some((index) => held[index])) return opening;
	return defaultWielded(free.map((index) => items[index]), options).map((at) => free[at]);
}

/**
 * What somebody leading a Warband from the front adds to its roll (p11): their own
 * Attack dice, so the weapons they would wield, as many as their hands hold and
 * the hardest-hitting first. A weapon a foe's Impair holds is left out while anything else
 * is at hand (p186). Impaired, or with nothing to fight with, they add one d4 (p8, p10).
 * @param {Actor} leader
 * @returns {{name: string, system: {damage: string}}[]} What adds dice, as weapon sources do.
 */
function leaderArms(leader) {
	const marks = marksOn(leader);
	const atHand = armedWith(leader).filter(({ item }) => isAtHand(item.system));
	const free = atHand.filter(({ item }) => impairedItem(marks, [item]) === null);
	const sources = free.length ? free : atHand;
	const kept = defaultWielded(sources.map((source) => source.system), { mounted: Boolean(leader.system.conditions?.mounted), hands: countsHands(leader), trapped: shieldTrapped(marks) });
	const { impaired } = impairment({
		condition: Boolean(leader.system.conditions?.impaired) || impairsWhole(marks),
		weapon: impairedItem(marks, kept.map((index) => sources[index].item)),
		unarmed: !kept.length
	});
	if (impaired) return [{ name: leader.name, system: { damage: "d4" } }];
	return kept.map((index) => sources[index]);
}

/**
 * @typedef {object} AttackPlan How somebody attacks, as their Attack dialog was
 *   answered: what they wield, the dice that brings before anything is rolled,
 *   and what the card says of it.
 * @property {Actor} actor
 * @property {object} choice             The dialog's expanded form data.
 * @property {AttackSource[]} picked     Everything ticked.
 * @property {AttackSource[]} chosen     What's used of it, once set-aside weapons are left out.
 * @property {boolean} melee          Whether the blow is struck in melee, by what strikes, not what was set aside.
 * @property {ReturnType<typeof checkWielding>} check
 * @property {ReturnType<typeof mountOf>} mount
 * @property {boolean} warband
 * @property {Actor|null} leader
 * @property {object[]} weaponItems      What adds dice: their weapons, a steed's trample, a leader's.
 * @property {{name: string, damage: string}|null} improvised Something grabbed and swung (p194):
 *   the name typed for it, or "Improvised weapon", and its dice.
 * @property {{faces: number, label: string, trample: boolean}[]} weaponDice
 * @property {{faces: number, label: string}[]} dice The dice to roll, before a card's targets are weighed.
 * @property {boolean} impaired          Impaired however it came to be, unarmed included (p8, p10), before its
 *   targets are weighed.
 * @property {boolean} riding            Mounted, or charging, which is done on horseback.
 * @property {() => Promise<void>} settle What the Attack does to the actor once it counts: remembers
 *   the choices, marks them riding or led, pays for Smite, and uses up whatever is thrown.
 * @property {{mode: string, feat: object, roll: Roll, save: object}|null} smite
 * @property {ReturnType<typeof weaknessesOf>} exploited The known weaknesses ticked.
 * @property {boolean} blast
 * @property {ReturnType<typeof declaredGrants>} declared What was declared for this blow, by an Ability or by hand.
 * @property {object|null} inDuel        The duel this is a blow in.
 * @property {{uuid: string, name: string}[]} targets
 * @property {ReturnType<typeof diceAt>|null} gather Its dice at its targets, unrolled, where it's posted as a
 *   Pack card before it's rolled, so allies roll with it (p8) and an Ability can join their dice too (p56);
 *   null where it's rolled at once, or brought to the Pack card it joins.
 * @property {boolean} combines          Its Ability joins dice into bigger ones, and it isn't Impaired (p56).
 *   Rolled at once, they're joined already; on a Pack card, at its roll.
 * @property {() => Promise<void>} declare What making the Attack does at once: remembers the choices, marks them
 *   riding or led, and pays for Smite.
 * @property {import("../rules/pack.js").PackSpend} spend What it uses up, which spendAttack spends.
 * @property {string|null} impairedWeapon The weapon a foe's Impair holds, when that alone Impairs this Attack.
 * @property {boolean} againstIndividuals A Warband's Attack ticked as against individuals, whose +d12 joins
 *   only the cards at individuals (p11).
 */

/**
 * Why an actor makes no Attack at all, however it would be made: the Slain and
 * the Mortally Wounded, down and dying until patched up (p8); the destroyed,
 * the wiped out, and those who fled or surrendered (p10, p11); and anybody
 * knocked down sparring, out of the bout till it ends, though nobody is left
 * dying (p188).
 * @param {Actor} actor
 * @returns {string|null} The warning to show, or null where they may attack.
 */
function whyCantAttack(actor) {
	const down = downBy(actor.system);
	if (down) return t(`conditions.${down}.down`, { name: actor.name });
	const out = outOfFight(actor.system, { morale: true });
	if (out) return t(`attack.outOfTheFight.${out}`, { name: actor.name });
	if (knockedDownIn(actor)) return t("duel.knockedDown", { name: actor.name });
	return null;
}

/**
 * The Attack dialog's template data as it opens: what can be wielded and what
 * opens ticked, the situation as it's known or was last ticked, what's said of
 * the targets, and the Abilities, dice and leaders on offer.
 * @param {object} opening What planAttack has read before asking.
 * @param {Actor} opening.actor
 * @param {object|null} opening.joining The card they join, if any.
 * @param {AttackSource[]} opening.sources What's offered.
 * @param {AttackSource[]} opening.armed Everything worn or wielded with Attack dice, usable or not.
 * @param {number[]} opening.wielded Indexes into sources that open ticked.
 * @param {import("./attack-memory.js").AttackChoice|null} opening.remembered
 * @param {ReturnType<typeof rememberedTicks>} opening.ticks
 * @param {ReturnType<typeof individualsTick>|null} opening.individuals
 * @param {boolean} opening.mounted
 * @param {object|null} opening.duel The duel it may be a blow in, as openDuelFor finds it.
 * @param {ReturnType<typeof mountOf>} opening.mount
 * @param {string|null} opening.chargeBarred
 * @param {boolean} opening.startsImpaired Impaired before anything is ticked.
 * @param {import("../rules/gambit-marks.js").Mark[]} opening.marks
 * @param {{uuid: string, name: string}[]} opening.aimedAt
 * @param {string[]} opening.said What's said of the targets, as weighTargets words it.
 * @param {ReturnType<typeof weaknessesOf>} opening.weaknesses
 * @param {object[]} opening.offers
 * @param {{ours: number, theirs: number}|null} opening.sides
 * @param {object[]} opening.lasting Dice kept for the rest of the fight, offered at these targets.
 * @param {Combatant|null} opening.combatant
 * @param {boolean} opening.warband
 * @param {Actor[]} opening.leaders
 * @returns {object}
 */
function attackDialogContext({ actor, joining, sources, armed, wielded, remembered, ticks, individuals, mounted, duel, mount, chargeBarred, startsImpaired, marks, aimedAt, said, weaknesses, offers, sides, lasting, combatant, warband, leaders }) {
	const { conditions } = actor.system;
	return {
		// Who the blow is at, said before it's rolled.
		aim: aimLine(aimedAt),
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
		unavailable: unavailableNames(armed),
		moved: movedThisTurn(actor),
		// Read off the world rather than remembered, so it follows the steed.
		mounted,
		// A sparring bout says so, since its Damage is shaken off afterwards (p188).
		duel: duel && t(duel.duel.sparring ? "duel.attackInSparring" : "duel.attackIn", { kind: t(`duel.kinds.${duel.duel.kind}.label`), name: duel.opponent.name }),
		charge: mount && t("attack.charge", { steed: mount.steed.name, dice: mount.trample.map((item) => item.system.damage).join(" + ") }),
		chargeBarred,
		exhausted: conditions.exhausted,
		impaired: startsImpaired,
		marks: [
			// A broken Warband follows no orders, and fights only for itself (p11): said, not refused.
			...(actor.system.warband?.broken ? [t("attack.brokenWarband", { name: actor.name })] : []),
			...marks.map((mark) => mark.hint),
			...said
		],
		weaknesses: weaknesses.map(({ name, text, die }, index) => ({
			index,
			label: text ? t("attack.weakness", { name, text, die }) : t("attack.weaknessBare", { name, die })
		})),
		smiteKnown: Boolean(actor.system.knowsFeat?.("smite")),
		// Drawn only for a Knight who knows it, so all that bars it is how they stand: Fatigued, or
		// Impaired before anything is ticked, the only cause of an Impair known as the dialog opens.
		// What the ticks bring is said as they're made (wieldingProblems).
		// Nothing on the sheet to swing is no bar: something to hand may be swung as an improvised weapon (p194).
		smiteDisabled: conditions.fatigued || startsImpaired,
		// The fold of what seldom comes up opens on its own where a tick in it was remembered,
		// or a remembered charge, which runs onto the spearwall in it (p10), opens ticked.
		moreOpen: ticks.confined || Boolean(mount && !chargeBarred && ticks.chargeChecked),
		abilityOffers: offers.map((offer) => ({
			id: offer.id,
			label: t("attack.useAbility", {
				name: offer.name,
				grants: [
					offer.bonusDie && `+${offer.bonusDie}`,
					...offer.grants.filter((key) => !offer.effects.includes(key)).map((key) => t(`attack.grant.${key}`)),
					offer.needs && t(`attack.needs.${offer.needs}Tag`)
				].filter(Boolean).join(", ")
			}),
			hint: crowdHint(offer, sides) ?? t(offer.counted ? "attack.useAbilityHint" : offer.chosen ? "attack.useAbilityChosenHint" : "attack.useAbilityFreeHint"),
			// One used blow by blow, such as a bite that drinks, waits to be ticked like one with uses,
			// unless it's only for a crowd and the crowd is there (p38).
			checked: offer.active || crowdMet(offer, sides) || (!offer.counted && !offer.chosen),
			// What a Wound from it does, picked before the blow where it could do more than one thing (p166).
			effects: offer.effects.map((key, index) => ({ key, label: t(`attack.grant.${key}`), selected: index === 0 }))
		})),
		declarations: declarableBy(actor).filter((key) => !WOUND_EFFECTS.includes(key)).map((key) => ({ key, label: t(`attack.grant.${key}`), hint: t(`attack.grant.${key}Hint`) })),
		// What a Wound does besides is one thing or none (p166), so it's picked rather than ticked.
		woundEffects: declarableBy(actor).filter((key) => WOUND_EFFECTS.includes(key)).map((key) => ({ key, label: t(`attack.grant.${key}`) })),
		lasting: lasting.map((die, index) => ({ index, label: lastingDieLabel(die) })),
		canKeep: Boolean(combatant),
		// A fresh Attack may wait for allies to bring their dice, so all roll at the same time (p8).
		canWait: !joining,
		warband,
		leaders: leaders.map((leader) => ({ uuid: leader.uuid, name: leader.name, selected: leader.uuid === actor.system.leader }))
	};
}

/**
 * The bonus dice an Attack brings besides its weapons, before it's weighed for
 * Impairment: dice typed in, dice kept for the rest of the fight, a specialist
 * weapon's die, Smite's d12, and what an Ability adds.
 * @param {object} blow
 * @param {object} blow.choice The dialog's expanded form data.
 * @param {object[]} blow.lasting Dice kept for the rest of the fight, as the dialog offered them.
 * @param {boolean} blow.melee
 * @param {AttackSource[]} blow.chosen What strikes.
 * @param {AttackPlan["smite"]} blow.smite
 * @param {ReturnType<typeof declaredGrants>} blow.declared
 * @returns {{typedBonus: {faces: number, label: string}[], bonusDice: {faces: number, label: string, item?: string}[]}}
 *   `typedBonus` is what was typed in, which may be kept for the rest of the fight.
 */
function bonusDiceOf({ choice, lasting, melee, chosen, smite, declared }) {
	const typedBonus = parseDice(choice.bonus).map((faces) => ({ faces, label: t("attack.bonus") }));
	// Their dice for the rest of the fight, each left out only when unticked.
	// One kept for melee only sits out a shot (p32, p98).
	// One given to a weapon joins only a blow made with it, and is that weapon's own die (p98).
	const keptForBlow = diceForBlow(lasting.filter((_die, index) => choice.lasting?.[index]), {
		melee,
		items: chosen.map((source) => source.item.id)
	});
	const bonusDice = [...typedBonus, ...keptForBlow.map(({ faces, label, item }) => ({ faces, label, ...(item ? { item } : {}) }))];
	// A specialist weapon's die joins only when it's wielded in the situation it's made for (p12).
	for (const item of chosen.filter((candidate) => choice.specialist?.[candidate.id])) {
		const die = specialistDie(item.system);
		if (die) bonusDice.push(...parseDice(die).map((faces) => ({ faces, label: t("attack.specialistDie", { name: item.name }), item: item.item.id })));
	}
	// Smite for a lasting mark adds no dice: the Wound it deals leaves the mark (p187).
	if (smite?.mode === "d12") bonusDice.push({ faces: 12, label: t("feats.smite.name") });
	// A die an Ability adds to the blow it's used in, as a charge's +d12 (p92).
	for (const { die, name } of declared.dice) bonusDice.push(...parseDice(die).map((faces) => ({ faces, label: name })));
	return { typedBonus, bonusDice };
}

/**
 * What making the Attack does to the actor, held back until it's certain to
 * count, since a card can refuse a join after the dialog is answered.
 * Declaring it is done at once; what it uses up, a Pack card spends only once
 * its dice are rolled.
 * @param {object} made
 * @param {Actor} made.actor
 * @param {object|null} made.joining The card they join, if any.
 * @param {object} made.choice The dialog's expanded form data.
 * @param {import("./attack-memory.js").AttackChoice|null} made.remembered What they last rolled with.
 * @param {boolean} made.riding
 * @param {boolean} made.warband
 * @param {Actor|null} made.leader
 * @param {AttackPlan["smite"]} made.smite
 * @param {AttackSource[]} made.chosen What strikes.
 * @param {ReturnType<typeof declaredGrants>} made.declared
 * @param {Item[]} made.linked Abilities that gave a weapon wielded.
 * @param {boolean} made.impaired
 * @param {{faces: number, label: string}[]} made.typedBonus
 * @returns {Pick<AttackPlan, "declare"|"spend"|"settle">}
 */
function attackCosts({ actor, joining, choice, remembered, riding, warband, leader, smite, chosen, declared, linked, impaired, typedBonus }) {
	const declare = async () => {
		// Their next Attack with this actor opens on what they chose here. A join draws no Wait box,
		// so the Wait they last ticked on an Attack of their own stays as it was.
		await rememberAttack(actor, joining ? { ...choice, wait: Boolean(remembered?.wait) } : choice);
		const update = {};
		// Riding or not, as ticked here, is marked on them, so a rider's plate counts while they ride.
		if (typeof actor.system.mounted === "boolean" && actor.system.mounted !== riding) update["system.mounted"] = riding;
		// They share the Warband's Damage until their next turn, so the Warband remembers who leads it,
		// and forgets a leader who no longer does.
		const leaderUuid = leader?.uuid ?? "";
		if (warband && actor.system.leader !== leaderUuid) update["system.leader"] = leaderUuid;
		if (actor.isOwner && Object.keys(update).length) await actor.update(update);
		// The Smite's Save is already rolled, so it's paid for as it's made, called off or not.
		if (smite) await payFeat(actor, smite.save, "smite");
	};
	const spend = {
		items: [...new Set(chosen.map(({ item }) => item.id))],
		// A charge that shatters the lance it's made with (p92).
		shatters: Boolean(declared.shatters),
		abilities: [...new Set([...declared.used.map((offer) => offer.id), ...linked.map((item) => item.id)])],
		// Bonus dice kept with them for the rest of the fight, as an Ability that grows with each blow says.
		// An Impaired Attack gains no bonus dice (p8), so it has none to keep.
		keep: choice.keepBonus && !impaired ? typedBonus.map(({ faces, label }) => ({ faces, label })) : []
	};
	const settle = async () => {
		await declare();
		await spendAttack(actor, spend);
	};
	return { declare, spend, settle };
}

/**
 * Ask how an actor attacks and gather the dice they bring: the Attack dialog,
 * and what answering it settles before anything is rolled, such as a Smite's
 * Save, riding or not, and who leads a Warband. A fresh Attack and joining
 * another's are both made this way (p8).
 * @param {Actor} actor
 * @param {import("../rules/attack.js").AttackState|ReturnType<typeof packAsJoining>|null} [joining] The card
 *   they join, whose targets they strike: an Attack card, or a Pack card still gathering.
 * @returns {Promise<AttackPlan|null>} Null if the dialog was closed or the Attack can't be made.
 */
async function planAttack(actor, joining = null) {
	const cant = whyCantAttack(actor);
	if (cant) {
		ui.notifications.warn(cant);
		return null;
	}
	const armed = armedWith(actor);
	const sources = attackSources(armed);
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
	// A rider thrown in an earlier exchange of the joust fights on afoot (p10).
	const thrown = duel?.duel.kind === "joust" && duel.duel.exchanges > 0 && actor.system.mounted === false;
	const mounted = (duel?.duel.kind === "joust" && !thrown) || Boolean(conditions.mounted) || Boolean(remembered?.mounted && !thrown);
	const wielded = openingWielded(actor, sources, remembered, mounted, marks);
	const ticks = rememberedTicks(remembered);
	// Abilities that lend a blow something: one with no limit comes ticked, one with uses waits to be spent.
	const offers = abilityOffers(Array.from(actor.items ?? []));
	// What the dialog weighs its Blast-only checks against, and the steed that draws its charge box.
	const aim = { joining, duel, offers, trapped: shieldTrapped(marks), mount };
	// Dice they keep for the rest of the fight.
	const combatant = combatantOf(actor);
	// How many stand on each side of their Combat, for an Ability that needs a crowd (p38).
	const sides = offers.some((offer) => offer.crowd) ? sidesAround(combatant) : null;
	// The duel the dialog is weighed as a blow in: the one in hand, until its box is unticked.
	let weighedIn = duel;
	// Who the Attack is aimed at as the dialog opens.
	let aimedAt = aimFor(joining, weighedIn);
	// What was answered before the targets changed, opened on again.
	let answered = null;
	let data;
	let aimWeighed = null;
	for (;;) {
		// Nobody makes an Attack at themself.
		if (!joining && targeted({ targets: aimedAt }, actor)) {
			warn("attack.selfTarget", { name: actor.name });
			return null;
		}
		const weighed = weighTargets(actor, aimedAt, { joining, duel: weighedIn, mount, warband, ticks, combatant });
		// Targeted anew, though they draw the dialog no differently: the blow is rolled at them as answered.
		const retargeted = aimWeighed !== null;
		const unchanged = retargeted && weighed.signature === aimWeighed.signature;
		aimWeighed = weighed;
		if (unchanged) break;
		if (retargeted) {
			// What these targets change, such as a weakness or a steed's trample, is shown before it's rolled.
			ui.notifications.info(t("attack.retargeted", { name: actor.name }));
			answered = data;
		}
		const { chargeBarred, weaknesses, individuals, lasting, said } = aimWeighed;
		let stopFollowingAim = () => {};
		const prefill = answered;
		data = await Promise.resolve(inputDialog({
			title: joining ? t("attack.joinTitle", { name: joining.attackerName ?? fromUuidSync(joining.attacker)?.name ?? "" }) : t("attack.title"),
			icon: "fa-solid fa-swords",
			template: "attack",
			context: attackDialogContext({
				actor, joining, sources, armed, wielded, remembered, ticks, individuals, mounted, duel, mount, chargeBarred,
				startsImpaired, marks, aimedAt, said, weaknesses, offers, sides, lasting, combatant, warband, leaders
			}),
			ok: { label: t(joining ? "attack.joinRoll" : "attack.roll"), icon: "fa-solid fa-dice" },
			render: (_event, dialog) => {
				if (prefill) refillAttackForm(dialog, prefill);
				watchWielding(dialog, actor, sources, marks, aim, { mount, leaders });
				// A joined Attack's targets are its card's; a blow of one's own follows the targeting, or the duel while it's ticked.
				if (!joining) stopFollowingAim = followAim(dialog, duel);
			}
		})).finally(() => stopFollowingAim());
		if (!data || joining) break;
		// Targeted while it stood open, or the duel unticked: the blow lands on those aimed at now, so it's weighed at them.
		const inDuelNow = duel && data.duel ? duel : null;
		const now = aimFor(null, inDuelNow);
		if (inDuelNow === weighedIn && sameTargets(now, aimedAt)) break;
		aimedAt = now;
		weighedIn = inDuelNow;
	}
	if (!data) return null;
	const { weaknesses, lasting } = aimWeighed;

	const choice = foundry.utils.expandObject(data);
	const { chosen: picked, check, situation } = readWielding(actor, sources, choice, aim);
	const declared = declaredGrants(choice, offers, declarableBy(actor));
	if (check.refusal) {
		warn(`attack.refusals.${check.refusal}`, { name: actor.name });
		return null;
	}
	// Sent before the dialog could say so: what can't be read as dice is never quietly dropped.
	const [unread] = unreadDice(choice);
	if (unread) {
		ui.notifications.warn(unread);
		return null;
	}
	// A blow made alone, as Pain Strike's is (p68), joins nobody else's.
	if (joining && declared.alone) {
		warn("attack.aloneJoin", { name: actor.name });
		return null;
	}
	// What strikes: those ticked, less any set aside, such as a shield a foe's Trap holds (p10).
	const chosen = check.usable.map((index) => picked[index]);
	// A blow is a shot when a ranged weapon strikes; one ticked but set aside doesn't make it one.
	const melee = !chosen.some((source) => source.system.ranged);
	// An Ability used only in melee (p68), or only on a mounted charge (p92).
	const unmet = unmetNeed(declared.used, {
		melee,
		charging: situation.charging,
		shield: chosen.some((source) => source.system.shield),
		moved: situation.moved
	});
	if (unmet) {
		warn(`attack.needs.${unmet.needs}`, { name: unmet.name });
		return null;
	}
	const { riding } = situation;
	// A weapon an Ability gave, such as a burst of light, spends one of its uses (p112).
	const linked = linkedAbilities(Array.from(actor.items ?? []), chosen.map((source) => source.item.flags?.[SYSTEM_ID]?.[KIT_FLAG]).filter(Boolean));
	const spent = linked.find((item) => item.system.restock !== "attack" && isUsedUp(item.system));
	if (spent) {
		warn("ability.usedUp", { name: spent.name });
		return null;
	}
	// Leading from the front adds the leader's Attack dice to the Warband's roll (p11).
	const leader = leaderOf(leaders, choice);
	// What rolls, as the dialog weighed it while it was answered.
	const { weaponItems, improvised, weaponDice } = weaponDiceOf(chosen, choice, { mount, leader });
	// A foe's Impair on one weapon holds this Attack only if it's made with that weapon (p186).
	const impairedWeapon = impairedItem(marks, chosen.map(({ item }) => item));
	// Impaired is read off the actor and the marks on them, never declared in the dialog.
	const impairedBy = impairment({ condition: startsImpaired, confined: check.impaired, weapon: impairedWeapon, unarmed: !weaponDice.length });
	const { impaired } = impairedBy;
	// A Warband's Attack on individuals gets +d12 and Blast (Warfare, p11).
	const againstIndividuals = warband && Boolean(choice.againstIndividuals);

	// Smite is declared before rolling, and Impaired attacks cannot benefit from Feats.
	let smite = null;
	if (choice.smite && !impaired) {
		const save = await rollFeat(actor, "smite");
		if (save) smite = { mode: choice.smite, feat: featContext("smite", save), roll: save.roll, save };
	}

	const { typedBonus, bonusDice } = bonusDiceOf({ choice, lasting, melee, chosen, smite, declared });
	// A known weakness joins each card at whoever has it, and only while it's ticked.
	const exploited = weaknesses.filter((_weakness, index) => choice.weakness?.[index]);

	let dice = impaired
		? [{ faces: 4, label: t(weaponDice.length ? "conditions.impaired.label" : "attack.unarmed") }]
		: [...weaponDice, ...bonusDice];

	// A Blast declared for an Ability isn't a Feat, so it holds even when the Attack is Impaired.
	const blast = isBlastAttack({ granted: declared.blast, smite: smite?.mode, againstIndividuals, weapons: chosen.map((item) => item.system) });
	// An Attack in a duel is against the other duelist, whatever else is targeted.
	const inDuel = duel && choice.duel ? duel : null;
	// Those the dialog weighed it at, not whoever is targeted now: a Token targeted during the Smite roll isn't weighed.
	const targets = aimedAt;
	// The dialog counted a Smite for a Blast, but an Impaired Attack loses its Smite, and with it the
	// Blast, so it can no longer be made at several targets (p8).
	if (!joining && targets.length > 1 && !blast) {
		warn("attack.refusals.severalTargets", { name: actor.name });
		return null;
	}
	// Dice joined into bigger ones before the roll, as an Ability may let them be (p56).
	const combines = Boolean(declared.combine && !impaired);
	// A fresh Attack may gather its allies' dice on a Pack card first, so all roll at the same time (p8).
	// Never a blow in a duel, which is one on one, one made alone, or a Blast rolled at each target apart.
	const mayGather = !joining && !inDuel && !declared.alone && !(blast && targets.length > 1);
	// A Wait ticked for a blow that can't gather is said, not quietly dropped.
	if (choice.wait && !joining && !mayGather) ui.notifications.info(t("attack.waitIgnored", { name: actor.name }));
	// Its dice as they'd stand at its targets, weighed only where it may gather and has cause to.
	const weighed = mayGather && (choice.wait || combines)
		? diceAt({ weaponDice, dice, impaired, mount, exploited, blast, warband, againstIndividuals, inDuel }, targets)
		: null;
	// Gathered on a Pack card of its own where it's asked to wait for allies, or where it joins dice, so
	// theirs can be joined too (p56); otherwise rolled at once, or brought unrolled to the Pack card it
	// joins. One that joins dice and wasn't asked to wait rolls at once where its targets Impair it
	// anyway, as a swarm does: a d4 alone has nothing to join.
	const gather = weighed && (choice.wait || !weighed.impaired) ? weighed : null;
	// Joining another's rolled card, they attack with an ally, so they may join their own dice first,
	// the only ones still theirs to join. A blow rolled at once with nobody beside it (a duel's, one
	// made alone, a Blast at each target apart) has no ally, so joins nothing (p56), as a Pack card
	// with nobody else on it doesn't. On a Pack, they're joined at its roll.
	if (joining && !joining.pack && combines) {
		// A steed's trample stays its own, since it joins only a charge at foes on foot (p10).
		const joined = await chooseCombined(dice.filter((die) => !die.trample));
		if (!joined) return null;
		dice = [...joined, ...dice.filter((die) => die.trample)];
	}

	return {
		...attackCosts({ actor, joining, choice, remembered, riding, warband, leader, smite, chosen, declared, linked, impaired, typedBonus }),
		actor,
		choice,
		picked,
		chosen,
		melee,
		check,
		mount,
		warband,
		leader,
		weaponItems,
		improvised,
		weaponDice,
		dice,
		impaired,
		riding,
		smite,
		exploited,
		blast,
		declared,
		inDuel,
		targets,
		gather,
		combines,
		againstIndividuals,
		// Said on the card only where nothing else Impaired it first: no condition, nor a confined Long weapon.
		impairedWeapon: impairedBy.cause === "weapon" ? impairedWeapon : null
	};
}

/**
 * What an Ability that tempers its weapon gives a melee blow (p98): its die,
 * and the weapons the blow is made with, one of which a Wound will temper.
 * @param {Actor} actor
 * @param {object[]} chosen The weapons wielded, as attackSources gives them.
 * @returns {import("../rules/lasting-dice.js").Temper|null}
 */
function temperOf(actor, chosen) {
	const ability = Array.from(actor.items ?? []).find((item) => item.type === "ability" && item.system.tempers && parseDice(item.system.lastingDie).length);
	// Read off the mode each is wielded in, as a bolt-guisarme is in melee or shot (p98).
	const weapons = chosen.filter((source) => source.item.type === "weapon" && !source.system.ranged).map(({ item }) => ({ id: item.id, name: item.name }));
	if (!ability || !weapons.length) return null;
	return { label: ability.name, faces: parseDice(ability.system.lastingDie)[0], weapons: [...new Map(weapons.map((weapon) => [weapon.id, weapon])).values()] };
}

/**
 * How many stand on each side of somebody's Combat (p38).
 * @param {Combatant|null} combatant Their place in it.
 * @returns {{ours: number, theirs: number}|null} Null outside a Combat, or with no Token to say whose side they're on.
 */
function sidesAround(combatant) {
	const disposition = combatant?.token?.disposition;
	if (!combatant?.combat || typeof disposition !== "number") return null;
	const entry = (each) => ({
		disposition: each.token?.disposition,
		present: each.sceneId === combatant.sceneId && !each.hidden && !each.token?.hidden,
		standing: Boolean(each.actor) && !each.isDefeated && !downBy(each.actor.system) && warbandFighting(each.actor.system.warband),
		warband: each.actor?.system?.scale === "warband"
	});
	return sideCounts([...combatant.combat.combatants].filter((each) => each !== combatant).map(entry), entry(combatant));
}

/**
 * @param {import("../rules/ability-uses.js").AbilityOffer} offer
 * @param {{ours: number, theirs: number}|null} sides
 * @returns {boolean} Whether enough stand on each side for an Ability that needs a crowd (p38).
 */
const crowdMet = (offer, sides) => Boolean(offer.crowd && sides && sides.ours >= offer.crowd && sides.theirs >= offer.crowd);

/**
 * What an Ability that needs a crowd says of the one there (p38).
 * @param {import("../rules/ability-uses.js").AbilityOffer} offer
 * @param {{ours: number, theirs: number}|null} sides
 * @returns {string|null} Null for any other Ability.
 */
function crowdHint(offer, sides) {
	if (!offer.crowd) return null;
	if (!sides) return t("attack.crowdUnknown", { count: offer.crowd });
	return t(crowdMet(offer, sides) ? "attack.crowdMet" : "attack.crowdShort", { count: offer.crowd });
}

/**
 * What an Attack card says of how the Attack was made, beyond its dice.
 * @param {AttackPlan} plan
 * @returns {object} Part of an AttackState.
 */
function madeWith({ actor, chosen, melee, picked, check, impaired, riding, smite, leader, warband, blast, declared, impairedWeapon }) {
	const harm = structureHarm({
		fromSiege: actor.type === "structure",
		large: actor.type === "npc" && Boolean(actor.system.structure),
		texts: chosen.map((item) => `${item.name} ${item.system.description ?? ""}`)
	});
	return {
		melee,
		// A Wound dealt with one of these weapons gives it a die for the rest of the fight (p98).
		tempers: melee ? temperOf(actor, chosen) : null,
		// A Long weapon takes both hands (p12), so no shield is held while it's fought with.
		twoHanded: chosen.some((item) => !item.system.noHand && heldAs(item.system, riding).long),
		impaired,
		// A Long weapon in a confined space is why this Attack is Impaired.
		confined: check.impaired,
		// A foe's Impair on the weapon it's made with is why.
		impairedWeapon,
		setAside: check.setAside.map(({ index, reason }) => ({ name: picked[index].name, reason })),
		blast,
		ignoresArmour: declared.ignoresArmour || chosen.some((item) => item.system.ignoresArmour),
		// Gambits from this Attack's dice are Strong without an 8+, as an Ability may make them.
		strongGambits: declared.strongGambits,
		// Nothing keeps its target from harm (p54).
		ignoresImmunity: declared.ignoresImmunity,
		// Its maker takes d6 should the target stay up (p54), or their allies' SPI comes back should it fall (p74).
		backlash: declared.backlash,
		rally: declared.rally,
		// Its maker takes back the VIG a Wound costs (p166), or its Damage comes off SPI (p68).
		drain: declared.drain,
		spirit: declared.spirit,
		// Made alone, so nobody joins it.
		alone: declared.alone,
		// What a Wound from it does besides, picked before the blow (p166).
		onWound: ON_WOUND.filter((key) => declared[key]),
		// What it shatters as it lands, as a charge its lance (p92).
		shattered: declared.shatters ? weaponsIn(chosen).map((item) => item.name) : [],
		// What burns on where its Damage lands, as a flask of acid (p173).
		lingers: weaponsIn(chosen).filter((item) => item.system.lingers).map((item) => ({
			name: item.name,
			damage: item.system.damage,
			when: item.system.lingers,
			ignoresArmour: Boolean(item.system.ignoresArmour)
		})),
		// Its Damage never Slays or leaves anybody dying (p173).
		nonLethal: chosen.length > 0 && chosen.every((item) => item.system.nonLethal),
		// What a Cast member's weapon does besides its dice, as its stat block says: "sets area alight".
		notes: isKnight(actor) ? [] : chosen.map((item) => ({ name: item.name, note: plainNote(item.system.description) })).filter(({ note }) => note),
		// A Warband's Attack is large-scale, and so is a siege weapon's or a suitably large
		// creature's, so each can harm a Warband (p11).
		largeScale: warband || harm.siege || harm.large,
		// Fire, a siege weapon or a suitably large creature harms a structure (p11).
		structureHarm: harm,
		leader: leader ? { uuid: leader.uuid, name: leader.name } : null,
		smite: smite?.feat ?? null,
		// A Smite made to leave a lasting mark rather than more Damage, which a Wound brings (p187).
		smiteMark: smite?.mode === "mark"
	};
}

/**
 * How an Attack was made, as one card's roll leaves it: Impaired at a swarm,
 * which is then said to be why, and with a steed's trample set aside where it
 * met only riders. `swarm` is left out where it isn't why, which reads as false.
 * @param {ReturnType<typeof madeWith>} made
 * @param {Awaited<ReturnType<typeof rollAt>>|ReturnType<typeof diceAt>} card
 * @returns {ReturnType<typeof madeWith>}
 */
const withCard = (made, card) => ({
	...made,
	impaired: made.impaired || card.impaired,
	setAside: card.trampleOut ? [...made.setAside, card.trampleOut] : made.setAside,
	...(card.swarm ? { swarm: true } : {})
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
	const { cardDice, ...made } = diceAt(plan, group);
	const roll = await rollDicePool(cardDice);
	const rolled = cardDice.map((die, i) => ({
		faces: die.faces,
		label: die.label,
		result: roll.dice[i].total,
		deniedBy: null,
		...(die.item ? { item: die.item } : {}),
		...(die.weakness ? { weakness: true } : {})
	}));
	return { roll, dice: sortDice(rolled), ...made };
}

/**
 * The dice an Attack rolls at one card's targets, weighed as rollAt says,
 * before they're rolled: a Pack card holds them so until its Knight rolls (p56).
 * @param {AttackPlan} plan
 * @param {{uuid: string, name: string}[]} group The card's targets.
 * @returns {{cardDice: {faces: number, label: string, item?: string, weakness?: boolean, trample?: boolean}[],
 *   trampleOut: {name: string, reason: string}|null, impaired: boolean, swarm: boolean}}
 */
function diceAt(plan, group) {
	const { weaponDice, dice, impaired, mount, exploited } = plan;
	// The other duelist in a joust rides, marked so or not yet (p10).
	const standing = group.map((target) => standingOf(target, plan.inDuel));
	const trampleOut = weaponDice.some((die) => die.trample) && !trampleJoins(standing);
	const unarmed = trampleOut && !impaired && weaponDice.every((die) => die.trample);
	const swarmed = !impaired && !unarmed && swarmImpairs({ blast: plan.blast, largeScale: plan.warband }, standing);
	const individuals = plan.againstIndividuals && !impaired && atIndividuals(standing) !== false
		? [{ faces: 12, label: t("npc.scales.warband.label") }]
		: [];
	// An Impaired Attack rolls its d4 alone, known weakness or not.
	const cardDice = unarmed || swarmed
		? [{ faces: 4, label: t(unarmed ? "attack.unarmed" : "npc.scales.swarm.label") }]
		: [...dice.filter((die) => !(trampleOut && die.trample)), ...individuals, ...(impaired ? [] : weaknessDice(group, exploited))];
	return {
		cardDice,
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
	playStoredBlows(blowsOf(plan), plan.actor);
}

/**
 * What an attacker's blows look like on the map, kept as plain data so a
 * Pack card can hold them until its dice are rolled (p56).
 * @param {AttackPlan} plan
 * @returns {object}
 */
function blowsOf(plan) {
	return {
		attacker: plan.actor.uuid,
		weapons: [
			...plan.weaponItems.map((item) => ({ name: item.name, damage: item.system.damage, ranged: Boolean(item.system.ranged) })),
			...(plan.improvised ? [{ ...plan.improvised, ranged: false }] : [])
		],
		mounted: plan.riding,
		warband: plan.warband,
		// An Impaired Attack rolls one d4 whatever they hold (p9), so it strikes once.
		impaired: plan.impaired,
		targets: plan.targets
	};
}

/**
 * Draw blows kept by blowsOf, for whoever made them.
 * @param {object|null} blows
 * @param {Actor|null} [attacker] Who made them, found from the blows when left out.
 */
function playStoredBlows(blows, attacker = blows ? fromUuidSync(blows.attacker) : null) {
	if (!blows || !attacker) return;
	// A card the table wasn't shown isn't drawn on their map either, as playBlowFx reads it by default.
	playBlowFx({ ...blows, attacker });
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
	const { targets, inDuel } = plan;
	// Gathered on a Pack card first, so allies attacking too roll with it at the same time (p8), and an
	// Ability that joins dice can join theirs (p56), as planAttack decided.
	if (plan.gather) return gatherPack(plan, plan.gather);
	// A Blast rolls for everybody in its area, one target at a time (p8).
	const groups = plan.blast && targets.length > 1 ? targets.map((target) => [target]) : [targets];

	const shared = newAttackState({
		// Cards from one Blast share an id, so a Feat used on one counts for all of them.
		attackId: foundry.utils.randomID(),
		attacker: actor.uuid,
		attackerName: actor.name,
		place: combatPlace(),
		made: madeWith(plan),
		duel: inDuel?.message.id ?? null
	});

	const messages = [];
	for (const [index, group] of groups.entries()) {
		const card = await rollAt(plan, group);
		const state = { ...withCard(shared, card), targets: group, dice: card.dice };
		// The Smite Save was rolled once, so only the first card carries it.
		const rolls = plan.smite && index === 0 ? [plan.smite.roll, card.roll] : [card.roll];
		messages.push(await postCard(actor, "attack", attackCardContext(state), {
			rolls,
			flags: { [SYSTEM_ID]: { attack: state } }
		}));
	}
	// Paid for once a card stands for it, so an Attack that never reached the chat spends no use,
	// thrown weapon or Smite (p112).
	await plan.settle();
	if (inDuel) await saveDuelChange(inDuel.message, { type: "attack", actor: actor.uuid, message: messages[0].id });
	// A Knight whose stance draws the fire makes a foe who struck somebody else pay (p128).
	await offerDrawnFire(actor, groups.flat());
	playBlows(plan);
	return messages;
}

/**
 * Show dice rolled into a card that's already posted, as Dice So Nice shows a
 * new card's, to the table or only to GMs as the chat would. Adding a roll to a
 * posted message keeps its tooltip but tumbles nothing.
 * @param {Roll[]} rolls
 */
export function showRolls(rolls) {
	if (!game.dice3d) return;
	const whisper = chatIsPublic() ? null : gmIds();
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
	const plan = await planJoin(actor, attackState);
	if (!plan) return null;
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
			...withCard(madeWith(plan), card)
		},
		settle: async () => {
			await plan.settle();
			showRolls(rolls);
			playBlows(plan);
		}
	};
}

/**
 * The joiner's Attack dialog, aimed at the card they join. A Blast can't join
 * a card at several targets, since it rolls for each (p8).
 * @param {Actor} actor Whoever joins.
 * @param {{targets: object[]}} joining The card as planAttack reads it.
 * @returns {Promise<AttackPlan|null>}
 */
async function planJoin(actor, joining) {
	const plan = await planAttack(actor, joining);
	if (!plan) return null;
	if (plan.blast && joining.targets.length > 1) {
		warn("attack.joinBlastSeveral", { name: actor.name });
		return null;
	}
	return plan;
}

/**
 * One attacker's share of a Pack card: how they attack, their dice unrolled,
 * and what the Attack will use up of theirs once it's rolled.
 * @param {AttackPlan} plan
 * @param {ReturnType<typeof diceAt>} at
 * @returns {{actor: string, name: string, made: object, dice: object[], blows: object, combine: boolean,
 *   spend: import("../rules/pack.js").PackSpend}}
 */
function packShareOf(plan, at) {
	return {
		actor: plan.actor.uuid,
		name: plan.actor.name,
		made: withCard(madeWith(plan), at),
		dice: at.cardDice,
		blows: blowsOf(plan),
		// An Impaired share rolls its d4 alone, with nothing to join (p8).
		combine: plan.combines && !at.impaired,
		spend: plan.spend
	};
}

/**
 * Post a Pack card, so allies attacking the same target bring their dice
 * before anything is rolled (p8), and an Ability that joins dice can join
 * theirs (p56). The Attack is declared once the card stands, so its Smite is
 * paid for then; what it uses up waits for the roll, so calling it off spends none.
 * @param {AttackPlan} plan
 * @param {ReturnType<typeof diceAt>} at
 * @returns {Promise<ChatMessage[]|null>}
 */
async function gatherPack(plan, at) {
	const { actor } = plan;
	const pack = newPack({
		attackId: foundry.utils.randomID(),
		attacker: actor.uuid,
		attackerName: actor.name,
		targets: plan.targets,
		share: packShareOf(plan, at)
	});
	const message = await postCard(actor, "pack", packCardContext(pack), {
		rolls: plan.smite ? [plan.smite.roll] : [],
		flags: { [SYSTEM_ID]: { [PACK_FLAG]: pack } }
	});
	if (!message) return null;
	await plan.declare();
	return [message];
}

/**
 * Bring an actor's dice to a Pack card, unrolled: their own Attack dialog,
 * aimed at the card's targets, as joining an Attack card is (p8). Their Attack
 * is declared once the card takes them; what it uses up waits for the roll.
 * @param {Actor} actor Whoever joins.
 * @param {import("../rules/pack.js").PackState} pack
 * @returns {Promise<{change: object, settle: () => Promise<void>}|null>} The card's `join`
 *   change (see changePack), or null if the dialog was closed or the join can't be made.
 */
export async function joinPack(actor, pack) {
	const plan = await planJoin(actor, packAsJoining(pack));
	if (!plan) return null;
	const rolls = plan.smite?.roll ? [plan.smite.roll] : [];
	return {
		change: { type: "join", ...packShareOf(plan, diceAt(plan, pack.targets)), rolls: rolls.map((roll) => roll.toJSON()) },
		settle: async () => {
			await plan.declare();
			showRolls(rolls);
		}
	};
}

/**
 * What a die joined on a Pack card is called: "Joined d4+d8", and whose dice
 * besides its owner's went into it.
 * @param {string} faces
 * @param {string[]} others
 * @returns {string}
 */
const packJoinedLabel = (faces, others) => (others.length
	? t("attack.combine.joinedWith", { dice: faces, names: others.join(", ") })
	: t("attack.combine.joined", { dice: faces }));

/**
 * What the Pack's dice window says will roll: each die and whose it will be,
 * and where one can't harm the target, why. A die joined from somebody's who
 * could harm it into one of somebody's who can't is said as a warning (p11, p56).
 * @param {import("../rules/pack.js").PackState} pack
 * @returns {(groups: number[]) => CombinedLine}
 */
function packLine(pack) {
	// What only some Attacks can harm, as the Attack card will weigh it.
	const target = cardTarget({ targets: pack.targets, joined: pack.shares.slice(1) });
	return (groups) => {
		const { over, dice } = packPreview(pack, groups, packJoinedLabel, target);
		if (over.length) return overLine(over);
		const parts = dice.map(({ faces, owner, barred }) => (barred
			? t("attack.combine.ownedBarred", { faces, name: owner, reason: t(`attack.barred.${barred}`) })
			: t("attack.combine.owned", { faces, name: owner })));
		const warning = dice.some((die) => die.joined && die.barred);
		const text = t("attack.combine.rolls", { dice: parts.join(", ") });
		return { text: warning ? `${text} ${t("attack.combine.barredJoined")}` : text, warning, blocked: false };
	};
}

/**
 * The Join Dice window over everybody's dice on a Pack card, each named for
 * who brought it, where somebody's Ability joins dice. Otherwise, and with
 * nobody else there, nothing joins: the Ability needs an ally attacking too (p56).
 * @param {import("../rules/pack.js").PackState} pack
 * @returns {Promise<number[]|null>} As askGroups, or none at all with nothing to join.
 */
export function askPackGroups(pack) {
	if (!packJoinsDice(pack)) return Promise.resolve([]);
	return askGroups(joinablePool(pack).map((die) => ({ faces: die.faces, label: t("attack.pooledDie", { name: pack.shares[die.share].name, label: die.label }) })), {
		legend: t("attack.combine.packLegend"),
		hint: t("attack.combine.packHint", { name: pack.attackerName }),
		line: packLine(pack)
	});
}

/**
 * Roll a Pack card's dice, joined as they were grouped, into one Attack card
 * made by all of them together (p8, p56). What each attacker uses up is spent
 * after, share by share, and the blows drawn (pack-card.js, packRolled).
 * @param {Actor} knight Whoever gathered it.
 * @param {import("../rules/pack.js").PackState} pack
 * @param {number[]} groups As askPackGroups gives them.
 * @returns {Promise<ChatMessage|null>} The Attack card.
 */
export async function rollPack(knight, pack, groups) {
	const { dice } = packDice(pack, groups, packJoinedLabel);
	const roll = await rollDicePool(dice);
	// Where in the Combat it was rolled, which is when the Attack is made, so a Gambit's mark lapses from there.
	const state = packAttackState(pack, dice, roll.dice.map((die) => die.total), combatPlace());
	return (await postCard(knight, "attack", attackCardContext(state), { rolls: [roll], flags: { [SYSTEM_ID]: { attack: state } } })) ?? null;
}

/**
 * What follows a Pack's roll once its Attack card stands: a Knight whose
 * stance draws the fire makes a foe who struck somebody else pay (p128), and
 * everybody's blows are drawn on the map.
 * @param {Actor} knight Whoever gathered it.
 * @param {import("../rules/pack.js").PackState} pack
 */
export async function packRolled(knight, pack) {
	await offerDrawnFire(knight, pack.targets);
	for (const share of pack.shares) playStoredBlows(share.blows);
}
