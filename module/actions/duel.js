import { inputDialog } from "../apps/ui.js";
import { postCard, statefulCard, t, warn } from "../chat/cards.js";
import { DUEL_KINDS, awaitsAttack, canStakeGlory, changeDuel, createDuel, opponentOf, readyToResolve } from "../rules/duel.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

/**
 * Duels & Jousts (p10). A duel card follows two duelists through each
 * exchange: both roll their Attack as normal, then the two are resolved
 * together. Only a message's author and GMs can update it, so a duelist who
 * doesn't own the card asks the active GM to record their Attack.
 */

export const DUEL_QUERY = `${SYSTEM_ID}.changeDuel`;

/**
 * Template data for a duel card at any point.
 * @param {import("../rules/duel.js").DuelState} duel
 */
export function duelCardContext(duel) {
	const [first, second] = duel.duelists;
	const victor = duel.duelists.find((duelist) => duelist.uuid === duel.victor);
	return {
		title: t(`duel.kinds.${duel.kind}.label`),
		tagline: t("duel.versus", { first: first.name, second: second.name }),
		duelists: duel.duelists.map((duelist) => ({
			uuid: duelist.uuid,
			name: duelist.name,
			status: t(duelist.attack ? "duel.rolled" : "duel.waiting"),
			wins: t("duel.wins", { name: duelist.name })
		})),
		exchanges: duel.exchanges ? t("duel.exchanges", { count: duel.exchanges }) : null,
		notes: [duel.stake && t("duel.stakeNote"), duel.bloodless && t("duel.bloodlessNote")].filter(Boolean),
		resolveLocked: !readyToResolve(duel),
		ended: duel.ended,
		outcome: victor ? t("duel.won", { name: victor.name }) : t("duel.endedNoVictor")
	};
}

/**
 * @param {import("../rules/duel.js").DuelState} duel
 * @returns {Promise<string>} The card's HTML.
 */
function renderDuelCard(duel) {
	return foundry.applications.handlebars.renderTemplate(templatePath("chat/duel.hbs"), duelCardContext(duel));
}

const duelCard = statefulCard({ flag: "duel", query: DUEL_QUERY, notices: "duel", change: changeDuel, render: renderDuelCard });

/**
 * @param {ChatMessage|undefined} message
 * @returns {import("../rules/duel.js").DuelState|null}
 */
export const duelOf = duelCard.stateOf;

/**
 * Record a change on a duel card, asking the GM when this user can't.
 * @param {ChatMessage} message
 * @param {object} change See `changeDuel`.
 * @returns {Promise<boolean>}
 */
export const saveDuelChange = duelCard.save;

/**
 * The newest duel still waiting on this actor's Attack.
 * @param {Actor} actor
 * @returns {{message: ChatMessage, duel: object, opponent: object}|null}
 */
export function openDuelFor(actor) {
	const messages = game.messages.contents;
	for (let index = messages.length - 1; index >= 0; index--) {
		const duel = duelOf(messages[index]);
		if (duel && awaitsAttack(duel, actor.uuid)) return { message: messages[index], duel, opponent: opponentOf(duel, actor.uuid) };
	}
	return null;
}

/**
 * The active GM records a change for a player. An Attack must be the
 * player's own duelist's, and anything else needs them to own both duelists,
 * since they have already applied its Damage or Glory.
 * @param {{messageId: string, change: object}} data
 * @param {{user: User}} context
 * @returns {Promise<boolean>}
 */
export async function onDuelQuery({ messageId, change }, { user }) {
	const message = game.messages.get(messageId);
	const duel = duelOf(message);
	if (!duel) return false;
	const owns = (uuid) => Boolean(fromUuidSync(uuid)?.testUserPermission(user, "OWNER"));
	const allowed = change?.type === "attack" ? owns(change.actor) : duel.duelists.every(({ uuid }) => owns(uuid));
	return allowed ? duelCard.commit(message, change) : false;
}

/**
 * Two combatants agree to a duel, or a joust if mounted: the actor, and the
 * one Token this user targets. Posts the duel card that follows them.
 * @param {Actor} actor
 * @returns {Promise<ChatMessage|null>}
 */
export async function challengeToDuel(actor) {
	const targets = [...game.user.targets].filter((token) => token.actor && token.actor.uuid !== actor.uuid);
	if (targets.length !== 1) {
		warn("duel.needTarget");
		return null;
	}
	const [target] = targets;
	const opponent = target.actor;
	const stakeable = canStakeGlory([actor, opponent].map(({ type, system }) => ({ type, isSquire: Boolean(system.isSquire) })));
	const joust = Boolean(actor.system.steed);

	const data = await inputDialog({
		title: t("duel.title"),
		icon: "fa-solid fa-hand-fist",
		template: "duel",
		context: {
			intro: t("duel.intro", { name: actor.name, opponent: target.document.name }),
			kinds: DUEL_KINDS.map((key) => ({ key, label: t(`duel.kinds.${key}.label`), hint: t(`duel.kinds.${key}.hint`), selected: (key === "joust") === joust })),
			stakeLocked: !stakeable,
			stakeHint: t(stakeable ? "duel.stakeHint" : "duel.stakeKnightsOnly")
		},
		ok: { label: t("duel.start") }
	});
	if (!data) return null;

	const own = actor.getActiveTokens(false, true)[0] ?? null;
	const duel = createDuel({
		kind: data.kind,
		stake: stakeable && Boolean(data.stake),
		bloodless: Boolean(data.bloodless),
		duelists: [
			{ uuid: actor.uuid, name: own?.name ?? actor.name, token: own?.uuid ?? null },
			{ uuid: opponent.uuid, name: target.document.name, token: target.document.uuid }
		]
	});
	if (!duel) return null;
	return postCard(actor, "duel", duelCardContext(duel), { flags: { [SYSTEM_ID]: { duel } } });
}
