/**
 * Six Knights' Abilities in play, by the powers their kits give them (see
 * rules/knight-powers.js): allies rallied by a Mortal Wound (p42), a seal on
 * somebody else's arms (p70), a wall broken through (p84), foes who strike
 * elsewhere paying in SPI (p128), a day in a cocoon (p156), and a return from
 * death (p158). What needs the Referee goes on a card only they press.
 */
import { chooseOne } from "../apps/actor-pick.js";
import { confirmDialog } from "../apps/ui.js";
import { askActiveGMOrWarn } from "../ask-gm-warn.js";
import { postCard, registerCardButtons, t, warn } from "../chat/cards.js";
import { deletionEntry } from "../compat.js";
import { gmAsker } from "../gm-asker.js";
import { abilitiesWith } from "../rules/ability-uses.js";
import { isKnight } from "../rules/knight-types.js";
import { alliesBeside, drawingFire, guardAfter, mendedUpdate, risenUpdate, sealable } from "../rules/knight-powers.js";
import { escapeHTML } from "../rules/text.js";
import { SYSTEM_ID } from "../system-id.js";
import { updateActors } from "./actor-updates.js";
import { loseVirtue, rollDamageOn } from "./abilities.js";
import { keepLastingDice, placesInCombat } from "./lasting-dice.js";
import { causedBy } from "./ledger.js";
import { registerQuery } from "../queries.js";

/** The query asking the active GM to seal arms the Knight's player can't write (p70). */
const SEAL_QUERY = `${SYSTEM_ID}.sealArms`;

/** What marks the buttons on the cards a Mortal Wound's rally and a strike elsewhere post. */
const RALLY_SELECTOR = "[data-mortal-rally]";
const DRAWN_SELECTOR = "[data-drawn-fire]";

/**
 * Everybody fighting in somebody's Combat, a fight under way before one only
 * set up, each with their Token's disposition, and that somebody's own.
 * @param {Actor} actor
 * @returns {{combat: Combat|null, combatants: {actor: Actor|null, disposition: number|null}[], side: number|null}}
 */
export function sidesOf(actor) {
	const { combat, combatant } = placesInCombat(actor)[0] ?? {};
	if (!combat) return { combat: null, combatants: [], side: null };
	const combatants = [...combat.combatants].map((each) => ({ actor: each.actor, disposition: each.token?.disposition ?? null }));
	return { combat, combatants, side: combatant?.token?.disposition ?? null };
}

/**
 * A Knight Mortally Wounded by somebody known, whose Ability rallies their
 * allies (p42), posts a card the Referee presses: each ally fighting beside
 * them regains d6 GD and gets +d12 against that foe for the rest of the fight.
 * @param {Actor} victim
 * @param {string} byUuid Who dealt the Mortal Wound.
 * @returns {Promise<ChatMessage|null>}
 */
export async function offerMortalRally(victim, byUuid) {
	const [ability] = abilitiesWith(victim.items.contents, "mortalRally");
	const foe = fromUuidSync(byUuid ?? "");
	if (!ability || !foe) return null;
	return postCard(victim, "note", {
		icon: "fa-solid fa-crown",
		text: t("mortalRally.offer", { name: victim.name, foe: foe.name, ability: ability.name }),
		action: { data: "mortal-rally", icon: "fa-solid fa-people-group", label: t("mortalRally.button") }
	}, { mode: "public", flags: { [SYSTEM_ID]: { mortalRally: { victim: victim.uuid, by: foe.uuid, ability: ability.name } } } });
}

/**
 * Rally the allies fighting beside a Mortally Wounded Knight (p42).
 * @param {{victim: string, by: string, ability: string}} rally From the card.
 * @returns {Promise<boolean>} Whether anybody was rallied.
 */
async function rallyAllies({ victim: victimUuid, by, ability }) {
	const victim = fromUuidSync(victimUuid ?? "");
	const foe = fromUuidSync(by ?? "");
	if (!victim || !foe) return false;
	const { combatants, side } = sidesOf(victim);
	const allies = alliesBeside(combatants, victim.uuid, side).filter((ally) => ally.isOwner);
	if (!allies.length) {
		warn("mortalRally.nobody", { name: victim.name });
		return false;
	}
	const rolls = [];
	const entries = [];
	const writes = [];
	for (const ally of allies) {
		const roll = await new Roll("1d6").evaluate();
		rolls.push(roll);
		const { guard } = ally.system;
		const to = guardAfter(guard, roll.total);
		writes.push([ally, { "system.guard.value": to }]);
		entries.push({ name: ally.name, lines: [t("mortalRally.guard", { amount: roll.total, from: guard.value, to }), t("mortalRally.die", { foe: foe.name })] });
	}
	await updateActors(writes, causedBy("ability"));
	await Promise.all(allies.map((ally) => keepLastingDice(ally, [{ faces: 12, label: ability, against: foe.uuid, againstName: foe.name }])));
	await postCard(victim, "report", { title: t("mortalRally.title"), tagline: t("mortalRally.tagline", { name: victim.name, foe: foe.name }), entries }, { rolls });
	return true;
}

/**
 * After an Attack is rolled, each Knight on another side whose stance draws
 * the fire (p128) and who isn't among its targets posts a card the Referee
 * presses: the attacker loses d10 SPI, once the Attack is resolved.
 * @param {Actor} attacker
 * @param {{uuid: string}[]} targets The Tokens the Attack is at.
 * @returns {Promise<void>}
 */
export async function offerDrawnFire(attacker, targets) {
	const { combatants, side } = sidesOf(attacker);
	if (!combatants.length) return;
	const aimed = targets.map(({ uuid }) => fromUuidSync(uuid)?.actor?.uuid).filter(Boolean);
	for (const { actor, ability } of drawingFire(combatants, { uuid: attacker.uuid, side }, aimed)) {
		await postCard(actor, "note", {
			icon: "fa-solid fa-fire",
			text: t("drawsFire.offer", { name: actor.name, attacker: attacker.name, ability: ability.name }),
			action: { data: "drawn-fire", icon: "fa-solid fa-heart-crack", label: t("drawsFire.button") }
		}, { mode: "public", flags: { [SYSTEM_ID]: { drawnFire: { attacker: attacker.uuid, ability: ability.name } } } });
	}
}

/**
 * The SPI an attacker loses for striking somebody else (p128): Virtue Loss.
 * @param {{attacker: string, ability: string}} drawn From the card.
 * @returns {Promise<boolean>}
 */
async function payDrawnFire({ attacker: uuid, ability }) {
	const attacker = fromUuidSync(uuid ?? "");
	if (!attacker?.system?.virtues?.spi || !attacker.isOwner) return false;
	return Boolean(await loseVirtue(attacker, { name: ability, virtue: "spi", dice: "1d10" }, "ability", { icon: "fa-solid fa-fire", text: "drawsFire.paid", data: { name: attacker.name } }));
}

/** Where a death in battle keeps the Ultimate fate it wrote, while it stands. */
export const DEATH_FATE_FLAG = "deathFate";

/**
 * @param {Actor} knight
 * @returns {(fate: string) => boolean} Whether a fate is the one their death in
 *   battle wrote, and not since written over by hand.
 */
function deathWrote(knight) {
	const written = knight.getFlag?.(SYSTEM_ID, DEATH_FATE_FLAG);
	return written ? (fate) => fate === written : readsAsDeaths;
}

/**
 * @param {string} fate
 * @returns {boolean} Whether it reads as one a death in battle writes. Only for
 *   a Knight slain before the death kept the words it wrote.
 */
function readsAsDeaths(fate) {
	if (fate === t("fallen.fateSlain")) return true;
	const [before, after] = t("fallen.fateSlainBy", { name: "\u0000" }).split("\u0000");
	return fate.startsWith(before) && fate.endsWith(after ?? "") && fate.length > before.length + (after ?? "").length;
}

/**
 * Return from death as they were left (p158): no longer Slain, every score
 * as it stands. Their player or the Referee does it, from the Ability's row
 * or the card that says they fell.
 * @param {Actor} knight
 * @returns {Promise<Actor|null>} The Knight, back, or null.
 */
export async function riseFromDeath(knight) {
	if (!knight?.system?.slain) {
		warn("rises.notDead", { name: knight?.name ?? "" });
		return null;
	}
	if (!knight.isOwner) {
		warn("rises.notYours", { name: knight.name });
		return null;
	}
	const marked = knight.getFlag?.(SYSTEM_ID, DEATH_FATE_FLAG) !== undefined;
	const [forget, gone] = deletionEntry(`flags.${SYSTEM_ID}.${DEATH_FATE_FLAG}`);
	await knight.update({ ...risenUpdate(knight.system, deathWrote(knight)), ...(marked ? { [forget]: gone } : {}) }, causedBy("ability"));
	const [ability] = abilitiesWith(knight.items.contents, "rises");
	await postCard(knight, "note", {
		icon: "fa-solid fa-hand-sparkles",
		text: t("rises.done", { name: knight.name, ability: ability?.name ?? "", vig: knight.system.virtues.vig.value, guard: knight.system.guard.value })
	}, { mode: "public" });
	return knight;
}

/**
 * @param {Actor} actor
 * @returns {boolean} Whether a dead Knight has an Ability that brings them back (p158).
 */
export const canRise = (actor) => Boolean(actor?.system?.slain) && abilitiesWith(actor.items?.contents ?? [], "rises").length > 0;

/**
 * A full day in a cocoon (p156), once asked: VIG back to its most, the Mortal
 * Wound and Wound gone, and the body's afflictions cured. The Referee moves the
 * day on; this doesn't.
 * @param {Actor} actor
 * @param {Item} item The Ability.
 * @returns {Promise<boolean>}
 */
export async function mendInCocoon(actor, item) {
	if (actor.system.slain) {
		warn("mendsByDay.slain", { name: actor.name });
		return false;
	}
	const sure = await confirmDialog({
		title: item.name,
		icon: "fa-solid fa-egg",
		message: t("mendsByDay.confirm", { name: escapeHTML(actor.name) }),
		yes: { label: t("mendsByDay.emerge") }
	});
	if (!sure) return false;
	await actor.update(mendedUpdate(actor.system), causedBy("ability"));
	await postCard(actor, "note", { icon: "fa-solid fa-egg", text: t("mendsByDay.done", { name: actor.name, ability: item.name }) });
	return true;
}

/**
 * Break through a wall in motion (p84), once asked: d12 Damage to the Knight.
 * @param {Actor} actor
 * @param {Item} item The Ability.
 * @returns {Promise<boolean>}
 */
export async function breakThrough(actor, item) {
	const sure = await confirmDialog({
		title: item.name,
		icon: "fa-solid fa-person-running",
		message: t("breaksThrough.confirm", { name: escapeHTML(actor.name) }),
		yes: { label: t("breaksThrough.go") }
	});
	if (!sure) return false;
	await rollDamageOn(actor, "1d12", t("breaksThrough.cause", { ability: item.name }), { icon: "fa-solid fa-person-running", text: "breaksThrough.rolled" });
	return true;
}

/**
 * Put a Knight's seal on the arms of somebody who isn't a Knight, targeted
 * on the map (p70): they may Smite or Deny once as a Knight does, and then the
 * seal is gone. Which piece is picked from a list.
 * @param {Actor} actor The Knight.
 * @param {Item} item The Ability.
 * @returns {Promise<boolean>}
 */
export async function sealArms(actor, item) {
	const targets = [...game.user.targets].map((token) => token.actor).filter(Boolean);
	const bearer = targets.length === 1 ? targets[0] : null;
	if (!bearer || isKnight(bearer) || !bearer.system?.virtues) {
		warn("seal.target", { name: actor.name });
		return false;
	}
	const choices = sealable(bearer.items.contents);
	if (!choices.length) {
		warn("seal.nothing", { name: bearer.name });
		return false;
	}
	const picked = await chooseOne(choices, { title: item.name, icon: "fa-solid fa-stamp", intro: t("seal.which", { name: bearer.name }), message: t("seal.legend"), ok: t("seal.ok"), full: true });
	if (!picked) return false;
	const sealed = bearer.isOwner ? await setSeal(bearer, picked.id) : await askActiveGMOrWarn(SEAL_QUERY, { knight: actor.uuid, bearer: bearer.uuid, item: picked.id }, `Couldn't seal ${bearer.name}'s arms`, { absent: "seal.needsGM", data: { name: bearer.name } });
	if (!sealed) return false;
	await postCard(actor, "note", { icon: "fa-solid fa-stamp", text: t("seal.done", { name: actor.name, bearer: bearer.name, item: picked.name }) });
	return true;
}

/**
 * @param {Actor} bearer
 * @param {string} itemId
 * @returns {Promise<boolean>}
 */
async function setSeal(bearer, itemId) {
	const item = bearer.items.get(itemId);
	if (!item || !sealable([item]).length) return false;
	await item.update({ "system.sealed": true }, causedBy("ability"));
	return true;
}

/**
 * The GM sealing arms for the Knight's player (p70). The asker plays the Knight.
 * @param {{knight?: string, bearer?: string, item?: string}} data
 * @param {object} context
 * @returns {Promise<boolean>}
 */
export async function onSealQuery(data = {}, context = {}) {
	const asker = gmAsker(context);
	if (!asker) return false;
	const knight = typeof data?.knight === "string" ? fromUuidSync(data.knight) : null;
	const bearer = typeof data?.bearer === "string" ? fromUuidSync(data.bearer) : null;
	if (!knight?.testUserPermission?.(asker, "OWNER") || !abilitiesWith(knight.items.contents, "seals").length) return false;
	if (!bearer || isKnight(bearer) || typeof data?.item !== "string") return false;
	return setSeal(bearer, data.item);
}

/** Wire the cards and the query. Called during init. */
export function registerKnightPowers() {
	registerQuery(SEAL_QUERY, onSealQuery);
	registerCardButtons({
		selector: RALLY_SELECTOR,
		// The Referee's, who owns every ally and knows who fights beside them.
		gmOnly: true,
		fromPlayers: true,
		once: true,
		handler: (_button, message) => rallyAllies(message?.flags?.[SYSTEM_ID]?.mortalRally ?? {})
	});
	registerCardButtons({
		selector: DRAWN_SELECTOR,
		gmOnly: true,
		fromPlayers: true,
		once: true,
		handler: (_button, message) => payDrawnFire(message?.flags?.[SYSTEM_ID]?.drawnFire ?? {})
	});
}
