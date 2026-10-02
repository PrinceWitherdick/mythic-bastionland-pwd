import { confirmDialog, inputDialog } from "../apps/ui.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { promptsForEntry } from "../book-art/myth-tables.js";
import { t } from "../chat/cards.js";
import { SEER_PROMPTS_VERSION } from "../rules/book-art.js";
import { bookNames } from "../rules/book-flip.js";
import {
	COURT_ROLES,
	SERVES_A_SEAT,
	circleKnights,
	councilSeatPlan,
	newCourtMember,
	normalizeCourt,
	normalizeCourtMember,
	seatOf
} from "../rules/court.js";
import { COUNCIL_SEATS, isSameName } from "../rules/dominion.js";
import { rollFreeName } from "../rules/knight-names.js";
import { escapeHTML, trimmedText } from "../rules/text.js";

/**
 * Who serves a Domain (The Court, p20), and who sits on its Council. Each
 * member is kept under an id of their own, and the Council's seats hold those
 * ids, so a Retainer must join the Court before they can be granted a seat.
 */

/** The world setup step that fills older Domains' Councils from their Courts. */
export const COUNCIL_RETAINERS_STEP = "councilRetainers";

/** @param {string} seat One of COUNCIL_SEATS. */
export const seatLabel = (seat) => t(`domain.council.${seat}.label`);

/**
 * @returns {{id: string, name: string}[]} The world's Knights, as the Circle finds them.
 */
export const worldKnights = () => game.actors.filter((actor) => actor.type === "knight").map((actor) => ({ id: actor.id, name: actor.name }));

/**
 * @param {Actor} domain
 * @returns {Actor[]} The world's Knights other than the Domain's ruler, whether
 *   the ruler is linked to it or only named on it.
 */
export function knightsBesidesRuler(domain) {
	const ruler = trimmedText(domain.system.ruler);
	const rules = (actor) => (Boolean(domain.uuid) && actor.system?.domain === domain.uuid) || Boolean(ruler && isSameName(actor.name, ruler));
	return game.actors.filter((actor) => actor.type === "knight" && !rules(actor));
}

/**
 * @param {Actor} domain
 * @param {string} [except] The id of somebody to leave out, such as the one being written of.
 * @returns {string[]} The names of those in the Domain's Court.
 */
const courtNames = (domain, except) => Object.entries(normalizeCourt(domain.system.court))
	.filter(([id, member]) => id !== except && member.name)
	.map(([, member]) => member.name);

/**
 * Take somebody new into the Court.
 * @param {Actor} domain
 * @param {string} role One of COURT_ROLES.
 * @param {{name?: string, note?: string}} [fields] What's already known of them.
 * @returns {Promise<string|null>} Their id, or null for a role the Court doesn't have.
 */
export async function addCourtMember(domain, role, fields = {}) {
	if (!COURT_ROLES.includes(role) || !domain?.isOwner) return null;
	const member = { ...newCourtMember(role, Date.now()), ...fields };
	const id = foundry.utils.randomID();
	await domain.update({ [`system.court.${id}`]: member });
	return id;
}

/**
 * Ask who somebody of the Court is: their role, name, the seat they serve,
 * their leverage and a note.
 * @param {import("../rules/court.js").CourtMember} member As they stand.
 * @param {string} held The seat they hold themselves, if any.
 * @param {{title: string, ok: string, others?: string[]}} wording `others` are
 *   the rest of the Court's names, which the name's die rolls only once no other is left.
 * @returns {Promise<object|null>} The answers, or null if the window was closed.
 */
async function askAboutMember(member, held, { title, ok, others = [] }) {
	const notePlaceholder = (role) => t(`domain.court.roles.${role}.notePlaceholder`);
	return inputDialog({
		title,
		icon: "fa-solid fa-user",
		template: "court-member",
		context: {
			roles: COURT_ROLES.map((role) => ({
				key: role,
				label: t(`domain.court.roles.${role}.one`),
				hint: t(`domain.court.roles.${role}.hint`),
				notePlaceholder: notePlaceholder(role),
				selected: role === member.role
			})),
			roleHint: t(`domain.court.roles.${member.role}.hint`),
			name: member.name,
			leverage: member.leverage,
			note: member.note,
			notePlaceholder: notePlaceholder(member.role),
			servesShown: member.role === SERVES_A_SEAT,
			holdsSeat: held ? t("domain.court.holdsSeat", { seat: seatLabel(held) }) : "",
			seats: COUNCIL_SEATS.map((key) => ({ key, label: seatLabel(key), selected: key === member.seat }))
		},
		ok: { label: ok, icon: "fa-solid fa-check" },
		render: (_event, dialog) => {
			followTheRole(dialog);
			offerBookNames(dialog, others);
		}
	});
}

/**
 * The names the book gives on its Knights' pages, from the GM's own import. An
 * index written before those prompts were read gives one, from a random
 * Knight's page in the rulebook the world keeps for its reader.
 * @returns {Promise<string[]>} Empty before the book is imported.
 */
async function namesFromTheBook() {
	const index = await loadArtIndex();
	const names = bookNames(index?.seers);
	if (names.length || !index?.seers?.length) return names;
	const seer = index.seers[Math.floor(Math.random() * index.seers.length)];
	const read = await promptsForEntry(index, seer, { versionFloor: SEER_PROMPTS_VERSION });
	return bookNames([{ page: seer.page, prompts: read }]);
}

/**
 * Let the die beside the name fill it with one of the book's names: never the
 * name already there, nor another of the Court's while any is left.
 * @param {foundry.applications.api.DialogV2} dialog
 * @param {string[]} others The rest of the Court's names.
 */
function offerBookNames(dialog, others) {
	const input = dialog.element.querySelector("[name='name']");
	dialog.element.querySelector("[data-roll-name]")?.addEventListener("click", async () => {
		const name = rollFreeName(await namesFromTheBook(), Math.random, [input?.value, ...others]);
		if (!name) return ui.notifications.warn(t("domain.court.rollNameUnread"));
		if (!input) return;
		input.value = name;
		input.focus();
	});
}

/**
 * Keep the member window in step with the role chosen: the role's hint, the
 * note's prompt, and the seat served, which only a Retainer has.
 * @param {foundry.applications.api.DialogV2} dialog
 */
function followTheRole(dialog) {
	const form = dialog.element.querySelector("form");
	const role = form?.querySelector("[name='role']");
	if (!role) return;
	role.addEventListener("change", () => {
		const option = role.selectedOptions[0];
		const note = form.querySelector("[name='note']");
		const hint = form.querySelector("[data-role-hint]");
		if (note) note.placeholder = option?.dataset.note ?? "";
		if (hint) hint.textContent = option?.dataset.hint ?? "";
		form.querySelector("[data-serves]")?.toggleAttribute("hidden", role.value !== SERVES_A_SEAT);
	});
}

/**
 * The member the window's answers describe, or null with a warning where they
 * were given no name, since nobody nameless can serve or be granted a seat.
 * @param {object} data From the window.
 * @param {import("../rules/court.js").CourtMember} member As they stood.
 * @returns {import("../rules/court.js").CourtMember|null}
 */
function memberFromAnswers(data, member) {
	const answered = normalizeCourtMember({
		role: data.role,
		name: data.name,
		seat: data.seat ?? member.seat,
		leverage: data.leverage,
		note: data.note,
		at: member.at
	});
	if (!answered) return null;
	if (!answered.name) {
		ui.notifications.warn(t("domain.court.nameNeeded"));
		return null;
	}
	return answered;
}

/**
 * Take somebody into the Court from the sheet, asking who they are first so
 * that nobody joins without a name.
 * @param {Actor} domain
 * @returns {Promise<string|null>} Their id, or null where nobody joined.
 */
export async function takeIntoCourt(domain) {
	if (!domain?.isOwner) return null;
	const fresh = newCourtMember(SERVES_A_SEAT, Date.now());
	const data = await askAboutMember(fresh, "", { title: t("domain.court.addTitle"), ok: t("domain.court.add"), others: courtNames(domain) });
	const member = data ? memberFromAnswers(data, fresh) : null;
	if (!member) return null;
	const id = foundry.utils.randomID();
	await domain.update({ [`system.court.${id}`]: member });
	return id;
}

/**
 * Change what's written of somebody in the Court. One who holds a seat and is
 * made anything but a Retainer gives the seat up with it.
 * @param {Actor} domain
 * @param {string} id
 * @returns {Promise<boolean>} Whether anything was written.
 */
export async function editCourtMember(domain, id) {
	const member = normalizeCourt(domain?.system.court)[id];
	if (!member || !domain.isOwner) return false;
	const held = seatOf(domain.system.council, id);
	const data = await askAboutMember(member, held, {
		title: t("domain.court.editTitle", { name: member.name || t(`domain.court.roles.${member.role}.one`) }),
		ok: t("domain.court.save"),
		others: courtNames(domain, id)
	});
	const answered = data ? memberFromAnswers(data, member) : null;
	if (!answered) return false;
	const changes = { [`system.court.${id}`]: answered };
	if (held && answered.role !== SERVES_A_SEAT) changes[`system.council.${held}`] = "";
	await domain.update(changes);
	return true;
}

/**
 * Let somebody go from the Court. One who has been named is confirmed first,
 * since their line would be lost with them, and one holding a seat leaves it empty.
 * @param {Actor} domain
 * @param {string} id
 * @returns {Promise<boolean>} Whether they left.
 */
export async function removeCourtMember(domain, id) {
	const member = normalizeCourt(domain?.system.court)[id];
	if (!member || !domain.isOwner) return false;
	const held = seatOf(domain.system.council, id);

	if (member.name) {
		const confirmed = await confirmDialog({
			title: t("domain.court.remove"),
			icon: "fa-solid fa-user-xmark",
			message: t(held ? "domain.court.removeConfirmSeated" : "domain.court.removeConfirm", {
				name: escapeHTML(member.name),
				role: t(`domain.court.roles.${member.role}.one`),
				seat: held ? seatLabel(held) : ""
			})
		});
		if (!confirmed) return false;
	}

	await domain.update({
		[`system.court.-=${id}`]: null,
		...(held ? { [`system.council.${held}`]: "" } : {})
	});
	return true;
}

/**
 * Choose which Knights sit in a Domain's Circle (p20), from the world's
 * Knights other than its ruler.
 * @param {Actor} domain
 * @returns {Promise<boolean>} Whether the Circle was changed.
 */
export async function seatCircle(domain) {
	if (!domain?.isOwner) return false;
	const knights = worldKnights();
	const seated = circleKnights(domain.system.council.circle, knights);
	const besides = new Set(knightsBesidesRuler(domain).map((actor) => actor.id));
	const offered = knights.filter((knight) => besides.has(knight.id) || seated.some((each) => each.id === knight.id));
	// Names written in by hand before the Circle held Knights stay offered, ticked, so they go only when unticked.
	const written = seated.filter((each) => each.legacy).map((each, index) => ({ key: `written${index}`, name: each.name }));
	const data = await inputDialog({
		title: t("domain.council.circle.title"),
		icon: "fa-solid fa-users",
		template: "circle",
		context: {
			intro: t("domain.council.circle.intro", { name: domain.name }),
			circle: [
				...offered.map((knight) => ({ ...knight, checked: seated.some((each) => each.id === knight.id) })),
				...written.map(({ key, name }) => ({ id: key, name, checked: true }))
			]
		},
		ok: { label: t("domain.council.circle.ok"), icon: "fa-solid fa-users" }
	});
	if (!data) return false;
	const chosen = foundry.utils.expandObject(data).circle ?? {};
	await domain.update({
		"system.council.circle": [
			...offered.filter((knight) => chosen[knight.id]).map((knight) => knight.id),
			...written.filter(({ key }) => chosen[key]).map(({ name }) => name)
		]
	});
	return true;
}

/**
 * Before the Council was filled from the Court, its seats were names written
 * in by hand. Each of those becomes a Retainer holding the seat, and each name
 * in a Circle becomes its Knight, so no Domain loses who sits on its Council.
 */
export async function seatCouncilRetainers() {
	const knights = worldKnights();
	const now = Date.now();
	const updates = game.actors
		.filter((actor) => actor.type === "domain")
		.map((domain) => ({ _id: domain.id, ...councilSeatPlan(domain.system, knights, () => foundry.utils.randomID(), now) }))
		.filter((update) => Object.keys(update).length > 1);
	if (updates.length) await Actor.implementation.updateDocuments(updates);
}
