import { askPackGroups, joinPack, packRolled, packShown, renderPackCard, rollPack, spendAttack } from "../actions/attack.js";
import { chooseActor } from "../apps/actor-pick.js";
import { confirmDialog } from "../apps/ui.js";
import { askActiveGM } from "../ask-gm.js";
import { queryAsker } from "../compat.js";
import { PACK_FLAG, canJoinPack, changePack, packAttackers, unspentShares } from "../rules/pack.js";
import { SYSTEM_ID } from "../system-id.js";
import { joinersFor } from "./attack-card.js";
import { keepsRolls, onCardClick, ownedBy, statefulCard, t, warn } from "./cards.js";
import { registerQuery } from "../queries.js";
import { serverNow } from "../server-now.js";

/**
 * Pack cards hold an Attack before it's rolled, since everybody attacking the
 * same target rolls at the same time (p8). Allies bring their dice unrolled
 * through their own Attack dialog; whoever gathered it then rolls them all at
 * once into an ordinary Attack card, joining any into bigger dice first where
 * somebody's Ability does (p56). What each attacker uses up is spent only once
 * it's rolled, so a Pack called off spends nothing but a Smite already made.
 */

const CHANGE_QUERY = `${SYSTEM_ID}.changePack`;
const SPEND_QUERY = `${SYSTEM_ID}.spendPack`;

/**
 * How long a Pack may stand closed for a roll with no Attack card before its
 * Open Again shows: past any dice animation, so it never shows mid-roll.
 */
const STALL_MS = 30_000;

/**
 * A change only whoever plays the one who gathered it may ask for.
 * @param {(change: object) => object} pick What of the change to record.
 * @returns {(change: object, pack: import("../rules/pack.js").PackState, user: User) => object|null}
 */
const byGatherer = (pick) => (change, pack, user) => (ownedBy(pack.attacker, user) ? pick(change) : null);

/**
 * Changes a user may ask the active GM to record: a joiner they own brings
 * their dice, whoever plays the one who gathered it rolls, reopens or calls it
 * off, and each attacker's own spending is marked done by whoever plays them.
 * @type {Record<string, (change: object, pack: import("../rules/pack.js").PackState, user: User) => object|null>}
 */
const CHANGE_GUARDS = Object.freeze({
	join: (change, pack, user) => {
		const joiner = ownedBy(change.actor, user);
		return joiner && canJoinPack(pack) ? { ...change, name: joiner.name } : null;
	},
	roll: byGatherer((change) => ({ type: "roll", shares: change.shares, at: change.at })),
	posted: byGatherer((change) => ({ type: "posted", message: change.message })),
	reopen: byGatherer(() => ({ type: "reopen" })),
	callOff: byGatherer(() => ({ type: "callOff" })),
	spent: (change, pack, user) => (ownedBy(pack.shares[change.share]?.actor, user) ? { type: "spent", share: change.share } : null)
});

const packCard = statefulCard({
	flag: PACK_FLAG,
	query: CHANGE_QUERY,
	notices: "attack.pack",
	change: changePack,
	render: renderPackCard,
	// Which Attack card it was rolled into, and whose spending is done, aren't drawn.
	shows: packShown,
	queryable: (change) => Object.hasOwn(CHANGE_GUARDS, change.type),
	// A joiner's Smite Save, kept beside the first's own so it has a tooltip too.
	alsoUpdate: keepsRolls(["join"])
});

const onChangeQuery = packCard.answer((change, pack, user) => (Object.hasOwn(CHANGE_GUARDS, change.type) ? CHANGE_GUARDS[change.type](change, pack, user) : null));

/**
 * @param {ChatMessage|undefined} message
 * @returns {import("../rules/pack.js").PackState|null}
 */
const packOf = packCard.stateOf;

/**
 * @param {ChatMessage} message
 * @returns {import("../rules/pack.js").PackState|null} The card's state as it stands now, not as it was drawn.
 */
const packNow = (message) => packOf(game.messages?.get(message.id) ?? message);

/**
 * @param {import("../rules/pack.js").PackState} pack
 * @returns {Actor[]} Those it's aimed at.
 */
const struckBy = (pack) => pack.targets.map(({ uuid }) => fromUuidSync(uuid)?.actor).filter(Boolean);

/**
 * Another combatant brings their dice, unrolled: their own Attack dialog,
 * aimed at the card's targets (p8).
 * @param {ChatMessage} message
 */
async function onJoin(message) {
	const pack = packOf(message);
	if (!canJoinPack(pack)) return warn("attack.pack.closed");
	const candidates = joinersFor(packAttackers(pack), struckBy(pack));
	if (!candidates.length) return warn("attack.noJoiner");
	const joiner = await chooseActor(candidates, { title: t("attack.join"), message: t("attack.whoJoins"), icon: "fa-solid fa-user-plus" });
	if (!joiner) return;
	const joined = await joinPack(joiner, pack);
	if (!joined) return;
	// It may have been rolled or called off while the dialog stood open.
	if (!canJoinPack(packNow(message))) return warn("attack.pack.closed");
	if (await packCard.save(message, joined.change)) await joined.settle();
}

/**
 * The one who gathered it, if this user plays them; a warning otherwise.
 * @param {import("../rules/pack.js").PackState} pack
 * @returns {Actor|null}
 */
function gatherer(pack) {
	const actor = fromUuidSync(pack.attacker);
	if (actor?.isOwner) return actor;
	warn("attack.pack.notYours", { name: pack.attackerName });
	return null;
}

/**
 * Whoever gathered it rolls everybody's dice into an Attack card, joining any
 * into bigger ones first where somebody's Ability does (p56). The card is
 * closed before the roll, and only while nobody joined as the dice were
 * being joined, so nobody's dice are left out of it. A roll that never
 * reaches the chat opens the card again. Then each attacker's uses are spent,
 * as the blows are drawn.
 * @param {ChatMessage} message
 */
async function onRoll(message) {
	const pack = packOf(message);
	if (!canJoinPack(pack)) return warn("attack.pack.closed");
	const knight = gatherer(pack);
	if (!knight) return;
	// Spending what another player's Knight uses up is the Referee's to do for them.
	if (!game.users?.activeGM && pack.shares.some((share) => !fromUuidSync(share.actor)?.isOwner)) return warn("attack.pack.spendNeedsGM");
	const groups = await askPackGroups(pack);
	if (!groups) return;
	const now = packNow(message);
	if (!canJoinPack(now)) return warn("attack.pack.closed");
	if (now.shares.length !== pack.shares.length) return warn("attack.pack.joinedMeanwhile");
	if (!(await packCard.save(message, { type: "roll", shares: pack.shares.length, at: serverNow() }))) return;
	let posted = null;
	try {
		posted = await rollPack(knight, pack, groups);
	} catch (error) {
		console.error(error);
	}
	if (!posted) {
		await packCard.save(message, { type: "reopen" });
		return warn("attack.pack.rollFailed");
	}
	const kept = await packCard.save(message, { type: "posted", message: posted.id });
	// The blows and a drawn fire's offer needn't wait on anybody's spending.
	await Promise.all([kept ? spendShares(message, { ...pack, rolled: true, message: posted.id }) : null, packRolled(knight, pack)]);
}

/**
 * Spend what each attacker's share uses up, now it's rolled: this user's own
 * at once, the others' by the active GM, each once. The card as this client
 * last saved it is what's spent from, since a change the Referee wrote may not
 * have reached this client yet; whoever records each mark weighs it afresh.
 * @param {ChatMessage} message
 * @param {import("../rules/pack.js").PackState} pack As it stands once its Attack card is kept.
 */
async function spendShares(message, pack) {
	// Each share is another actor's, and the card's marks are written in turn anyway.
	await Promise.all(unspentShares(pack).map(async (index) => {
		const share = pack.shares[index];
		const actor = fromUuidSync(share.actor);
		let done = false;
		try {
			if (actor?.isOwner) {
				if (await packCard.save(message, { type: "spent", share: index })) {
					await spendAttack(actor, share.spend);
					done = true;
				}
			} else {
				done = Boolean(await askActiveGM(SPEND_QUERY, { messageId: message.id, share: index }, "Couldn't have the Attack's uses spent"));
			}
		} catch (error) {
			console.error(error);
		}
		if (!done) warn("attack.pack.spendFailed", { name: share.name });
	}));
}

/**
 * The active GM spends one share's uses for whoever rolled the Pack, once it's
 * rolled into an Attack card, marking it done first so nothing is spent twice.
 * @param {{messageId?: string, share?: number}} data
 * @param {object} context
 * @returns {Promise<boolean>}
 */
async function onSpendQuery(data, context) {
	const user = queryAsker(context);
	const message = game.messages?.get(data?.messageId);
	const pack = packOf(message);
	const share = pack?.shares[data?.share];
	if (!user || !share || !ownedBy(pack.attacker, user) || !unspentShares(pack).includes(data.share)) return false;
	const actor = fromUuidSync(share.actor);
	if (!actor || !(await packCard.commit(message, { type: "spent", share: data.share }))) return false;
	await spendAttack(actor, share.spend);
	return true;
}

/**
 * Nobody attacks: the card closes with nothing rolled and nothing spent but a
 * Smite already made, whose Save was rolled as it was declared.
 * @param {ChatMessage} message
 */
async function onCallOff(message) {
	const pack = packOf(message);
	if (!canJoinPack(pack)) return warn("attack.pack.closed");
	if (!gatherer(pack)) return;
	const sure = await confirmDialog({
		title: t("attack.pack.callOff"),
		icon: "fa-solid fa-ban",
		message: t("attack.pack.callOffHint"),
		yes: { label: t("attack.pack.callOff") }
	});
	if (sure) await packCard.save(message, { type: "callOff" });
}

/**
 * A Pack closed for a roll whose Attack card never came, as when the browser
 * rolling it was closed: its Attack card is kept where it was posted after
 * all, and what it uses up spent; otherwise, once its player is sure, it's
 * opened again to be rolled.
 * @param {ChatMessage} message
 */
async function onRecover(message) {
	const pack = packNow(message);
	if (!pack?.rolled || pack.message) return warn("attack.pack.closed");
	if (!gatherer(pack)) return;
	const rolled = Array.from(game.messages ?? []).find((each) => each.flags?.[SYSTEM_ID]?.attack?.attackId === pack.attackId);
	if (rolled) {
		if (await packCard.save(message, { type: "posted", message: rolled.id })) await spendShares(message, { ...pack, message: rolled.id });
		return;
	}
	const sure = await confirmDialog({
		title: t("attack.pack.recover"),
		icon: "fa-solid fa-rotate-left",
		message: t("attack.pack.recoverConfirm"),
		yes: { label: t("attack.pack.recover") }
	});
	if (sure) await packCard.save(message, { type: "reopen" });
}

const HANDLERS = Object.freeze({ join: onJoin, roll: onRoll, "call-off": onCallOff, recover: onRecover });

/**
 * Show Open Again to whoever plays the Knight once the Pack has stood closed
 * for a roll, with no Attack card, for longer than any roll takes.
 * @param {ChatMessage} message
 * @param {HTMLElement|null} button
 * @param {boolean} theirs
 */
function watchStalled(message, button, theirs) {
	if (!button) return;
	button.hidden = true;
	const pack = packOf(message);
	if (!theirs || !pack?.rolled || pack.message) return;
	const show = () => {
		const now = packNow(message);
		button.hidden = !(now?.rolled && !now.message);
	};
	const wait = STALL_MS - (serverNow() - (pack.rolledAt ?? 0));
	if (wait <= 0) show();
	else setTimeout(show, wait);
}

/**
 * Wire up a Pack card's buttons as it renders. Join shows for those with
 * somebody to join it with, a GM always; rolling and calling it off for
 * whoever plays the one who gathered it.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
function activatePackCard(message, html) {
	const pack = packOf(message);
	const card = html.querySelector(".bastionland-card--pack");
	if (!pack || !card) return;
	const join = card.querySelector("[data-pack-action='join']");
	const theirs = Boolean(fromUuidSync(pack.attacker)?.isOwner);
	for (const action of ["roll", "call-off"]) {
		const button = card.querySelector(`[data-pack-action='${action}']`);
		if (button) button.hidden = !theirs;
	}
	const refresh = () => {
		if (join) join.hidden = !game.user.isGM && !joinersFor(packAttackers(pack), struckBy(pack)).length;
	};
	refresh();
	watchStalled(message, card.querySelector("[data-pack-action='recover']"), theirs);
	// Which Tokens are selected changes after the card is drawn.
	if (join) card.addEventListener("pointerenter", refresh);
	onCardClick(card, "[data-pack-action]", (button) => HANDLERS[button.dataset.packAction]?.(message));
}

/** Called during init. */
export function registerPackCards() {
	registerQuery(CHANGE_QUERY, onChangeQuery);
	registerQuery(SPEND_QUERY, onSpendQuery);
	Hooks.on("renderChatMessageHTML", activatePackCard);
}
