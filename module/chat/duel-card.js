import { takeAttack } from "../actions/damage.js";
import { DUEL_QUERY, duelistScores, duelOf, onDuelQuery, saveDuelChange } from "../actions/duel.js";
import { CALENDAR_HOOK } from "../actions/calendar.js";
import { adjustGlory } from "../actions/glory.js";
import { causedBy } from "../actions/ledger.js";
import { confirmDialog } from "../apps/ui.js";
import { readyToResolve, shakenOff, sparringOpen, stakeChanges } from "../rules/duel.js";
import { escapeHTML } from "../rules/text.js";
import { attackOf, saveChange as saveAttackChange } from "./attack-card.js";
import { onCardClick, postCard, t, warn } from "./cards.js";

/**
 * @param {import("../rules/duel.js").DuelState} duel
 * @returns {Actor[]|null} Both duelists, or null once either is gone.
 */
function duelistActors(duel) {
	const actors = duel.duelists.map(({ uuid }) => fromUuidSync(uuid));
	return actors.every(Boolean) ? actors : null;
}

/**
 * Resolve both Attacks of an exchange at once. Each Attack is read before
 * either lands, so neither changes the other, and Gambits and Feats on both
 * cards count. An Attack already applied, because a dialog was closed part
 * way, isn't applied again when this is pressed a second time.
 * @param {ChatMessage} message
 */
async function onResolve(message) {
	const duel = duelOf(message);
	if (!readyToResolve(duel)) return warn("duel.notReady");
	const actors = duelistActors(duel);
	if (!actors) return warn("duel.gone");
	if (!actors.every((actor) => actor.isOwner)) return warn("duel.cantResolve");
	const cards = duel.duelists.map(({ attack }) => game.messages.get(attack));
	if (!cards.every(attackOf)) return warn("duel.attackGone");

	const blows = cards.map((card, index) => ({ card, attack: attackOf(card), target: actors[1 - index] }));
	for (const { card, attack, target } of blows) {
		if (attack.appliedTo.length) continue;
		// Only a real fight to the death gives Scars (p9), and sparring's Damage is
		// shaken off afterwards (p188). Both cards' Gambits land together, so neither's Trap
		// holds a shield against the other's blow.
		const result = await takeAttack(target, attack, { scars: !duel.bloodless, except: cards.map((each) => each.id), sparring: Boolean(duel.sparring) });
		if (!result) continue;
		if (duel.bloodless && result.outcome === "scar") {
			await postCard(target, "note", { icon: "fa-solid fa-hand-fist", text: t("duel.noScar", { name: target.name }) });
		}
		await saveAttackChange(card, { type: "applied", names: [target.name] });
	}

	if (cards.every((card) => attackOf(card)?.appliedTo.length)) await saveDuelChange(message, { type: "resolved" });
}

/**
 * End the duel with a victor, or none, moving any Glory staked on it.
 * @param {ChatMessage} message
 * @param {string} victorUuid Blank for no victor.
 */
async function onEnd(message, victorUuid) {
	const duel = duelOf(message);
	if (duel.ended) return;
	const actors = duelistActors(duel);
	if (!actors) return warn("duel.gone");
	if (!actors.every((actor) => actor.isOwner)) return warn("duel.cantEnd");

	const victor = duel.duelists.find(({ uuid }) => uuid === victorUuid) ?? null;
	const outcome = victor ? t("duel.won", { name: victor.name }) : t("duel.endedNoVictor");
	const confirmed = await confirmDialog({
		title: t("duel.endConfirmTitle"),
		icon: "fa-solid fa-crown",
		message: t("duel.endConfirm", { outcome: escapeHTML(outcome) })
	});
	if (!confirmed) return;

	// The duel ends first, so a refused or repeated end never moves the Glory twice.
	if (!(await saveDuelChange(message, { type: "end", victor: victor?.uuid ?? null }))) return;
	const entries = await Promise.all(stakeChanges(duel, victor?.uuid ?? null).map(async ({ uuid, amount }) => {
		const actor = actors[duel.duelists.findIndex((duelist) => duelist.uuid === uuid)];
		return { name: actor.name, lines: await adjustGlory(actor, amount) };
	}));
	if (entries.length) await postCard(null, "report", { title: t("duel.endTitle"), tagline: outcome, entries });
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
	for (const { uuid, from, to } of changes) {
		const actor = actors[duel.duelists.findIndex((duelist) => duelist.uuid === uuid)];
		const update = { "system.guard.value": to.guard, "system.wounded": to.wounded };
		if (to.vigour !== null) update["system.virtues.vig.value"] = to.vigour;
		await actor.update(update, causedBy("recovery"));
		const lines = [
			to.guard !== from.guard && t("duel.shaken.guard", { from: from.guard, to: to.guard }),
			to.vigour !== from.vigour && t("duel.shaken.vigour", { from: from.vigour, to: to.vigour }),
			to.wounded !== from.wounded && t("duel.shaken.wound")
		].filter(Boolean);
		entries.push({ name: actor.name, lines });
	}
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
const closing = new Set();

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
		if (!sparringOpen(duel, among) || closing.has(message.id)) continue;
		closing.add(message.id);
		try {
			if (!(await saveDuelChange(message, { type: "end", victor: null }))) continue;
			await shakeOff(duel, duel.duelists.map(({ uuid }) => fromUuidSync(uuid)), reason, { quiet: true });
			closed.push(message);
		} finally {
			closing.delete(message.id);
		}
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

/** Called during init. */
export function registerDuelCards() {
	CONFIG.queries[DUEL_QUERY] = onDuelQuery;
	Hooks.on("renderChatMessageHTML", activateDuelCard);
	// Foundry's End Combat deletes it.
	Hooks.on("deleteCombat", onCombatGone);
	// Next Phase, or any time passing: the bout is long over, and GD comes back with a moment's peace (p9).
	Hooks.on(CALENDAR_HOOK, () => shakeOffOpenSparring(null, t("duel.shaken.timePassed")));
}
