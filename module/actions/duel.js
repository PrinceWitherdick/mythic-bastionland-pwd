import { confirmDialog, inputDialog } from "../apps/ui.js";
import { answerBy, askUser } from "../ask-gm.js";
import { attackOf } from "../chat/attack-flag.js";
import { postCard, statefulCard, t, warn } from "../chat/cards.js";
import { queryAsker } from "../compat.js";
import {
	awaitsAttack,
	canStakeGlory,
	changeDuel,
	createDuel,
	DUEL_KINDS,
	duelAsItStands,
	duelistDown,
	duelRefusal,
	opponentOf,
	readyToResolve,
	stakesGlory
} from "../rules/duel.js";
import { escapeHTML } from "../rules/text.js";
import { outOfFight } from "../rules/virtues.js";
import { serverNow } from "../server-now.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

/**
 * Duels & Jousts (p10). A duel card follows two duelists through each
 * exchange: both roll their Attack as normal, then the two are resolved
 * together. With a GM here, the active GM records every change, the card's
 * author's too, so two made at once are both kept.
 */

export const DUEL_QUERY = `${SYSTEM_ID}.changeDuel`;

/** Asks a duelist's player, or the Referee, whether they'll stake Glory on a duel they're challenged to. */
export const STAKE_QUERY = `${SYSTEM_ID}.agreeToStake`;

/** How long the other side has to agree to a stake before the duel goes ahead without one. */
const STAKE_TIMEOUT_MS = 60000;

/** How much sooner the window asking closes itself, so an answer never comes after the challenger stops waiting. */
const STAKE_CLOSE_EARLY_MS = 5000;

/**
 * Whether an Attack card is still in chat: one deleted is no Attack, and its duelist rolls again.
 * @param {string} id
 * @returns {boolean}
 */
const attackCardHere = (id) => Boolean(game.messages?.get(id));

/**
 * @param {import("../rules/duel.js").DuelState|null} duel
 * @returns {import("../rules/duel.js").DuelState|null} The duel as it stands, an Attack card deleted from chat forgotten.
 */
const standing = (duel) => duelAsItStands(duel, attackCardHere);

/**
 * Template data for a duel card at any point.
 * @param {import("../rules/duel.js").DuelState} duel
 */
export function duelCardContext(duel) {
	const [first, second] = duel.duelists;
	const victor = duel.duelists.find((duelist) => duelist.uuid === duel.victor);
	const outcome = duel.closed
		? t(`duel.closed.${duel.closed.reason}`, { name: duel.closed.name })
		: victor ? t("duel.won", { name: victor.name }) : t("duel.endedNoVictor");
	return {
		title: duel.sparring ? t("duel.sparringTitle", { kind: t(`duel.kinds.${duel.kind}.label`) }) : t(`duel.kinds.${duel.kind}.label`),
		tagline: t("duel.versus", { first: first.name, second: second.name }),
		duelists: duel.duelists.map((duelist) => ({
			uuid: duelist.uuid,
			name: duelist.name,
			status: t(duelistDown(duel, duelist.uuid) ? "duel.downStatus" : duelist.attack ? "duel.rolled" : "duel.waiting"),
			wins: t("duel.wins", { name: duelist.name })
		})),
		exchanges: duel.exchanges ? t("duel.exchanges", { count: duel.exchanges }) : null,
		notes: [
			duel.stake && t("duel.stakeNote"),
			// A stake offered and not taken up: the duel goes ahead without one.
			duel.stakeAnswer && t(`duel.stakeDeclined.${duel.stakeAnswer}`, { name: second.name }),
			// Closed for a duelist gone or Slain, nobody won it, so the stake stayed where it was.
			duel.closed && duel.stake && t("duel.stakeUnmoved"),
			// Sparring says all a bloodless bout would, and more.
			duel.sparring ? t("duel.sparringNote") : duel.bloodless && t("duel.bloodlessNote")
		].filter(Boolean),
		// Resolve stays live before both Attacks are in, and says what it waits for.
		resolveHint: readyToResolve(standing(duel)) ? null : t("duel.notReady"),
		ended: duel.ended,
		outcome
	};
}

/**
 * @param {import("../rules/duel.js").DuelState} duel
 * @returns {Promise<string>} The card's HTML.
 */
function renderDuelCard(duel) {
	return foundry.applications.handlebars.renderTemplate(templatePath("chat/duel.hbs"), duelCardContext(duel));
}

/**
 * @param {object} change `{type: "forget", messages}`, the Attack cards a batch deleted.
 * @returns {string[]} Their ids.
 */
const forgottenOf = (change) => (Array.isArray(change?.messages) ? change.messages.filter((id) => typeof id === "string" && id) : []);

/**
 * Forget every Attack card a change names, in the one write, on the duel as written.
 * @param {import("../rules/duel.js").DuelState} duel
 * @param {object} change
 * @returns {import("../rules/duel.js").DuelState|null} Null when it names none the duel holds.
 */
function forgetAttacks(duel, change) {
	const after = forgottenOf(change).reduce((state, message) => changeDuel(state, { type: "forget", message }) ?? state, duel);
	return after === duel ? null : after;
}

// An Attack card since deleted is no Attack, so its duelist may roll another in its place. Forgetting
// one is the change that writes that on the card, so it's made on the duel as written.
const duelCard = statefulCard({
	flag: "duel",
	query: DUEL_QUERY,
	notices: "duel",
	change: (duel, change) => (change?.type === "forget" ? forgetAttacks(duel, change) : changeDuel(standing(duel), change)),
	render: renderDuelCard,
	fits: duelChangeFits
});

/**
 * @param {ChatMessage|undefined} message
 * @returns {import("../rules/duel.js").DuelState|null} The duel on a card, as it stands.
 */
export const duelOf = (message) => standing(duelCard.stateOf(message));

/**
 * @param {ChatMessage|undefined} message
 * @returns {import("../rules/duel.js").DuelState|null} The duel as written on its card, holding
 *   any Attack card since deleted until that's forgotten.
 */
export const writtenDuelOf = duelCard.stateOf;

/**
 * Whether a change fits the duel it's made on: an Attack must be an Attack
 * card the duelist rolled for this duel, and not yet applied, so another card
 * can't be swapped in to land its Damage on the opponent.
 * @param {ChatMessage} message The duel card.
 * @param {object} change See `changeDuel`.
 * @returns {boolean}
 */
function duelChangeFits(message, change) {
	// Only an Attack card that's really gone is forgotten.
	if (change?.type === "forget") {
		const ids = forgottenOf(change);
		return ids.length > 0 && !ids.some((id) => attackCardHere(id));
	}
	if (change?.type !== "attack") return true;
	// The Attack card's state, as attack-card.js keeps it.
	const attack = attackOf(game.messages.get(change.message));
	return Boolean(attack) && attack.attacker === change.actor && attack.duel === message.id && !attack.appliedTo?.length;
}

/**
 * Record a change on a duel card, asking the GM when this user can't.
 * @param {ChatMessage} message
 * @param {object} change See `changeDuel`.
 * @returns {Promise<boolean>}
 */
export const saveDuelChange = duelCard.save;

/**
 * Whether a duelist can still be fought in their duel: not deleted, Slain or
 * otherwise out of the fight, nor knocked down in a sparring bout.
 * @param {import("../rules/duel.js").DuelState} duel
 * @param {import("../rules/duel.js").Duelist} duelist
 * @returns {boolean}
 */
function standsInDuel(duel, duelist) {
	const actor = fromUuidSync(duelist.uuid);
	return Boolean(actor) && !outOfFight(actor.system, { morale: true }) && !duelistDown(duel, duelist.uuid);
}

/**
 * The newest duel still waiting on this actor's Attack. One whose other
 * duelist is gone, Slain or out of the fight, or knocked down sparring, is
 * over in all but name, so it never takes over the survivor's next Attack.
 * @param {Actor} actor
 * @returns {{message: ChatMessage, duel: object, opponent: object}|null}
 */
export function openDuelFor(actor) {
	const messages = game.messages.contents;
	for (let index = messages.length - 1; index >= 0; index--) {
		const duel = duelOf(messages[index]);
		if (!duel || !awaitsAttack(duel, actor.uuid)) continue;
		const opponent = opponentOf(duel, actor.uuid);
		if (standsInDuel(duel, opponent)) return { message: messages[index], duel, opponent };
	}
	return null;
}

/**
 * A sparring bout still going on in which this actor was knocked down: they
 * make no Attack until it ends (p188).
 * @param {Actor} actor
 * @returns {import("../rules/duel.js").DuelState|null}
 */
export function knockedDownIn(actor) {
	for (const message of game.messages ?? []) {
		const duel = duelOf(message);
		if (duelistDown(duel, actor.uuid)) return duel;
	}
	return null;
}

/**
 * The active GM records a change for a player. The card's author may make
 * any change, as their own client does with no GM here. Otherwise an Attack
 * must be the player's own duelist's, and anything else needs them to own
 * both duelists, since they have already applied its Damage or Glory: both
 * still here, that is, as a duelist since deleted is nobody's. An Attack must
 * also be on a card that duelist rolled for this duel, which every commit checks.
 * @type {(data: {messageId?: string, change?: object}, context: {user?: User}) => Promise<boolean>}
 */
export const onDuelQuery = duelCard.answer((change, duel, user, { authored }) => {
	if (authored) return change;
	const owns = (uuid) => Boolean(fromUuidSync(uuid)?.testUserPermission(user, "OWNER"));
	if (change.type === "attack") return owns(change.actor) ? change : null;
	const here = duel.duelists.filter(({ uuid }) => fromUuidSync(uuid));
	return here.length && here.every(({ uuid }) => owns(uuid)) ? change : null;
});

/**
 * What sparring puts back once the duel ends (p188).
 * @param {Actor} actor
 * @returns {import("../rules/duel.js").DuelistScores}
 */
export function duelistScores(actor) {
	const { guard, virtues, wounded } = actor.system;
	return { guard: guard?.value ?? 0, vigour: virtues?.vig.value ?? null, wounded: Boolean(wounded) };
}

/**
 * Keep the Bloodless box ticked while Sparring is, since a bout whose Damage
 * is shaken off leaves no Scar either, and the Stake box unticked and locked,
 * since a practice bout is no contest of Glory. Each goes back to what was
 * chosen as Sparring is unticked.
 * @param {foundry.applications.api.DialogV2} dialog
 */
export function tieTicksToSparring(dialog) {
	const form = dialog.element.querySelector("form");
	const sparring = form?.querySelector("[name='sparring']");
	const bloodless = form?.querySelector("[name='bloodless']");
	if (!sparring || !bloodless) return;
	// A stake that was never open to them stays locked whatever Sparring says.
	const stake = form.querySelector("[name='stake']:not(:disabled)");
	let chosen = bloodless.checked;
	let staked = Boolean(stake?.checked);
	bloodless.addEventListener("change", () => { chosen = bloodless.checked; });
	stake?.addEventListener("change", () => { staked = stake.checked; });
	sparring.addEventListener("change", () => {
		bloodless.checked = sparring.checked || chosen;
		bloodless.disabled = sparring.checked;
		if (!stake) return;
		stake.checked = !sparring.checked && staked;
		stake.disabled = sparring.checked;
	});
}

/**
 * The actor who fights a duel for this one, and their Token: for an NPC
 * sheet opened from the sidebar, the Token in play it stands for, selected
 * first, since an unlinked Token's actor is its own and the one the duel's
 * blows land on.
 * @param {Actor} actor
 * @returns {{actor: Actor, token: TokenDocument|null}}
 */
function duelistInPlay(actor) {
	const tokens = actor.getActiveTokens(false, true);
	if (actor.isToken || actor.prototypeToken?.actorLink !== false) return { actor, token: tokens[0] ?? null };
	const selected = (globalThis.canvas?.tokens?.controlled ?? []).map((token) => token.document).find((token) => tokens.includes(token));
	const token = selected ?? tokens[0] ?? null;
	return { actor: token?.actor ?? actor, token };
}

/**
 * Who answers whether a duelist stakes Glory, which needs a willing opponent
 * (p6): a player who owns them and is here, their own character's player
 * first, or otherwise the Referee, who speaks for the Referee's own and for
 * absent players.
 * @param {Actor} opponent
 * @returns {User|null|undefined} The user to ask; null when whoever challenges
 *   speaks for both sides already; undefined when nobody is here to answer.
 */
export function stakeAnswerer(opponent) {
	const players = game.users.filter((user) => user.active && !user.isGM && opponent.testUserPermission(user, "OWNER"));
	if (players.some((user) => user.isSelf)) return null;
	if (players.length) return players.find((user) => user.character?.id === opponent.id) ?? players[0];
	if (game.user.isGM) return null;
	return game.users.activeGM ?? undefined;
}

/**
 * Ask the other side whether they'll stake Glory on the duel.
 * @param {Actor} opponent
 * @param {{kind: string, challenger: string, opponent: string}} asked The duel's kind,
 *   and both duelists' names as the table sees them.
 * @returns {Promise<boolean|null>} Whether they agreed, or null when nobody answered.
 */
async function agreesToStake(opponent, asked) {
	const answerer = stakeAnswerer(opponent);
	if (answerer === null) return true;
	if (!answerer) return null;
	ui.notifications.info(t("duel.stakeAsking", { name: asked.opponent }));
	const answer = await askUser(answerer, STAKE_QUERY, { uuid: opponent.uuid, ...asked }, `Couldn't ask whether ${asked.opponent} stakes Glory`, { timeout: STAKE_TIMEOUT_MS, fallback: null, dated: true });
	return typeof answer === "boolean" ? answer : null;
}

/**
 * A challenger asks this client whether the duelist it answers for will stake
 * Glory on a duel: yes or no, and closing the window is no. Unanswered, it
 * closes itself before the challenger stops waiting, by the deadline the
 * question carries, rather than take an answer nobody hears.
 * @param {{uuid?: string, kind?: string, challenger?: string, opponent?: string}} data
 * @param {object} context
 * @returns {Promise<boolean|null>} Null when it closed itself unanswered.
 */
export async function onStakeQuery(data = {}, context = {}) {
	// A question that doesn't say when the challenger stops waiting is taken as just asked.
	const closeBy = (answerBy(data) ?? serverNow() + STAKE_TIMEOUT_MS) - STAKE_CLOSE_EARLY_MS;
	const asker = queryAsker(context);
	const opponent = typeof data?.uuid === "string" ? fromUuidSync(data.uuid) : null;
	if (!asker || !opponent?.testUserPermission?.(game.user, "OWNER")) return false;
	const kind = DUEL_KINDS.includes(data.kind) ? data.kind : DUEL_KINDS[0];
	const name = (value, fallback) => escapeHTML(typeof value === "string" && value ? value : fallback);
	return confirmDialog({
		title: t("duel.stakeAsk.title"),
		icon: "fa-solid fa-crown",
		message: [
			t("duel.stakeAsk.message", { challenger: name(data.challenger, asker.name), opponent: name(data.opponent, opponent.name), kind: t(`duel.kinds.${kind}.label`) }),
			t("duel.stakeAsk.terms")
		],
		yes: { label: t("duel.stakeAsk.agree") },
		no: { label: t("duel.stakeAsk.refuse") },
		closeBy
	});
}

/**
 * Two combatants agree to a duel: the actor, and the one Token this user
 * targets. It opens on a plain duel, whether either is mounted or not, since
 * a joust is the rarer of the two and is asked for when it's meant. Posts the
 * duel card that follows them. Glory staked needs the other side to agree,
 * and without that the duel goes ahead with nothing staked.
 * @param {Actor} sheetActor The actor whose sheet it's asked from.
 * @returns {Promise<ChatMessage|null>}
 */
export async function challengeToDuel(sheetActor) {
	const { actor, token: own } = duelistInPlay(sheetActor);
	const targets = [...game.user.targets].filter((token) => token.actor && token.actor.uuid !== actor.uuid);
	if (targets.length !== 1) {
		warn("duel.needTarget");
		return null;
	}
	const [target] = targets;
	const opponent = target.actor;
	const names = { challenger: own?.name ?? actor.name, opponent: target.document.name };
	// A duel is between two combatants (p10), which no Warband or structure is, nor anybody Slain or dying (p8).
	for (const [who, name] of [[actor, names.challenger], [opponent, names.opponent]]) {
		const refusal = duelRefusal(who);
		if (refusal) {
			warn(`duel.refused.${refusal}`, { name });
			return null;
		}
	}
	const sides = [actor, opponent].map(({ type, system }) => ({ type, isSquire: Boolean(system.isSquire) }));
	const stakeable = canStakeGlory(sides);

	const data = await inputDialog({
		title: t("duel.title"),
		icon: "fa-solid fa-hand-fist",
		template: "duel",
		context: {
			intro: t("duel.intro", { name: names.challenger, opponent: names.opponent }),
			kinds: DUEL_KINDS.map((key) => ({ key, label: t(`duel.kinds.${key}.label`), hint: t(`duel.kinds.${key}.hint`), selected: key === DUEL_KINDS[0] })),
			stakeLocked: !stakeable,
			stakeHint: t(stakeable ? "duel.stakeHint" : "duel.stakeKnightsOnly")
		},
		ok: { label: t("duel.start") },
		render: (_event, dialog) => tieTicksToSparring(dialog)
	});
	if (!data) return null;

	const sparring = Boolean(data.sparring);
	const kind = DUEL_KINDS.includes(data.kind) ? data.kind : DUEL_KINDS[0];
	// Sparring stakes nothing (createDuel holds to that too), and a stake needs a willing opponent (p6).
	let stake = stakeable && Boolean(data.stake) && !sparring;
	let stakeAnswer = null;
	if (stake) {
		const agreed = await agreesToStake(opponent, { kind, ...names });
		if (agreed !== true) {
			stake = false;
			stakeAnswer = agreed === false ? "refused" : "unanswered";
		}
	}
	const duel = createDuel({
		kind,
		stake,
		stakeAnswer,
		bloodless: Boolean(data.bloodless),
		sparring,
		duelists: [
			{ uuid: actor.uuid, name: names.challenger, token: own?.uuid ?? null, scores: duelistScores(actor), knight: stakesGlory(sides[0]) },
			{ uuid: opponent.uuid, name: names.opponent, token: target.document.uuid, scores: duelistScores(opponent), knight: stakesGlory(sides[1]) }
		]
	});
	if (!duel) return null;
	return postCard(actor, "duel", duelCardContext(duel), { flags: { [SYSTEM_ID]: { duel } } });
}
