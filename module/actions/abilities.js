import { confirmDialog, inputDialog } from "../apps/ui.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { postCard, registerCardButtons, t, warn } from "../chat/cards.js";
import { KIT_WEAPON_KEYS, kitCatchUp, kitForPage, kitWeapons } from "../rules/ability-kits.js";
import { canTurnDie } from "../rules/attack.js";
import { SIGIL_MAX, abilitiesWith, etchUpdate, fadedUpdate, sigilChoices } from "../rules/ability-uses.js";
import { knightEntryByType } from "../rules/knight-tables.js";
import { countAfter, isCounted } from "../rules/restock.js";
import { escapeHTML, splitName } from "../rules/text.js";
import { SLAIN_UPDATE, downBy } from "../rules/virtues.js";
import { SYSTEM_ID } from "../system-id.js";
import { CALENDAR_HOOK } from "./calendar.js";
import { announceFallenKnight } from "./fallen.js";
import { causedBy } from "./ledger.js";
import { rollVirtueLosses } from "./virtue-loss.js";
import { worldKnights } from "./knights.js";

/**
 * What some Abilities do outside an Attack, from their row on the sheet: a
 * coin flipped for a life (p120) and a rune etched for a number at sunset
 * (p100). Gear that holds what's wanted on some odds rolls them here too (p88).
 */

/**
 * Somebody is killed outright, as a coin flipped for a life decides (p120):
 * VIG 0 by more than Virtue Loss, so Slain.
 * @param {Actor} actor
 */
async function slay(actor) {
	await actor.update(SLAIN_UPDATE, causedBy("damage"));
	await announceFallenKnight(actor, "slain");
}

/**
 * Flip a coin instead of attacking, as an Ability lets its Knight do: heads the
 * one targeted dies, tails the Knight does, and it's final (p120). Asked once
 * more before it's flipped. Whoever loses dies at once if this user can change
 * them; otherwise the card carries a button for whoever can.
 * @param {Actor} actor The Knight who flips.
 * @param {Item} item Their Ability.
 * @returns {Promise<{heads: boolean, loser: Actor}|null>} Null if it wasn't flipped.
 */
export async function throwToChance(actor, item) {
	const down = downBy(actor.system);
	if (down) {
		warn(`conditions.${down}.down`, { name: actor.name });
		return null;
	}
	const targets = [...game.user.targets].map((token) => token.actor).filter(Boolean);
	if (targets.length !== 1) {
		warn("coinFlip.oneTarget");
		return null;
	}
	const [target] = targets;
	if (!target.system.virtues?.vig || target === actor) {
		warn("coinFlip.noLife", { name: target.name });
		return null;
	}
	const sure = await confirmDialog({
		title: item.name,
		icon: "fa-solid fa-coins",
		message: [t("coinFlip.confirm", { name: actor.name, target: target.name }), t("coinFlip.final")],
		yes: { label: t("coinFlip.flip") }
	});
	if (!sure) return null;
	const roll = await new Roll("1d2").evaluate();
	const heads = roll.total === 1;
	const loser = heads ? target : actor;
	if (loser.isOwner) await slay(loser);
	await postCard(actor, "coin-flip", {
		title: item.name,
		face: t(heads ? "coinFlip.heads" : "coinFlip.tails"),
		outcome: t(heads ? "coinFlip.targetDies" : "coinFlip.selfDies", { name: actor.name, target: target.name }),
		// Somebody this user can't change is killed by whoever can.
		pending: loser.isOwner ? null : { uuid: loser.uuid, label: t("coinFlip.carryOut", { name: loser.name }) }
	}, { rolls: [roll] });
	return { heads, loser };
}

/**
 * Etch the rune at sunset for a number, which gives as many turns of a die
 * showing it until the next sunset, and can't be last night's (p100).
 * @param {Actor} actor
 * @param {Item} item Their Ability.
 * @returns {Promise<number|null>} The number, or null if none was etched.
 */
export async function etchRune(actor, item) {
	// Etched once each sunset: only the Referee changes tonight's, to put a slip right.
	if (Number.isInteger(item.system.sigilNumber) && !game.user.isGM) {
		warn("sigil.untilSunset", { name: actor.name, number: item.system.sigilNumber });
		return null;
	}
	const choices = sigilChoices(item.system.sigilLast);
	const data = await inputDialog({
		title: item.name,
		icon: "fa-solid fa-star",
		template: "sigil-etch",
		context: {
			hint: t("sigil.hint", { name: actor.name }),
			last: Number.isInteger(item.system.sigilLast) ? t("sigil.last", { number: item.system.sigilLast }) : null,
			choices: choices.map((number) => ({ value: number, selected: number === (item.system.sigilNumber ?? choices.at(-1)) }))
		},
		ok: { label: t("sigil.etch"), icon: "fa-solid fa-star" }
	});
	if (!data) return null;
	const number = Number(data.number);
	if (!choices.includes(number)) {
		warn("sigil.notTonight", { number });
		return null;
	}
	await item.update(etchUpdate(number), causedBy("ability"));
	ui.notifications.info(t("sigil.etched", { name: actor.name, number }));
	return number;
}

/**
 * Spend one of an Ability's uses, where it has a limit.
 * @param {Item} item
 * @param {object} [options] For the update, such as what caused it.
 */
export async function spendUse(item, options = {}) {
	if (isCounted(item.system)) await item.update({ "system.quantity.value": countAfter(item.system.quantity, -1) }, options);
}

/**
 * Ask which die showing the rune's number is turned, and to which other of
 * its faces (p100).
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.hint
 * @param {{index: number, faces: number, result: number, label: string}[]} options.dice The dice it may turn.
 * @param {number} options.value The face offered.
 * @returns {Promise<{index: number, value: number}|null>} Null if the window was closed, or the face asked for can't be.
 */
export async function askRuneTurn({ title, hint, dice, value }) {
	const data = await inputDialog({
		title,
		icon: "fa-solid fa-star",
		template: "sigil-turn",
		context: { hint, dice: dice.map(({ index, label }) => ({ index, label })), max: Math.max(...dice.map(({ faces }) => faces)), value },
		ok: { label: t("attack.sigil.turn"), icon: "fa-solid fa-star" }
	});
	if (!data) return null;
	const picked = dice.find(({ index }) => index === Number(data.die)) ?? dice[0];
	const turned = Number(data.value);
	if (!canTurnDie(turned, picked.faces, picked.result)) {
		warn("attack.sigil.badValue", { faces: picked.faces, result: picked.result });
		return null;
	}
	return { index: picked.index, value: turned };
}

/**
 * Offer to turn a Save's d20 that shows the number the rune is etched for, as
 * it's rolled (p100). Closing the window keeps the face; turning it spends one
 * of the rune's turns.
 * @param {Actor} actor
 * @param {Item} item Their Ability.
 * @param {number} face What the d20 shows.
 * @returns {Promise<number|null>} The face it's turned to, or null to keep it.
 */
export async function turnSaveDie(actor, item, face) {
	const turn = await askRuneTurn({
		title: item.name,
		hint: `${t("attack.sigil.turnHint", { name: actor.name, number: face, left: item.system.quantity.value })} ${t("sigil.keepHint")}`,
		dice: [{ index: 0, faces: SIGIL_MAX, result: face, label: t("sigil.saveDie", { face }) }],
		value: face === 1 ? SIGIL_MAX : 1
	});
	if (!turn) return null;
	await spendUse(item, causedBy("ability"));
	return turn.value;
}

/**
 * Lose the Virtue a possession costs its bearer should something befall it,
 * as a banner falling to the ground in battle costs SPI (p62), once asked.
 * Virtue Loss, never Damage (p9).
 * @param {Actor} actor
 * @param {Item} item
 * @returns {Promise<object|null>} What was taken, or null.
 */
export async function sufferLoss(actor, item) {
	const { dice, virtue, when } = item.system.loss ?? {};
	if (!dice || !virtue || !actor.system.virtues?.[virtue]) return null;
	const name = splitName(item.name).nameHead || item.name;
	const abbr = t(`virtues.${virtue}.abbr`);
	const sure = await confirmDialog({
		title: name,
		icon: "fa-solid fa-heart-crack",
		message: t("loss.confirm", { name: escapeHTML(actor.name), dice, virtue: abbr, when: escapeHTML(when || t("loss.befalls", { item: name })) }),
		yes: { label: t("loss.take") }
	});
	if (!sure) return null;
	const { update, taken } = await rollVirtueLosses(actor, [{ name, virtue, dice }]);
	if (!taken.length) return null;
	await actor.update(update, causedBy("hardship"));
	const [{ roll, from, to }] = taken;
	await postCard(actor, "note", { icon: "fa-solid fa-heart-crack", text: t("loss.taken", { name: actor.name, item: name, amount: roll.total, virtue: abbr, from, to }) }, { rolls: [roll] });
	return taken[0];
}

/**
 * Each sunset a rune fades and a new one is etched for another number (p100),
 * so the number and its turns go, and the Knight's owner is told to etch the
 * next. The active GM writes it. Called once the world is ready.
 */
export function watchSunsets() {
	Hooks.on(CALENDAR_HOOK, (_after, _before, turned) => {
		if (!turned.includes("night")) return;
		const writes = [];
		for (const actor of worldKnights()) {
			const updates = abilitiesWith(actor.items.contents, "sigil")
				.map((item) => ({ item, update: fadedUpdate(item.system) }))
				.filter(({ update }) => update);
			if (!updates.length) continue;
			if (game.user === game.users.activeGM) writes.push(actor.updateEmbeddedDocuments("Item", updates.map(({ item, update }) => ({ _id: item.id, ...update }))));
			if (actor.isOwner) ui.notifications.info(t("sigil.faded", { name: actor.name, items: updates.map(({ item }) => item.name).join(", ") }));
		}
		return Promise.all(writes);
	});
}

/**
 * Roll the odds a possession gives, as a bag of tomes holding what's wanted
 * 1 time in 2 (p88), and say on a card how it fell.
 * @param {Actor} actor
 * @param {Item} item
 * @returns {Promise<boolean|null>} Whether it held, or null for a possession without odds.
 */
export async function rollChance(actor, item) {
	const { in: hits, of } = item.system.chance ?? {};
	if (!Number.isInteger(hits) || !Number.isInteger(of) || of < 2) return null;
	const roll = await new Roll(`1d${of}`).evaluate();
	const held = roll.total <= hits;
	const name = splitName(item.name).nameHead || item.name;
	await postCard(actor, "note", {
		icon: held ? "fa-solid fa-circle-check" : "fa-solid fa-circle-xmark",
		text: t(held ? "chance.held" : "chance.missed", { name, in: hits, of, total: roll.total })
	}, { rolls: [roll] });
	return held;
}

/** The world setup step giving Knights made before ABILITY_KITS what their Ability does. */
export const ABILITY_KITS_STEP = "abilityKits";

/**
 * The names of the weapons Abilities give, by key, as knightItems takes them.
 * @returns {Record<string, string>}
 */
export const kitWeaponNames = () => Object.fromEntries(KIT_WEAPON_KEYS.map((key) => [key, t(`abilityKits.${key}`)]));

/**
 * A world setup step. Knights made before their Ability's settings were set
 * from their page get them, where the Ability is still at the defaults, and
 * any weapon it gives that they don't carry yet, such as a bite. A world that
 * hasn't imported the book has no pages to go by.
 * @returns {Promise<void>}
 */
export async function fillAbilityKits() {
	const index = await loadArtIndex().catch(() => null);
	if (!index) return;
	const names = kitWeaponNames();
	for (const actor of game.actors) {
		if (actor.type !== "knight" || !actor.canUserModify(game.user, "update")) continue;
		const entry = knightEntryByType(index, actor.system.knightType);
		const kit = entry?.ability ? kitForPage(entry.page) : null;
		if (!kit) continue;
		const { update, missing } = kitCatchUp(actor.items.contents, kit, entry.ability.name, SYSTEM_ID);
		const weapons = kitWeapons({ weapons: (kit.weapons ?? []).filter(({ key }) => missing.includes(key)) }, (key) => names[key] ?? key, SYSTEM_ID);
		try {
			if (update) await actor.updateEmbeddedDocuments("Item", [update]);
			if (weapons.length) await actor.createEmbeddedDocuments("Item", weapons);
		} catch (error) {
			console.error(`${SYSTEM_ID} | Couldn't set up ${actor.uuid}'s Ability`, error);
		}
	}
}

/** Called during init. */
export function registerAbilityCards() {
	registerCardButtons({
		selector: "[data-coin-slay]",
		handler: async (button) => {
			const loser = await fromUuid(button.dataset.coinSlay);
			if (!loser?.isOwner) return warn("coinFlip.cantCarry", { name: loser?.name ?? "" });
			if (loser.system.slain) return warn("coinFlip.already", { name: loser.name });
			return slay(loser);
		}
	});
}
