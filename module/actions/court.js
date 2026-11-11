import { confirmDialog, inputDialog } from "../apps/ui.js";
import { deletionUpdate } from "../compat.js";
import { loadArtIndex, seerEntry } from "../book-art/art-index.js";
import { promptsForEntry } from "../book-art/myth-tables.js";
import { t } from "../chat/cards.js";
import { SEER_PROMPTS_VERSION } from "../rules/book-art.js";
import { bookNames } from "../rules/book-flip.js";
import {
	COURT_ROLES,
	SERVES_A_SEAT,
	circleKnights,
	councilSeatPlan,
	courtPlacesOf,
	domainRulerOf,
	knightPosts,
	leavePlan,
	newCourtMember,
	normalizeCourt,
	normalizeCourtMember,
	seatHolder,
	seatOf,
	seatPlan,
	withProven
} from "../rules/court.js";
import { COUNCIL_SEATS, canHoldPost, isSameName } from "../rules/dominion.js";
import { seersSanctums } from "../rules/realm.js";
import { rollFreeName } from "../rules/knight-names.js";
import { escapeHTML } from "../rules/text.js";
// dominion.js imports this module too; worldDomains is only read as a function runs.
import { worldDomains } from "./dominion.js";
import { worldKnights } from "./knights.js";
import { timelineCircle, timelineCourtJoined, timelineCourtLeft } from "./timeline-events.js";

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
 * Every Knight of the world, the dead and Squires among them, since a Circle
 * already seating one must still find them by id.
 * @returns {{id: string, name: string, canSit: boolean}[]} The world's Knights, as the Circle finds them,
 *   each saying whether they could take a seat now: knighted and alive (canHoldPost).
 */
export const knightChoices = () => worldKnights().map((actor) => ({ id: actor.id, name: actor.name, canSit: canHoldPost(actor) }));

/**
 * @param {Actor} domain
 * @returns {Actor[]} The world's Knights who could take the Domain or a seat
 *   in its Circle (canHoldPost: knighted and alive), other than its ruler,
 *   whether the ruler is linked to it or only named on it (domainRulerOf, as
 *   the Knight's Posts and the Domain's Worthiness find them).
 */
export function knightsBesidesRuler(domain) {
	const knights = worldKnights();
	const ruler = domainRulerOf(domain, knights);
	return knights.filter((actor) => canHoldPost(actor) && actor.id !== ruler?.id);
}

/**
 * The Domains a Knight may be given a Council seat in from their own sheet:
 * those whoever asks can grant seats in, which is to say owns, other than one
 * the Knight rules, since a ruler doesn't sit on their own Council.
 * @param {Actor} knight
 * @param {Actor[]} [domains] The world's Domains, where the caller has them already.
 * @param {Actor[]} [knights] The world's Knights, likewise.
 * @returns {Actor[]}
 */
export const seatDomains = (knight, domains = worldDomains(), knights = worldKnights()) => domains
	.filter((domain) => domain.isOwner && domainRulerOf(domain, knights)?.id !== knight.id);

/**
 * Everything a Knight holds in any Domain (p20), for their own sheet to list.
 * @param {Actor} knight
 * @param {Actor[]} [domains] The world's Domains, where the caller has them already.
 * @param {Actor[]} [knights] The world's Knights, likewise.
 * @returns {{domain: Actor, posts: import("../rules/court.js").KnightPost[]}[]} Only the Domains where they hold something.
 */
export function postsOfKnight(knight, domains = worldDomains(), knights = worldKnights()) {
	return domains
		.map((domain) => ({ domain, posts: knightPosts(domain, knight, knights) }))
		.filter(({ posts }) => posts.length);
}

/**
 * Who holds a seat now, as the window offering it says: nobody, this Knight,
 * or whoever does.
 * @param {Actor} domain
 * @param {string} seat One of COUNCIL_SEATS.
 * @param {boolean} yours Whether the one being seated holds it.
 * @param {object[]} knights The world's Knights.
 * @returns {string}
 */
function seatDetail(domain, seat, yours, knights) {
	if (yours) return t("posts.seatYours");
	const { council, court } = domain.system;
	if (seat === "circle") {
		const seated = circleKnights(council.circle, knights);
		return seated.length ? t("posts.circleSits", { names: seated.map((each) => each.name).join(", ") }) : t("posts.seatEmpty");
	}
	const holder = seatHolder(council, court, seat);
	return holder ? t("posts.seatHeld", { name: holder.name }) : t("posts.seatEmpty");
}

/**
 * Give a Knight a seat on a Domain's Council from their own sheet (p20). One
 * window lists every Domain they may sit in, each with its five seats and who
 * holds them now. A seat granted to a Retainer goes to the Knight's place in
 * the Court, made for them if they had none; whoever held it before stays in
 * the Court. A Knight holds one seat in a Domain at a time.
 * @param {Actor} knight
 * @returns {Promise<boolean>} Whether they took a seat.
 */
export async function takeCouncilSeat(knight) {
	if (!knight?.isOwner || !canHoldPost(knight)) return false;
	const knights = worldKnights();
	const domains = seatDomains(knight, worldDomains(), knights);
	if (!domains.length) {
		ui.notifications.warn(t("posts.noDomains", { name: knight.name }));
		return false;
	}
	const groups = domains.map((domain) => {
		const held = new Set(knightPosts(domain, knight, knights).map((post) => post.post));
		return {
			name: domain.name,
			seats: COUNCIL_SEATS.map((seat) => ({
				value: `${domain.id}:${seat}`,
				name: seatLabel(seat),
				detail: seatDetail(domain, seat, held.has(seat), knights),
				checked: held.has(seat)
			}))
		};
	});
	// Their seat starts chosen, or else the first on offer.
	if (!groups.some((group) => group.seats.some((seat) => seat.checked))) groups[0].seats[0].checked = true;
	const data = await inputDialog({
		title: t("posts.takeTitle", { name: knight.name }),
		icon: "fa-solid fa-chair",
		template: "council-seat",
		context: { intro: t("posts.takeIntro", { name: knight.name }), domains: groups },
		ok: { label: t("posts.take"), icon: "fa-solid fa-chair" }
	});
	const [domainId, seat] = String(data?.seat ?? "").split(":");
	const domain = domains.find((each) => each.id === domainId);
	if (!domain) return false;
	const plan = await grantCouncilSeat(domain, knight, seat, knights);
	if (!plan) return false;
	if (plan.unseated) ui.notifications.info(t("posts.unseated", { name: plan.unseated, seat: seatLabel(seat), domain: domain.name }));
	return true;
}

/**
 * Take Council Seat's work once the seat is chosen: the Knight is given it,
 * and the Timeline told of a place made in the Court or the Circle joined or left.
 * @param {Actor} domain
 * @param {Actor} knight
 * @param {string} seat One of COUNCIL_SEATS.
 * @param {object[]} [knights] The world's Knights, where the caller has them already.
 * @returns {Promise<ReturnType<typeof seatPlan>|null>} What was done, or null where nothing was.
 */
export async function grantCouncilSeat(domain, knight, seat, knights = worldKnights()) {
	if (!domain?.isOwner || !knight || !COUNCIL_SEATS.includes(seat)) return null;
	const plan = seatPlan(domain.system, knight, seat, knights, () => foundry.utils.randomID(), Date.now());
	if (!Object.keys(plan.updates).length) return null;
	await domain.update(plan.updates);
	if (plan.joined) await timelineCourtJoined(domain, plan.joined.id, plan.joined.member);
	if (plan.circle) await timelineCircle(domain, { [plan.circle]: [{ id: knight.id, name: knight.name, actor: knight }] });
	return plan;
}

/**
 * Take a Knight off a Domain's Council, once it's confirmed: their seat is
 * left empty, and their place in the Court stays theirs.
 * @param {Actor} knight
 * @param {Actor} domain
 * @param {string|null} [seat] The one seat to leave, as a Posts row names it; every one they hold there without.
 * @returns {Promise<boolean>} Whether they left a seat.
 */
export async function leaveCouncilSeat(knight, domain, seat = null) {
	if (!knight || domain?.type !== "domain" || !domain.isOwner) return false;
	const plan = leavePlan(domain.system, knight, worldKnights(), seat || null);
	if (!plan.seats.length) return false;
	const confirmed = await confirmDialog({
		title: t("posts.leave"),
		icon: "fa-solid fa-chair",
		message: t("posts.leaveConfirm", { name: escapeHTML(knight.name), seat: plan.seats.map(seatLabel).join(", "), domain: escapeHTML(domain.name) })
	});
	if (!confirmed) return false;
	await domain.update(plan.updates);
	if (plan.circle) await timelineCircle(domain, { left: [{ id: knight.id, name: knight.name, actor: knight }] });
	return true;
}

/**
 * @param {string} id A Knight's actor id.
 * @returns {boolean} Whether that Knight is Slain, so no longer sits anywhere.
 */
export const slainKnight = (id) => Boolean(id && game.actors.find((actor) => actor.id === id)?.system?.slain);

/**
 * @param {Actor} domain
 * @param {string} [except] The id of somebody to leave out, such as the one being written of.
 * @returns {string[]} The names of those in the Domain's Court.
 */
const courtNames = (domain, except) => Object.entries(normalizeCourt(domain.system.court))
	.filter(([id, member]) => id !== except && member.name)
	.map(([, member]) => member.name);

/**
 * Tick a Knight's worthiness of their post in a Domain proven, or untick it
 * (Worthiness, p6): proven, the opposition they faced is behind them. The
 * Referee's to say.
 * @param {Actor} domain
 * @param {string} knightId
 * @param {boolean} proven
 * @returns {Promise<boolean>} Whether it was written.
 */
export async function setWorthinessProven(domain, knightId, proven) {
	if (!game.user.isGM || domain?.type !== "domain" || !knightId) return false;
	const before = domain.system.proven ?? [];
	const after = withProven(before, knightId, proven);
	if (after.length === before.length && after.every((id) => before.includes(id))) return false;
	await domain.update({ "system.proven": after });
	return true;
}

/**
 * @param {Actor} domain
 * @param {Actor} knight
 * @returns {boolean} Whether the Knight already holds a place in the Domain's Court, found by id or by a name only they go by.
 */
export const sitsAtCourt = (domain, knight) => courtPlacesOf(domain.system?.court, knight, worldKnights()).length > 0;

/**
 * Take somebody new into the Court.
 * @param {Actor} domain
 * @param {string} role One of COURT_ROLES.
 * @param {{name?: string, note?: string, knight?: string}} [fields] What's already known of them,
 *   with the id of the Knight they are where a Knight joins.
 * @returns {Promise<string|null>} Their id, or null for a role the Court doesn't have.
 */
export async function addCourtMember(domain, role, fields = {}) {
	if (!COURT_ROLES.includes(role) || !domain?.isOwner) return null;
	const member = { ...newCourtMember(role, Date.now()), ...fields };
	const id = foundry.utils.randomID();
	await domain.update({ [`system.court.${id}`]: member });
	if (member.name) await timelineCourtJoined(domain, id, member);
	return id;
}

/**
 * Ask who somebody of the Court is: their role, name, the seat they serve,
 * their leverage and a note.
 * @param {import("../rules/court.js").CourtMember} member As they stand.
 * @param {string} held The seat they hold themselves, if any.
 * @param {{title: string, ok: string, others?: string[], domain?: Actor}} wording `others` are
 *   the rest of the Court's names, which the name's die rolls only once no other is left.
 *   `domain` is the Court's, whose Realm's Seers the die offers a Seer.
 * @returns {Promise<object|null>} The answers, or null if the window was closed.
 */
async function askAboutMember(member, held, { title, ok, others = [], domain = null }) {
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
			// Leverage over the ruler is the Referee's to know (p21): a player's window leaves it out, and keeps it.
			leverageShown: Boolean(game.user?.isGM),
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
			offerBookNames(dialog, others, domain);
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
 * The Seers whose Sanctums stand in the Realm where the Domain rules its Holding,
 * by name: those who may visit its Court (p20). The Realm's Landmarks are the
 * Referee's to know (p14), so only they are offered them, and a Referee playing
 * alone only those whose Sanctums have been found.
 * @param {Actor|null} domain
 * @returns {Promise<string[]>} Empty where there's no such Realm, or no Seer the book names in it.
 */
export async function realmSeerNames(domain) {
	if (!domain || !game.user?.isGM) return [];
	const index = await loadArtIndex();
	if (!index?.seers?.length) return [];
	// Loaded only when asked, as the Realm's modules lead back to the Court's.
	const [{ domainHolding }, { getRealm }, { realmKnown }] = await Promise.all([import("./homecoming.js"), import("./realm.js"), import("./solo.js")]);
	const scene = domainHolding(domain)?.scene;
	const realm = scene ? realmKnown(getRealm(scene)?.realm, scene) : null;
	const seers = seersSanctums(realm).map((landmark) => seerEntry(index, landmark.seer));
	return [...new Set(seers.filter((seer) => seer.entry).map((seer) => seer.name))];
}

/**
 * Let the die beside the name fill it with one of the book's names: never the
 * name already there, nor another of the Court's while any is left. A Seer is
 * given one of the Realm's Seers, while it has any.
 * @param {foundry.applications.api.DialogV2} dialog
 * @param {string[]} others The rest of the Court's names.
 * @param {Actor|null} [domain] The Court's.
 */
function offerBookNames(dialog, others, domain = null) {
	const input = dialog.element.querySelector("[name='name']");
	const role = dialog.element.querySelector("[name='role']");
	dialog.element.querySelector("[data-roll-name]")?.addEventListener("click", async () => {
		const seers = role?.value === "seer" ? await realmSeerNames(domain) : [];
		const name = rollFreeName(seers.length ? seers : await namesFromTheBook(), Math.random, [input?.value, ...others]);
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
		leverage: data.leverage ?? member.leverage,
		note: data.note,
		at: member.at,
		// Still the Knight they were seated as, unless they're renamed as somebody else.
		knight: isSameName(data.name, member.name) ? member.knight : ""
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
	const data = await askAboutMember(fresh, "", { title: t("domain.court.addTitle"), ok: t("domain.court.add"), others: courtNames(domain), domain });
	const member = data ? memberFromAnswers(data, fresh) : null;
	if (!member) return null;
	const id = foundry.utils.randomID();
	await domain.update({ [`system.court.${id}`]: member });
	await timelineCourtJoined(domain, id, member);
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
		others: courtNames(domain, id),
		domain
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
	return removeFromCourt(domain, id);
}

/**
 * Let Go's work once it's confirmed: they leave the Court, and any seat on the
 * Council they held, and one who was named leaves it on the Timeline.
 * @param {Actor} domain
 * @param {string} id
 * @returns {Promise<boolean>} Whether they left.
 */
export async function removeFromCourt(domain, id) {
	const member = normalizeCourt(domain?.system.court)[id];
	if (!member || !domain.isOwner) return false;
	const held = seatOf(domain.system.council, id);
	await domain.update({
		...deletionUpdate(`system.court.${id}`),
		...(held ? { [`system.council.${held}`]: "" } : {})
	});
	if (member.name) await timelineCourtLeft(domain, id, member);
	return true;
}

/**
 * Choose which Knights sit in a Domain's Circle (p20), from the world's
 * Knights other than its ruler that whoever chooses can see. Those already
 * seated stay offered, so seeing fewer never unseats one.
 * @param {Actor} domain
 * @param {object} [options]
 * @param {string|null} [options.intro] Said in place of the usual line, such as Knights leaving in misrule.
 * @returns {Promise<boolean>} Whether the Circle was changed.
 */
export async function seatCircle(domain, { intro = null } = {}) {
	if (!domain?.isOwner) return false;
	const knights = knightChoices();
	const seated = circleKnights(domain.system.council.circle, knights);
	const besides = new Set(knightsBesidesRuler(domain).map((actor) => actor.id));
	const offered = knights.filter((knight) => (besides.has(knight.id) && game.actors.get(knight.id)?.visible)
		|| seated.some((each) => each.id === knight.id));
	// A Knight Slain since they were seated is offered unticked, so saving lets them go from the Circle.
	const sits = (knight) => seated.some((each) => each.id === knight.id) && !slainKnight(knight.id);
	// Names written in by hand before the Circle held Knights stay offered, ticked, so they go only when unticked.
	const written = seated.filter((each) => each.legacy).map((each, index) => ({ key: `written${index}`, name: each.name }));
	const data = await inputDialog({
		title: t("domain.council.circle.title"),
		icon: "fa-solid fa-users",
		template: "circle",
		context: {
			intro: intro ?? t("domain.council.circle.intro", { name: domain.name }),
			circle: [
				...offered.map((knight) => ({
					...knight,
					name: slainKnight(knight.id) ? t("domain.council.circle.slainName", { name: knight.name }) : knight.name,
					checked: sits(knight)
				})),
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
	// Only the Knights this choice seated or unseated: names written in by hand have no thread.
	const sat = (knight) => seated.some((each) => !each.legacy && each.id === knight.id);
	const withActor = (knight) => ({ ...knight, actor: game.actors.get(knight.id) ?? null });
	await timelineCircle(domain, {
		joined: offered.filter((knight) => chosen[knight.id] && !sat(knight)).map(withActor),
		left: offered.filter((knight) => !chosen[knight.id] && sat(knight)).map(withActor)
	});
	return true;
}

/**
 * Before the Council was filled from the Court, its seats were names written
 * in by hand. Each of those becomes a Retainer holding the seat, and each name
 * in a Circle becomes its Knight, so no Domain loses who sits on its Council.
 */
export async function seatCouncilRetainers() {
	const knights = knightChoices();
	const now = Date.now();
	const updates = game.actors
		.filter((actor) => actor.type === "domain")
		.map((domain) => ({ _id: domain.id, ...councilSeatPlan(domain.system, knights, () => foundry.utils.randomID(), now) }))
		.filter((update) => Object.keys(update).length > 1);
	if (updates.length) await Actor.implementation.updateDocuments(updates);
}
