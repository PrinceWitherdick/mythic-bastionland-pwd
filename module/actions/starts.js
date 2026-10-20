import { loadArtIndex, mythEntry } from "../book-art/art-index.js";
import { postCard, registerCardButtons, t, warn } from "../chat/cards.js";
import { OMEN_COUNT, REALM_FLAG } from "../rules/realm.js";
import { nextOmen, wildernessSituation } from "../rules/wilderness.js";
import { SYSTEM_ID } from "../system-id.js";
import { getRealm, isRealmScene, sceneGeometry } from "./realm.js";
import { rollSpark } from "./referee-rolls.js";
import { offerRulerDomain, seatCourtiers, seatName, seatOfPower } from "./found-domain.js";
import { omensMet } from "./timeline-events.js";

/**
 * What the Start the players chose sets going once the Realm is made (p6),
 * besides where the Company begins. Courtiers take their places at the Seat's
 * Court, which hears news of the nearest Myth's first Omen; something wicked
 * has hold of a Ruler's Seat of Power. The news is whispered to the Referee.
 * @param {Scene} scene The Realm.
 * @param {string} start One of COMPANY_STARTS.
 * @returns {Promise<ChatMessage|null>}
 */
export async function announceStart(scene, start) {
	if (!game.user.isGM || !isRealmScene(scene)) return null;
	if (start === "courtier") {
		const card = await courtNews(scene);
		// The Knights hold their places at the Seat's Court, or once they're made, at the Referee's word.
		if (!await seatCourtiers(scene)) await offerSeatingLater(scene);
		return card;
	}
	if (start === "ruler") {
		const card = await wickedInfluence();
		// One Knight rules, and the others sit in their Circle.
		await offerRulerDomain(scene);
		return card;
	}
	return null;
}

/** Marks the Referee's button that seats the Knights at Court later. */
const SEAT_LATER_SELECTOR = "[data-seat-courtiers]";

/**
 * A Realm with a Seat of Power made before there were Knights to seat at its
 * Court: whisper the Referee a card whose button seats them once they're made.
 * @param {Scene} scene
 * @returns {Promise<ChatMessage|null>} Null in a Realm with no Seat.
 */
async function offerSeatingLater(scene) {
	const seat = seatOfPower(scene);
	if (!seat) return null;
	return postCard(null, "note", {
		icon: "fa-solid fa-chess-king",
		text: t("company.starts.courtier.later", { seat: seatName(seat) }),
		action: { data: "seat-courtiers", icon: "fa-solid fa-user-plus", label: t("company.starts.courtier.seatNow") }
	},{ mode: "gm", flags: { [SYSTEM_ID]: { seatCourtiers: scene.id } } });
}

/** Wire up the Referee's button that seats the Knights at Court later. Called during init. */
export function registerSeatingLater() {
	registerCardButtons({
		selector: SEAT_LATER_SELECTOR,
		gmOnly: true,
		handler: async (_button, message) => {
			const scene = game.scenes.get(message?.flags?.[SYSTEM_ID]?.seatCourtiers ?? "");
			if (!scene) return warn("company.starts.courtier.realmGone");
			if (!seatOfPower(scene)) return warn("company.starts.courtier.seatGone");
			// Nobody is seated twice, so a second click only seats Knights made since.
			return (await seatCourtiers(scene)) ?? warn("company.starts.courtier.noKnights");
		}
	});
}

/**
 * Courtier (p6): the Court hears of the nearest Myth's first Omen. The Myth
 * nearest the Seat of Power shows its first Omen, which counts as met.
 * @param {Scene} scene
 * @returns {Promise<ChatMessage|null>}
 */
async function courtNews(scene) {
	const { realm } = getRealm(scene);
	const seat = realm.holdings.find((holding) => holding.seat);
	if (!seat || !realm.myths.length) return null;
	const { nearest } = wildernessSituation(realm, sceneGeometry(scene), seat.hex);
	const myth = nearest[Math.floor(Math.random() * nearest.length)];
	const next = myth ? nextOmen(myth) : null;
	if (!next || next.complete) return null;
	const { omen } = next;
	// Written straight to the Tile rather than through editRealm, so Undo doesn't take it back.
	// The Tile hooks in omens.js write its row on the Timeline, as news heard at the Seat.
	await scene.updateEmbeddedDocuments("Tile", [{ _id: myth.id, [`flags.${SYSTEM_ID}.${REALM_FLAG}.omen`]: omen }], omensMet({ hex: seat.hex, news: true }));

	const { name, page, entry } = mythEntry(await loadArtIndex(), myth);
	return postCard(null, "omen", {
		title: t("company.starts.courtier.newsTitle"),
		tagline: page ? t("company.starts.courtier.newsTagline", { name, page }) : name,
		img: entry?.path ?? null,
		omen: t("realm.wilderness.omen", { omen, count: OMEN_COUNT }),
		text: entry?.omens?.[omen - 1] ?? null,
		hint: t("company.starts.courtier.newsHint")
	}, { mode: "gm" });
}

/**
 * Ruler (p6): one Knight rules a Holding with the others in their Circle, and
 * something wicked has hold of the Seat of Power. What it is the Woe Spark
 * Table suggests, once Import PDF has brought it in.
 * @returns {Promise<ChatMessage>}
 */
async function wickedInfluence() {
	const index = await loadArtIndex();
	const table = index?.spark?.find((page) => page.key === "civilisation")?.tables.find((candidate) => /^woe$/i.test(candidate.name));
	const spark = table ? await rollSpark(table) : null;
	return postCard(null, "omen", {
		title: t("company.starts.ruler.influenceTitle"),
		tagline: t("company.starts.ruler.influenceTagline"),
		omen: spark ? t("company.starts.ruler.influencePrompt", { prompt: spark.prompt }) : t("company.starts.ruler.influenceNoPrompt"),
		text: null,
		hint: t("company.starts.ruler.influenceHint")
	}, { rolls: spark ? [spark.roll] : [], mode: "gm" });
}
