import { landMirrors, takeAttack } from "../actions/damage.js";
import { DUEL_QUERY, STAKE_QUERY, duelistScores, duelOf, onDuelQuery, onStakeQuery, saveDuelChange, writtenDuelOf } from "../actions/duel.js";
import { onCalendarWrites } from "../actions/calendar.js";
import { adjustGlory } from "../actions/glory.js";
import { updateActors } from "../actions/actor-updates.js";
import { causedBy } from "../actions/ledger.js";
import { timelineDuel } from "../actions/timeline-events.js";
import { confirmDialog } from "../apps/ui.js";
import { readyToResolve, shakenOff, sparringOpen, stakeChanges } from "../rules/duel.js";
import { escapeHTML } from "../rules/text.js";
import { oncePerKey } from "../rules/queue.js";
import { attackOf, confirmApply, saveChange as saveAttackChange } from "./attack-card.js";
import { onCardClick, postCard, t, warn } from "./cards.js";
import { registerQuery } from "../queries.js";

/**
 * @param {import("../rules/duel.js").DuelState} duel
 * @returns {(Actor|null)[]} Both duelists, in the duel's order, each null once gone.
 */
const duelistActors = (duel) => duel.duelists.map(({ uuid }) => fromUuidSync(uuid) ?? null);

/** Duel cards whose two Attacks this client is resolving now. */
const resolving = oncePerKey();

/**
 * Resolve both Attacks of an exchange at once. A second press while the first
 * is still at work, as from the chat log and a popped-out card, does nothing.
 * @param {ChatMessage} message
 */
function onResolve(message) {
	return resolving(message.id, () => resolveBoth(message), () => warn("cardButtons.alreadyPressed"));
}

/**
 * Resolve both Attacks of an exchange. Gambits and Feats on both cards count,
 * and each card is read again as its blow lands, so a Deny made while a
 * window stood open counts, and a blow applied meanwhile, or by a press made
 * before a dialog was closed part way, isn't applied twice. A sparring
 * duelist taken to a Mortal Wound is knocked down, and out of the bout (p188).
 * @param {ChatMessage} message
 */
async function resolveBoth(message) {
	const duel = duelOf(message);
	if (!readyToResolve(duel)) return warn("duel.notReady");
	const actors = duelistActors(duel);
	if (!actors.every(Boolean)) return warn("duel.gone");
	if (!actors.every((actor) => actor.isOwner)) return warn("duel.cantResolve");
	const cards = duel.duelists.map(({ attack }) => game.messages.get(attack));
	if (!cards.every(attackOf)) return warn("duel.attackGone");

	const blows = cards.map((card, index) => ({ card, target: actors[1 - index] }));
	// Unspent dice, a Deny still to make and Saves still to roll are said first, as Apply does on one card.
	const waiting = blows.map(({ card, target }) => ({ attack: attackOf(card), actors: [target] })).filter(({ attack }) => !attack.appliedTo.length);
	if (!(await confirmApply(waiting))) return;
	// A Wound or Scar given back lands once both blows have, so it can't weigh on the other blow.
	const mirrors = [];
	for (const { card, target } of blows) {
		// As the card stands now, after whatever the windows before this blow waited on.
		const attack = attackOf(card);
		if (!attack || attack.appliedTo.length) continue;
		// Only a real fight to the death gives Scars (p9), and sparring's Damage is
		// shaken off afterwards (p188). Both cards' Gambits land together, so neither's Trap
		// holds a shield against the other's blow.
		const result = await takeAttack(target, attack, { scars: !duel.bloodless, except: cards.map((each) => each.id), sparring: Boolean(duel.sparring), mirrors });
		if (!result) continue;
		if (duel.bloodless && result.outcome === "scar") {
			await postCard(target, "note", { icon: "fa-solid fa-hand-fist", text: t("duel.noScar", { name: target.name }) });
		}
		await saveAttackChange(card, { type: "applied", names: [target.name], tokens: (attack.targets ?? []).map(({ uuid }) => uuid) });
		// Sparring leaves nobody dying, but whoever it would have is down for the rest of the bout.
		if (duel.sparring && result.outcome === "mortal" && !target.system.fightsOn) await saveDuelChange(message, { type: "down", actor: target.uuid });
	}
	await landMirrors(mirrors);

	if (cards.every((card) => attackOf(card)?.appliedTo.length)) await saveDuelChange(message, { type: "resolved" });
}

/**
 * End the duel with a victor, or none, moving any Glory staked on it. A
 * duelist since deleted doesn't keep it from ending: the one still here may
 * be its victor, and only their Glory moves.
 * @param {ChatMessage} message
 * @param {string} victorUuid Blank for no victor.
 */
async function onEnd(message, victorUuid) {
	const duel = duelOf(message);
	if (duel.ended) return;
	const actors = duelistActors(duel);
	const here = actors.filter(Boolean);
	if (!here.length) return warn("duel.gone");
	if (!here.every((actor) => actor.isOwner)) return warn("duel.cantEnd");

	const victor = duel.duelists.find(({ uuid }) => uuid === victorUuid) ?? null;
	if (victor && !actors[duel.duelists.indexOf(victor)]) return warn("duel.gone");
	const outcome = victor ? t("duel.won", { name: victor.name }) : t("duel.endedNoVictor");
	const confirmed = await confirmDialog({
		title: t("duel.endConfirmTitle"),
		icon: "fa-solid fa-crown",
		message: t("duel.endConfirm", { outcome: escapeHTML(outcome) })
	});
	if (!confirmed) return;

	// The duel ends first, so a refused or repeated end never moves the Glory twice.
	if (!(await saveDuelChange(message, { type: "end", victor: victor?.uuid ?? null }))) return;
	const glory = {};
	const actorOf = (uuid) => actors[duel.duelists.findIndex((duelist) => duelist.uuid === uuid)];
	// Only a Knight's Glory moves, and nobody's who's since been deleted.
	const moves = stakeChanges(duel, victor?.uuid ?? null).filter(({ uuid }) => actorOf(uuid));
	const entries = await Promise.all(moves.map(async ({ uuid, amount }) => {
		const actor = actorOf(uuid);
		glory[uuid] = await adjustGlory(actor, amount);
		return { name: actor.name, lines: glory[uuid] };
	}));
	await Promise.all([
		timelineDuel(message.id, duel, actors, victor?.uuid ?? null, glory),
		entries.length ? postCard(null, "report", { title: t("duel.endTitle"), tagline: outcome, entries }) : null
	]);
	if (duel.sparring) await shakeOff(duel, actors, outcome);
}

/**
 * Put back what a sparring bout cost each duelist (p188): the GD and VIG they
 * lost since it began, and a Wound, all shaken off. One card says what came back.
 * @param {import("../rules/duel.js").DuelState} duel
 * @param {Actor[]} actors Both duelists, in the duel's order.
 * @param {string} outcome How the duel ended, as the card's tagline.
 * @param {object} [options]
 * @param {boolean} [options.quiet] Post nothing when there's nothing to put back, as for a bout closed by itself.
 */
async function shakeOff(duel, actors, outcome, { quiet = false } = {}) {
	// A duelist since deleted has nothing left to put back.
	const now = Object.fromEntries(duel.duelists.flatMap(({ uuid }, index) => (actors[index] ? [[uuid, duelistScores(actors[index])]] : [])));
	const changes = shakenOff(duel, now);
	if (quiet && !changes.length) return;
	const entries = [];
	const updates = [];
	for (const { uuid, from, to } of changes) {
		const actor = actors[duel.duelists.findIndex((duelist) => duelist.uuid === uuid)];
		const update = { "system.guard.value": to.guard, "system.wounded": to.wounded };
		if (to.vigour !== null) update["system.virtues.vig.value"] = to.vigour;
		updates.push([actor, update]);
		const lines = [
			to.guard !== from.guard && t("duel.shaken.guard", { from: from.guard, to: to.guard }),
			to.vigour !== from.vigour && t("duel.shaken.vigour", { from: from.vigour, to: to.vigour }),
			to.wounded !== from.wounded && t("duel.shaken.wound")
		].filter(Boolean);
		entries.push({ name: actor.name, lines });
	}
	// Both duelists in one write.
	await updateActors(updates, causedBy("recovery"));
	await postCard(null, "report", {
		title: t("duel.shaken.title"),
		tagline: outcome,
		entries,
		hint: entries.length ? null : t("duel.shaken.nothing")
	});
}

/**
 * Wire up a duel card's buttons as it renders.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
function activateDuelCard(message, html) {
	const card = html.querySelector(".bastionland-card--duel");
	if (!duelOf(message) || !card) return;

	onCardClick(card, "[data-duel-action]", async (button) => {
		if (button.dataset.duelAction === "resolve") await onResolve(message);
		else if (button.dataset.duelAction === "end") await onEnd(message, button.dataset.victor ?? "");
	});
}

/** Duel cards this client is closing now, so two hooks at once never shake one off twice. */
const closing = oncePerKey();

/**
 * Close every sparring bout still open that `among` takes in, and shake it
 * off: its Damage is shaken off afterwards, with no need for a victor (p188).
 * Ending the card first means none is ever put back twice, and no Glory
 * moves, since only a victor's button settles a stake. The active GM does it.
 * @param {Set<string>|null} among Actor UUIDs, one of whom must be a duelist. Null for every bout.
 * @param {string} reason Why the bout is over, as the Shaken Off card's tagline.
 * @returns {Promise<ChatMessage[]>} The duel cards closed.
 */
export async function shakeOffOpenSparring(among, reason) {
	if (!game.users.activeGM?.isSelf) return [];
	const closed = [];
	for (const message of game.messages ?? []) {
		const duel = duelOf(message);
		if (!sparringOpen(duel, among)) continue;
		await closing(message.id, async () => {
			if (!(await saveDuelChange(message, { type: "end", victor: null }))) return;
			await shakeOff(duel, duel.duelists.map(({ uuid }) => fromUuidSync(uuid)), reason, { quiet: true });
			closed.push(message);
		});
	}
	return closed;
}

/**
 * A Combat ended or deleted: whoever fought in it is done sparring.
 * @param {Combat} combat
 */
function onCombatGone(combat) {
	const among = new Set([...(combat?.combatants ?? [])].map((combatant) => combatant.actor?.uuid).filter(Boolean));
	if (among.size) return shakeOffOpenSparring(among, t("duel.shaken.combatEnded"));
}

/**
 * Close every duel still open, sparring aside, that a duelist has left for
 * good: deleted, as an unlinked Token is with its actor, or Slain. The card
 * says who and why. Nobody pressed a victor's button, so no Glory staked on
 * it moves: the Referee gives any that should by hand. The active GM does it.
 * Sparring is left to close as it does, shaken off.
 * @returns {Promise<ChatMessage[]>} The duel cards closed.
 */
export async function closeFallenDuels() {
	if (!game.users.activeGM?.isSelf) return [];
	const closed = [];
	for (const message of game.messages ?? []) {
		const duel = duelOf(message);
		if (!duel || duel.ended || duel.sparring) continue;
		const fallen = duel.duelists.map((duelist) => ({ duelist, actor: fromUuidSync(duelist.uuid) })).find(({ actor }) => !actor || actor.system?.slain);
		if (!fallen) continue;
		const closedBy = { name: fallen.duelist.name, reason: fallen.actor ? "slain" : "gone" };
		await closing(message.id, async () => {
			if (await saveDuelChange(message, { type: "end", victor: null, closed: closedBy })) closed.push(message);
		});
	}
	return closed;
}

/** The look for fallen duelists already asked for, which every deletion until it starts shares. */
let fallenScan = null;

/**
 * Close the duels a duelist has left, once for a whole batch: deleting a
 * Scene's Tokens calls the hook for each, all before the scan begins.
 * @returns {Promise<ChatMessage[]>}
 */
function closeFallenDuelsSoon() {
	fallenScan ??= Promise.resolve().then(() => {
		fallenScan = null;
		return closeFallenDuels();
	});
	return fallenScan;
}

/**
 * An Attack card was deleted: a duel waiting on it forgets it, so its duelist
 * can roll again and the exchange isn't left jammed. The active GM does it.
 * @param {ChatMessage} deleted
 */
async function forgetDeletedAttack(deleted) {
	if (!game.users.activeGM?.isSelf || !deleted?.id) return;
	for (const message of game.messages ?? []) {
		// As written: as it stands, the card's already gone from it.
		const duel = writtenDuelOf(message);
		if (duel && !duel.ended && duel.duelists.some(({ attack }) => attack === deleted.id)) await saveDuelChange(message, { type: "forget", message: deleted.id });
	}
}

/** Called during init. */
export function registerDuelCards() {
	registerQuery(DUEL_QUERY, onDuelQuery);
	registerQuery(STAKE_QUERY, onStakeQuery);
	Hooks.on("renderChatMessageHTML", activateDuelCard);
	Hooks.on("deleteChatMessage", forgetDeletedAttack);
	// A duelist deleted, an unlinked Token with its actor, or Slain: the duel is over.
	Hooks.on("deleteActor", () => closeFallenDuelsSoon());
	Hooks.on("deleteToken", () => closeFallenDuelsSoon());
	Hooks.on("updateActor", (_actor, changed) => (changed?.system?.slain === true ? closeFallenDuelsSoon() : undefined));
	// Foundry's End Combat deletes it.
	Hooks.on("deleteCombat", onCombatGone);
	// Next Phase, or any time passing: the bout is long over, and GD comes back with a moment's peace (p9).
	// Time turned back, as an Undo does, ends no bout: the Undo puts back those the advance ended.
	onCalendarWrites((_after, _before, turned) => {
		if (!turned?.includes("phase")) return;
		return shakeOffOpenSparring(null, t("duel.shaken.timePassed"));
	});
}
