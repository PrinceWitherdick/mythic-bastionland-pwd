import { waitDialog } from "../apps/ui.js";
import { GOODS_PACKS } from "../book-art/goods-folders.js";
import { postCard, statLabels, t } from "../chat/cards.js";
import { BREED_FLAG, GALLOP_ROLL, bookSteeds, gallopBlocked, steedBreedShown, steedStatLine, vigAfterGallop } from "../rules/steeds.js";
import { escapeHTML } from "../rules/text.js";
import { SYSTEM_ID } from "../system-id.js";
import { chooseCompany } from "./time.js";

/** The dialog's button for a steed with no stats yet. */
const BLANK = "blank";

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
 * @param {string} [value]
 * @returns {string} A box to name the steed in.
 */
const nameField = (value = "") => `<div class="form-group">
	<label for="bastionland-steed-name">${escapeHTML(t("steed.nameLabel"))}</label>
	<div class="form-fields"><input id="bastionland-steed-name" type="text" name="name" value="${escapeHTML(value)}" placeholder="${escapeHTML(t("steed.namePlaceholder"))}" autocomplete="off"></div>
</div>`;

/**
 * Ask which of the book's steeds to take, or one with no stats yet, and what
 * to call it.
 * @param {Actor[]} steeds
 * @returns {Promise<{steed: Actor|typeof BLANK, name: string}|null>} Null if closed.
 */
async function pickSteed(steeds) {
	const intro = steeds.length ? t("steed.pickIntro") : t("steed.blankIntro");
	const lines = steeds.map((steed) => `<strong>${escapeHTML(steed.name)}</strong>: ${escapeHTML(steedStatLine(steed.system, steed.items.contents.map((item) => item.toObject()), statLabels()))}`);
	const pick = (steed) => (event, button) => ({ steed, name: button.form.elements.name.value.trim() });
	return waitDialog({
		window: { title: t("steed.take"), icon: "fa-solid fa-horse" },
		classes: ["bastionland-steed-pick"],
		content: [intro, ...lines].map((line) => `<p>${line}</p>`).join("") + nameField(),
		buttons: [
			...steeds.map((steed, index) => ({ action: steed.id, label: steed.name, default: index === 0, callback: pick(steed) })),
			{ action: BLANK, label: steeds.length ? t("steed.blank") : t("steed.take"), default: !steeds.length, callback: pick(BLANK) }
		]
	});
}

/**
 * Give a steed a name of the Knight's own. Nothing happens if the box is left empty.
 * @param {Actor} steed
 * @returns {Promise<Actor|null>}
 */
export async function renameSteed(steed) {
	if (!steed?.isOwner) return null;
	const data = await foundry.applications.api.DialogV2.input({
		window: { title: t("steed.rename"), icon: "fa-solid fa-horse" },
		classes: ["bastionland-dialog"],
		content: nameField(steed.name),
		ok: { icon: "fa-solid fa-check", label: t("steed.renameOk") },
		rejectClose: false
	});
	const name = data?.name?.trim();
	if (!name || name === steed.name) return null;
	return steed.update({ name });
}

/**
 * Give a Knight a steed to ride: one of the book's steeds (p12), or one with
 * no stats yet but a Trample to fill in, made as an NPC beside the Knight in
 * the Actors directory, whose sheet then opens. A Knight who rides one
 * already gets that steed's sheet instead.
 * @param {Actor} knight
 * @returns {Promise<Actor|null>} The steed.
 */
export async function takeSteed(knight) {
	if (knight.type !== "knight") return null;
	const existing = steedOf(knight);
	if (existing) {
		existing.sheet.render({ force: true });
		return existing;
	}
	if (!game.user.can("ACTOR_CREATE")) {
		ui.notifications.warn(t("steed.cantCreate"));
		return null;
	}
	const choice = await pickSteed(await steedsFromBook());
	if (!choice) return null;

	const blank = choice.steed === BLANK;
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
		steed: steed && { name: steed.name, vig: steed.system.virtues.vig.value }
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
