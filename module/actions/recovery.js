import { askActiveGM } from "../ask-gm.js";
import { gmAsker } from "../gm-asker.js";
import { confirmDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { SYSTEM_ID } from "../system-id.js";
import { updateActors } from "./actor-updates.js";
import { companionsOf, worldCompanions } from "./fallen.js";
import { inCompany, worldKnights } from "./knights.js";
import { causedBy } from "./ledger.js";
import { acceptAfterTelling } from "./saves.js";
import { VIRTUES, isDying, needsRest } from "../rules/virtues.js";
import { advancePhase, chooseCompany } from "./time.js";
import { askReferee } from "./ask-referee.js";
import { countAfter, isAtHand, isCounted } from "../rules/restock.js";
import { restedActorUpdate, swornToQuest } from "../rules/stances.js";
import { lapseStances } from "./stance-lapse.js";
import { registerQuery } from "../queries.js";

/**
 * Restore one Virtue of each of them to its most, all in one write.
 * @param {Actor[]} actors
 * @param {string} virtue
 * @param {string} cause What the Ledger says did it, as causedBy takes it.
 * @returns {Promise<{name: string, lines: string[]}[]>} A report card's entry for each.
 */
export async function restoreVirtueOfEach(actors, virtue, cause) {
	const entries = actors.map((actor) => restoredEntry(actor, virtue));
	await updateActors(actors.map((actor) => [actor, { [`system.virtues.${virtue}.value`]: actor.system.virtues[virtue].max }]), causedBy(cause));
	return entries;
}

/**
 * @param {Actor} actor
 * @param {string} virtue
 * @returns {{name: string, lines: string[]}} A report card's entry for somebody whose Virtue is restored to its most.
 */
const restoredEntry = (actor, virtue) => ({
	name: actor.name,
	lines: [t("recovery.restored", { virtue: t(`virtues.${virtue}.label`), value: actor.system.virtues[virtue].max })]
});

/**
 * A Remedy is used up (p9): one of several carried is taken off the count,
 * and the last goes, unless it's restocked, when it waits at none for that.
 * @param {Item} item
 */
async function spendRemedy(item) {
	const { system } = item;
	const left = isCounted(system) ? countAfter(system.quantity, -1) : 0;
	if (left > 0 || (isCounted(system) && system.restock)) await item.update({ "system.quantity.value": left }, causedBy("recovery"));
	else await item.delete();
}

/**
 * A moment's calm and rest: GD returns to full, Fatigue is removed, and they
 * are no longer Exposed (Recovery, p9).
 * @param {Actor} actor
 */
export async function rest(actor) {
	const held = swornToQuest(actor);
	const value = held ? actor.system.guard.value : actor.system.guard.max;
	await actor.update(restedActorUpdate(actor), causedBy("recovery"));
	// The moment of peace ends a stance held only for the fight (p40, p78).
	await lapseStances(actor);
	await postCard(actor, "note", {
		icon: "fa-solid fa-mug-hot",
		text: t(held ? "recovery.restedSworn" : "recovery.rested", { value })
	});
}

/**
 * Rest once the GM has read what it does and accepted: the NPC sheet's Rest,
 * which has no Recovery list beside it to say so.
 * @param {Actor} actor
 * @returns {Promise<boolean>} Whether they rested.
 */
export async function restIfAccepted(actor) {
	const { value, max } = actor.system.guard;
	if (!(await acceptAfterTelling(actor, "recovery.rest", "fa-solid fa-mug-hot", { value, max }))) return false;
	await rest(actor);
	return true;
}

/**
 * The danger has passed (Recovery, p9): once a Combat ends, offer the active
 * GM to restore Guard, remove Fatigue and end a marked Exposed for everybody
 * in it still standing who needs it, on one card.
 * @param {Combat} combat
 * @returns {Promise<Actor[]|null>} Those rested, or null when nobody was.
 */
export async function restAfterCombat(combat) {
	if (!game.users.activeGM?.isSelf || !combat?.started) return null;
	const actors = [];
	for (const combatant of combat.combatants) {
		const { actor } = combatant;
		// A ship or wall doesn't catch its breath: its GD comes back by repair, and so does a
		// creature that counts as a structure, once destroyed (p11).
		// The Slain rest no more, but somebody Exhausted at VIG 0 still catches their breath.
		// One sworn to a quest keeps their GD as it is (p94), so GD alone doesn't call for a rest.
		if (!actor?.system?.guard || actor.type === "structure" || actors.includes(actor) || actor.system.slain || actor.system.destroyed) continue;
		if (needsRest(actor.system, { sworn: swornToQuest(actor) })) actors.push(actor);
	}
	if (!actors.length) return null;
	const names = actors.map((actor) => actor.name).join(", ");
	const confirmed = await confirmDialog({ title: t("recovery.afterCombatTitle"), icon: "fa-solid fa-mug-hot", message: t("recovery.afterCombat", { names: foundry.utils.escapeHTML(names) }) });
	if (!confirmed) return null;
	await updateActors(actors.map((actor) => [actor, restedActorUpdate(actor)]), causedBy("recovery"));
	const held = actors.filter(swornToQuest).map((actor) => actor.name);
	const text = t("recovery.restedAfterCombat", { names }) + (held.length ? ` ${t("recovery.swornHeld", { names: held.join(", ") })}` : "");
	await postCard(null, "note", { icon: "fa-solid fa-mug-hot", text });
	return actors;
}

/**
 * Once a fight is over, remind the Referee of everybody it left Mortally
 * Wounded, whose hour without help is running and whom a quick patching
 * saves (p8). A routed Warband isn't dying, so it isn't named. Posted only to
 * the Referee, by the active one, and only when somebody is dying.
 * @param {Combat} combat The Combat just deleted.
 * @returns {Promise<Actor[]>} Those named.
 */
export async function warnDyingAfterCombat(combat) {
	if (!game.users.activeGM?.isSelf || !combat?.started) return [];
	const dying = [];
	for (const { actor } of combat.combatants ?? []) {
		if (actor?.system && isDying(actor.system) && !dying.includes(actor)) dying.push(actor);
	}
	if (!dying.length) return [];
	await postCard(null, "note", { icon: "fa-solid fa-hourglass-half", text: t("recovery.dyingAfterCombat", { names: dying.map((actor) => actor.name).join(", ") }) }, { mode: "gm" });
	return dying;
}

/**
 * Restore a Virtue to its maximum, as a Remedy, Action or new Season does.
 * @param {Actor} actor
 * @param {string} virtue "vig", "cla" or "spi".
 * @param {{icon: string, text: (value: number) => string}} [card] What the card says, where it isn't the plain restoring.
 */
export async function restoreVirtue(actor, virtue, card = {
	icon: "fa-solid fa-heart-pulse",
	text: (value) => t("recovery.restored", { virtue: t(`virtues.${virtue}.label`), value })
}) {
	const value = actor.system.virtues[virtue].max;
	await actor.update({ [`system.virtues.${virtue}.value`]: value }, causedBy("recovery"));
	await postCard(actor, "note", { icon: card.icon, text: card.text(value) });
}

/**
 * Indulge a Passion: the Knight's own way of restoring SPI (p7).
 * @param {Actor} actor
 * @param {Item|undefined} item The Passion.
 * @returns {Promise<boolean>} Whether SPI was restored.
 */
export async function indulgePassion(actor, item) {
	const spi = actor.system.virtues?.spi;
	if (!spi || !item) return false;
	if (spi.value >= spi.max) {
		ui.notifications.info(t("passion.full", { name: actor.name }));
		return false;
	}
	await restoreVirtue(actor, "spi", {
		icon: "fa-solid fa-wine-glass",
		text: (value) => t("passion.indulged", { name: actor.name, passion: item.name, value })
	});
	return true;
}

/** The query a player's Remedy sends, so the Referee restores those present whom the player doesn't own. */
const REMEDY_QUERY = `${SYSTEM_ID}.remedy`;

/**
 * Have the active GM restore, with a player's Remedy, those present the player
 * can't change, and spend it. Whoever isn't restored is named to the player.
 * @param {Item} item The Remedy.
 * @param {string} virtue
 * @param {Actor[]} actors
 * @returns {Promise<{restored: Actor[], spent: boolean}>} Those restored, and whether the GM spent the Remedy.
 */
async function restoreByReferee(item, virtue, actors) {
	if (!actors.length) return { restored: [], spent: false };
	const asked = { itemUuid: item.uuid, virtue, actorUuids: actors.map((actor) => actor.uuid) };
	const answer = await askActiveGM(REMEDY_QUERY, asked, `Couldn't share ${item.name} with the Company`);
	const done = new Set(Array.isArray(answer) ? answer : []);
	const restored = actors.filter((actor) => done.has(actor.uuid));
	const left = actors.filter((actor) => !done.has(actor.uuid));
	if (left.length) ui.notifications.warn(t("remedy.othersNeedReferee", { names: left.map((actor) => actor.name).join(", ") }));
	return { restored, spent: Array.isArray(answer) };
}

/** @returns {Set<Actor>} Everybody a Remedy may reach: the Knights riding with the Company, and their steeds and followers. */
function companyAndCompanions() {
	const knights = worldKnights(inCompany);
	const companions = worldCompanions({ players: false });
	return new Set([...knights, ...knights.flatMap((knight) => companionsOf(knight, { companions }))]);
}

/**
 * A player's Remedy, shared by the GM who was asked: only for a Remedy of
 * that Virtue the asker owns or carries and has left, and only with the
 * Company and its steeds and followers. The GM spends it as they share it, so
 * one Remedy can't be shared twice.
 * @param {{itemUuid?: string, virtue?: string, actorUuids?: string[]}} data
 * @param {object} context
 * @returns {Promise<string[]|false>} The uuids of those restored.
 */
export async function onRemedyQuery(data = {}, context = {}) {
	const asker = gmAsker(context);
	if (!asker) return false;
	const item = fromUuidSync(String(data?.itemUuid ?? ""));
	const virtue = data?.virtue;
	if (item?.documentName !== "Item" || !VIRTUES.includes(virtue) || item.system?.remedy !== virtue || !isAtHand(item.system)) return false;
	if (!item.testUserPermission(asker, "OWNER") && !item.parent?.testUserPermission(asker, "OWNER")) return false;
	const reach = companyAndCompanions();
	const asked = Array.isArray(data?.actorUuids) ? data.actorUuids : [];
	const actors = [...new Set(asked.map((uuid) => fromUuidSync(String(uuid))))]
		.filter((actor) => reach.has(actor) && actor.system?.virtues?.[virtue] && !actor.system.slain);
	await restoreVirtueOfEach(actors, virtue, "recovery");
	await spendRemedy(item);
	return actors.map((actor) => actor.uuid);
}

/** Answer players' Remedies, which the Referee shares with those they don't own. Called during init. */
export function registerRemedyQuery() {
	registerQuery(REMEDY_QUERY, onRemedyQuery);
}

/**
 * Use a Remedy (p9): everybody present has its Virtue restored, and the Remedy
 * is used up. The Knights' steeds and followers are present too. A player's
 * Remedy reaches the whole Company: those they own they restore themselves,
 * and the active GM restores the rest.
 * @param {Actor} actor Whoever carries it.
 * @param {Item|undefined} item
 * @returns {Promise<object[]|null>}
 */
export async function useRemedy(actor, item) {
	const virtue = item?.system.remedy;
	if (!VIRTUES.includes(virtue)) return null;

	const abbr = t(`virtues.${virtue}.abbr`);
	const company = await chooseCompany({
		title: item.name,
		icon: "fa-solid fa-flask",
		intro: t("remedy.intro", { virtue: abbr }),
		ok: t("remedy.use", { virtue: abbr }),
		present: [actor],
		companions: true,
		wholeCompany: true
	});
	if (!company?.length) return null;

	const name = item.name;
	const members = company.map(({ actor: member }) => member);
	const mine = game.user.isGM ? members : members.filter((member) => member.isOwner);
	// The Referee checks the Remedy and spends it as they restore whoever's theirs to restore.
	const [, theirs] = await Promise.all([
		restoreVirtueOfEach(mine, virtue, "recovery"),
		restoreByReferee(item, virtue, members.filter((member) => !mine.includes(member)))
	]);
	const restored = new Set([...mine, ...theirs.restored]);
	const entries = members.filter((member) => restored.has(member)).map((member) => restoredEntry(member, virtue));
	if (!theirs.spent) await spendRemedy(item);
	await postCard(actor, "report", { title: name, tagline: t("remedy.tagline"), entries, hint: t("remedy.hint") });
	// Using it takes a whole Phase (p9), restored before anything the Phase brings: the Referee
	// moves the calendar on, or a player asks them to.
	if (game.user.isGM) await advancePhase();
	else await askReferee("roll", "phase", t("remedy.passPhase"));
	return entries;
}
