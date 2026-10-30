import { chooseActor } from "../apps/actor-pick.js";
import { confirmDialog, inputDialog } from "../apps/ui.js";
import { GOODS_PACKS } from "../book-art/goods-folders.js";
import { postCard, statLabels, t } from "../chat/cards.js";
import { BREED_FLAG, GALLOP_ROLL, bookSteeds, gallopBlocked, looksLikeSteed, steedBreedShown, steedStatLine, vigAfterGallop } from "../rules/steeds.js";
import { PICK_BLANK, pickedFrom } from "../rules/pick-list.js";
import { SYSTEM_ID } from "../system-id.js";
import { chooseCompany } from "./time.js";
import { escapeHTML } from "../rules/text.js";
import { isKnight } from "../rules/knight-types.js";
import { COMPANION_FLAG, FOLLOWER_FLAG } from "./property.js";
import { sharedOwnership } from "./squires.js";
import { deletionEntry } from "../compat.js";

/**
 * @param {Actor} actor
 * @returns {Actor|null} The steed they ride, if it still exists.
 */
export function steedOf(actor) {
	const steed = actor.system.steed ? fromUuidSync(actor.system.steed) : null;
	return steed?.documentName === "Actor" ? steed : null;
}

/**
 * The steeds among the book's beasts (p12), once Import PDF has filled the
 * Beasts & Hirelings compendium. None when it hasn't, or this user can't read it.
 * @returns {Promise<Actor[]>}
 */
async function steedsFromBook() {
	const pack = game.packs.get(`world.${GOODS_PACKS.actors.name}`);
	if (!pack?.visible) return [];
	try {
		const beasts = (await pack.getDocuments()).filter((actor) => actor.type === "npc" && actor.folder?.name === t("goods.folders.beasts"));
		return bookSteeds(beasts);
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't read the book's steeds`, error);
		return [];
	}
}

/**
 * Ask which of the book's steeds to take, or one with no stats yet, and what
 * to call it.
 * @param {Actor[]} steeds
 * @returns {Promise<{steed: Actor|typeof PICK_BLANK, name: string}|null>} Null if closed.
 */
async function pickSteed(steeds) {
	const labels = statLabels();
	const data = await inputDialog({
		title: t("steed.take"),
		icon: "fa-solid fa-horse",
		template: "take-steed",
		context: {
			intro: steeds.length ? t("steed.pickIntro") : t("steed.blankIntro"),
			steeds: steeds.map((steed) => ({
				id: steed.id,
				name: steed.name,
				detail: steedStatLine(steed.system, steed.items.contents.map((item) => item.toObject()), labels)
			}))
		},
		ok: { label: t("steed.take"), icon: "fa-solid fa-horse" }
	});
	if (!data) return null;
	const steed = pickedFrom(steeds, data.steed);
	return steed ? { steed, name: String(data.name ?? "").trim() } : null;
}

/**
 * Give a steed a name of the Knight's own. Nothing happens if the box is left empty.
 * @param {Actor} steed
 * @returns {Promise<Actor|null>}
 */
export async function renameSteed(steed) {
	if (!steed?.isOwner) return null;
	const data = await inputDialog({
		title: t("steed.rename"),
		icon: "fa-solid fa-horse",
		template: "rename-steed",
		context: { name: steed.name },
		ok: { label: t("steed.renameOk") }
	});
	const name = data?.name?.trim();
	if (!name || name === steed.name) return null;
	return steed.update({ name });
}

/**
 * Give a Knight a steed to ride: one of the book's steeds (p12), or one with
 * no stats yet but a Trample to fill in, made as an NPC beside the Knight in
 * the Actors directory, whose sheet then opens. A Knight who rides one
 * already gets that steed's sheet instead, unless it's Slain, which leaves
 * them on foot.
 * @param {Actor} knight
 * @returns {Promise<Actor|null>} The steed.
 */
export async function takeSteed(knight) {
	if (!isKnight(knight)) return null;
	const existing = steedOf(knight);
	if (existing && !existing.system.slain) {
		existing.sheet.render({ force: true });
		return existing;
	}
	if (!game.user.can("ACTOR_CREATE")) {
		ui.notifications.warn(t("steed.cantCreate"));
		return null;
	}
	const choice = await pickSteed(await steedsFromBook());
	if (!choice) return null;

	const blank = choice.steed === PICK_BLANK;
	const data = blank
		? { type: "npc", name: t("steed.label"), items: [{ type: "weapon", name: t("steed.trample"), system: { trample: true, equipped: true } }] }
		: game.actors.fromCompendium(choice.steed);
	// A named steed keeps the book steed it was, to show under its name.
	const breed = blank ? "" : data.name;
	if (breed) foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.${BREED_FLAG}`, breed);
	// Its own name only: whose steed it is, its sheet says. Named by its Knight,
	// what the book called it becomes the line under the name.
	const name = choice.name || data.name;
	const epithet = data.system?.epithet || steedBreedShown(name, breed);
	// Players who can see the Knight can see their steed. Only a GM may hand ownership to others.
	const steed = await Actor.implementation.create({
		...data,
		name,
		...(epithet ? { system: { ...data.system, epithet } } : {}),
		folder: knight.folder?.id ?? null,
		...(game.user.isGM ? { ownership: foundry.utils.deepClone(knight.ownership) } : {})
	});
	if (!steed) return null;
	await knight.update({ "system.steed": steed.uuid });
	steed.sheet.render({ force: true });
	return steed;
}

/**
 * Whoever already rides a steed, besides one Knight.
 * @param {Actor} steed
 * @param {Actor} [knight]
 * @returns {Actor[]}
 */
const ridersOf = (steed, knight) => game.actors.filter((actor) => isKnight(actor) && actor !== knight && actor.system.steed === steed.uuid);

/**
 * Warn when a steed or follower can't be moved because a Knight this user
 * doesn't own rides it.
 * @param {Actor} npc
 * @param {Actor[]} riders From ridersOf.
 * @returns {boolean} Whether one does.
 */
function riddenByAnother(npc, riders) {
	const rider = riders.find((actor) => !actor.isOwner);
	if (rider) ui.notifications.warn(t("steed.riddenBy", { steed: npc.name, rider: rider.name }));
	return Boolean(rider);
}

/**
 * Make an NPC already in the world the steed a Knight rides (p12). A steed
 * another Knight rides is taken from them, and one this Knight rides now is
 * replaced, each asked first; a Slain steed is simply replaced. Given by the
 * Referee, the steed is owned as the Knight is.
 * @param {Actor} knight
 * @param {Actor} steed
 * @returns {Promise<Actor|null>} The steed, or null where nothing changed.
 */
export async function rideSteed(knight, steed) {
	if (knight.system.steed === steed.uuid) return steed;
	const riders = ridersOf(steed, knight);
	if (riddenByAnother(steed, riders)) return null;
	// One that follows another Knight, or was made from their gear, leaves them, as a follower leaves
	// whoever rode them; otherwise it would be one Knight's and ride under another.
	const led = steed.getFlag(SYSTEM_ID, COMPANION_FLAG);
	const leader = led && led !== knight.id ? game.actors.get(led) ?? null : null;
	if (leader && !steed.isOwner) {
		ui.notifications.warn(t("steed.ledBy", { steed: steed.name, from: leader.name }));
		return null;
	}
	const current = steedOf(knight);
	const asked = riders.map((rider) => t("steed.takeFrom", { steed: escapeHTML(steed.name), rider: escapeHTML(rider.name), knight: escapeHTML(knight.name) }));
	if (leader && !riders.includes(leader)) asked.push(t("steed.leaves", { steed: escapeHTML(steed.name), from: escapeHTML(leader.name), knight: escapeHTML(knight.name) }));
	if (current && !current.system.slain) asked.push(t("steed.replaces", { steed: escapeHTML(current.name), knight: escapeHTML(knight.name) }));
	if (asked.length && !(await confirmDialog({ title: t("steed.changeTitle"), icon: "fa-solid fa-horse", message: asked }))) return null;

	await knight.update({ "system.steed": steed.uuid });
	for (const rider of riders) await rider.update({ "system.steed": "" });
	const shared = steed.isOwner ? sharedOwnership(steed, knight) : {};
	// Theirs now, so replacing the other Knight's gear never sweeps it away.
	if (led && led !== knight.id && steed.isOwner) Object.assign(shared, Object.fromEntries([COMPANION_FLAG, FOLLOWER_FLAG].map((flag) => deletionEntry(`flags.${SYSTEM_ID}.${flag}`))));
	if (Object.keys(shared).length) await steed.update(shared);
	return steed;
}

/**
 * Take an NPC already in the world on as a Knight's follower (p8): somebody
 * who rides with them, and could be taken up if they fall. They carry the
 * same mark as those made from the Knight's Property, and another that keeps
 * them when that Property is replaced. Whoever rode them, or led them, lets
 * them go, asked first. Only whoever may write them can take them on; given
 * by the Referee, they're owned as the Knight is.
 * @param {Actor} knight
 * @param {Actor} npc
 * @returns {Promise<Actor|null>} The follower, or null where nothing changed.
 */
export async function takeFollower(knight, npc) {
	if (!npc.isOwner) {
		ui.notifications.warn(t("follower.notYours", { name: npc.name }));
		return null;
	}
	const riders = ridersOf(npc);
	if (riddenByAnother(npc, riders)) return null;
	const led = npc.getFlag(SYSTEM_ID, COMPANION_FLAG);
	if (led === knight.id && npc.getFlag(SYSTEM_ID, FOLLOWER_FLAG) && !riders.length) return npc;
	const leader = led && led !== knight.id ? game.actors.get(led) : null;

	const asked = riders.map((rider) => t("follower.noLongerSteed", { name: escapeHTML(npc.name), rider: escapeHTML(rider.name) }));
	if (leader) asked.push(t("follower.leaves", { name: escapeHTML(npc.name), from: escapeHTML(leader.name), knight: escapeHTML(knight.name) }));
	if (asked.length && !(await confirmDialog({ title: t("follower.takeTitle"), icon: "fa-solid fa-people-group", message: asked }))) return null;

	await npc.update({
		[`flags.${SYSTEM_ID}.${COMPANION_FLAG}`]: knight.id,
		[`flags.${SYSTEM_ID}.${FOLLOWER_FLAG}`]: true,
		...sharedOwnership(npc, knight)
	});
	for (const rider of riders) await rider.update({ "system.steed": "" });
	ui.notifications.info(t("follower.joined", { name: npc.name, knight: knight.name }));
	return npc;
}

/**
 * Ask whether an NPC dropped on a Knight is to be ridden or to follow. A plain
 * mount is ridden without asking, and so is anything dropped on a Squire, who
 * rides their pony and takes on no followers.
 * @param {Actor} knight
 * @param {Actor} npc
 * @returns {Promise<"steed"|"follower"|null>} Null if closed.
 */
async function companionRole(knight, npc) {
	const trample = npc.items.some((item) => item.type === "weapon" && item.system.trample);
	if (knight.system.isSquire || looksLikeSteed({ name: npc.name, breed: npc.getFlag(SYSTEM_ID, BREED_FLAG), trample })) return "steed";
	const roles = ["steed", "follower"].map((key) => ({ key, name: t(`follower.as.${key}`) }));
	const picked = await chooseActor(roles, {
		title: t("follower.dropTitle"),
		message: t("follower.dropAsk", { name: npc.name, knight: knight.name }),
		icon: "fa-solid fa-people-group",
		ok: t("follower.dropOk")
	});
	return picked?.key ?? null;
}

/**
 * Bring an NPC dropped from a compendium into the world beside the Knight,
 * owned as the Knight is when the Referee does it. A hireling rolls their
 * Virtues as they're made (npc.js).
 * @param {Actor} npc
 * @param {Actor} knight
 * @returns {Promise<Actor|null>}
 */
async function fromCompendium(npc, knight) {
	if (!game.user.can("ACTOR_CREATE")) {
		ui.notifications.warn(t("follower.fromDirectory"));
		return null;
	}
	return Actor.implementation.create({
		...game.actors.fromCompendium(npc),
		folder: knight.folder?.id ?? null,
		...(game.user.isGM ? { ownership: foundry.utils.deepClone(knight.ownership) } : {})
	});
}

/**
 * An NPC dropped on a Knight's sheet: their steed, or their follower (p8,
 * p12), asked of anybody who isn't plainly a mount. One dropped from a
 * compendium is brought into the world first. A Warband is neither.
 * @param {Actor} knight
 * @param {Actor} npc
 * @returns {Promise<Actor|null>} The steed or follower, or null where nothing changed.
 */
export async function dropCompanion(knight, npc) {
	if (!isKnight(knight) || npc?.type !== "npc") return null;
	if (npc.system.scale === "warband") {
		ui.notifications.warn(t("follower.notWarband", { name: npc.name }));
		return null;
	}
	const role = await companionRole(knight, npc);
	if (!role) return null;
	const actor = npc.pack ? await fromCompendium(npc, knight) : npc;
	if (!actor) return null;
	return role === "steed" ? rideSteed(knight, actor) : takeFollower(knight, actor);
}

/**
 * Gallop (p18): the Company rides 2 Hexes in a Phase, and each steed loses d6
 * VIG. Everybody must ride a steed that isn't Exhausted, so nobody gallops
 * while one of them can't. GMs only, as the steeds' VIG changes.
 * @returns {Promise<ChatMessage|null>}
 */
export async function gallop() {
	if (!game.user.isGM) return null;
	const company = await chooseCompany({
		title: t("steed.gallop.title"),
		icon: "fa-solid fa-horse",
		intro: t("steed.gallop.intro"),
		ok: t("steed.gallop.ok"),
		knightsOnly: true
	});
	if (!company?.length) return null;

	const riders = company.map(({ actor }) => ({ actor, steed: steedOf(actor) }));
	const blocked = gallopBlocked(riders.map(({ actor, steed }) => ({
		name: actor.name,
		steed: steed && { name: steed.name, vig: steed.system.virtues.vig.value, slain: Boolean(steed.system.slain) }
	})));
	if (blocked.length) {
		const names = blocked.map(({ name, reason, steed }) => t(`steed.gallop.${reason}`, { name, steed }));
		ui.notifications.warn(t("steed.gallop.blocked", { names: names.join(" ") }));
		return null;
	}

	// Every steed gallops at once, and the whole Company's VIG is written in one go.
	const rolls = await Promise.all(riders.map(() => new Roll(GALLOP_ROLL).evaluate()));
	const galloped = riders.map(({ actor, steed }, index) => {
		const before = steed.system.virtues.vig.value;
		return { actor, steed, loss: rolls[index].total, before, after: vigAfterGallop(before, rolls[index].total) };
	});
	await Actor.implementation.updateDocuments(galloped.map(({ steed, after }) => (
		{ _id: steed.id, "system.virtues.vig.value": after }
	)));
	const entries = galloped.map(({ actor, steed, loss, before, after }) => ({
		name: steed.name,
		lines: [
			t("steed.gallop.lost", { name: actor.name, loss, from: before, to: after }),
			...(after === 0 ? [t("steed.gallop.exhaustedNow", { steed: steed.name })] : [])
		]
	}));
	return postCard(null, "report", { title: t("steed.gallop.title"), tagline: t("steed.gallop.tagline"), entries, hint: t("steed.gallop.hint") }, { rolls });
}

/**
 * A steed given a name of its Knight's own — at the window, by the pencil on
 * the Knight's sheet, or on its own sheet — keeps what the book called it as
 * the line under the name, unless it has a line of its own already, or the
 * new name says what it is.
 */
export function registerSteedNames() {
	Hooks.on("preUpdateActor", (actor, changes) => {
		if (typeof changes.name !== "string" || foundry.utils.hasProperty(changes, "system.epithet")) return;
		if (!("epithet" in actor.system) || actor.system.epithet) return;
		const epithet = steedBreedShown(changes.name, actor.getFlag(SYSTEM_ID, BREED_FLAG));
		if (epithet) foundry.utils.setProperty(changes, "system.epithet", epithet);
	});
}
