import { takeAttack } from "../actions/damage.js";
import { DUEL_QUERY, duelOf, onDuelQuery, saveDuelChange } from "../actions/duel.js";
import { adjustGlory } from "../actions/glory.js";
import { confirmDialog } from "../apps/ui.js";
import { readyToResolve, stakeChanges } from "../rules/duel.js";
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
		// Scars are only gained through real, deadly combat (p9). Both cards' Gambits land
		// together, so neither's Trap holds a shield against the other's blow.
		const result = await takeAttack(target, attack, { scars: !duel.bloodless, except: cards.map((each) => each.id) });
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

/** Called during init. */
export function registerDuelCards() {
	CONFIG.queries[DUEL_QUERY] = onDuelQuery;
	Hooks.on("renderChatMessageHTML", activateDuelCard);
}
