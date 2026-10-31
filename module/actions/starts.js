import { loadArtIndex, mythEntry, seerEntry } from "../book-art/art-index.js";
import { postCard, registerCardButtons, t, warn } from "../chat/cards.js";
import { OMEN_COUNT, REALM_FLAG } from "../rules/realm.js";
import { nextOmen, wildernessSituation } from "../rules/wilderness.js";
import { SYSTEM_ID } from "../system-id.js";
import { isRealmScene, sceneGeometry } from "./realm.js";
import { liveRealm } from "./myth-notes.js";
import { rollSpark } from "./referee-rolls.js";
import { offerRulerDomain, seatCourtiers, seatName, seatOfPower } from "./found-domain.js";
import { omensMet } from "./timeline-events.js";
import { companyPlacementDone } from "../canvas/company-placement.js";
import { hexLabel } from "./hex-names.js";
import { keptFromMe } from "./solo.js";
import { rollBetween, tiedHint } from "./tie-roll.js";

/**
 * What the Start the players chose sets going once the Realm is made (p6),
 * besides where the Company begins. Courtiers take their places at the Seat's
 * Court, which hears news of the nearest Myth's first Omen; something wicked
 * has hold of a Ruler's Seat of Power; Wanderers who lack direction may seek a
 * Seer's counsel. All of it is whispered to the Referee. A Realm with no Seat
 * of Power yet holds the Court's news back until one is crowned.
 * @param {Scene} scene The Realm.
 * @param {string} start One of COMPANY_STARTS.
 * @returns {Promise<ChatMessage|null>}
 */
export async function announceStart(scene, start) {
	if (!game.user.isGM || !isRealmScene(scene)) return null;
	if (start === "courtier") {
		if (!seatOfPower(scene)) return holdCourtNews(scene);
		const card = await courtNews(scene);
		// The Knights hold their places at the Seat's Court, or once they're made, at the Referee's word.
		if (!await seatCourtiers(scene)) await offerSeatingLater(scene);
		return card;
	}
	if (start === "ruler") {
		const card = await wickedInfluence();
		// One Knight rules, and the others sit in their Circle: in the Holding the Company is put down in, once it is.
		await companyPlacementDone();
		await offerRulerDomain(scene);
		return card;
	}
	if (start === "wanderer") return seekCounsel(scene);
	return null;
}

/**
 * Wanderer (p6): Knights who lack direction may seek a Seer's counsel, so the
 * Referee is told which Seers the Realm's Sanctums are home to.
 * @param {Scene} scene
 * @returns {Promise<ChatMessage|null>} Null played alone, where the Sanctums are still to be found.
 */
async function seekCounsel(scene) {
	if (keptFromMe()) return null;
	const index = await loadArtIndex();
	const sanctums = liveRealm(scene).landmarks.filter((landmark) => landmark.type === "sanctum" && landmark.seer);
	const seers = sanctums.map((landmark) => t("company.starts.wanderer.seerAt", { seer: seerEntry(index, landmark.seer).name, hex: hexLabel(landmark.hex, scene) }));
	return postCard(null, "note", {
		icon: "fa-solid fa-eye",
		text: seers.length ? t("company.starts.wanderer.counsel", { seers: seers.join("; ") }) : t("company.starts.wanderer.noSanctum")
	}, { mode: "gm" });
}

/** Marks the Referee's button that delivers the Court's news once there's a Seat of Power. */
const HELD_NEWS_SELECTOR = "[data-court-news]";

/**
 * A Courtier Start on a Realm with no Seat of Power yet, such as one whose
 * Holdings are still to be drawn: the Court's news and the Knights' places
 * wait, and the Referee is whispered a card to deliver them once a Holding
 * is crowned.
 * @param {Scene} scene
 * @returns {Promise<ChatMessage|null>}
 */
function holdCourtNews(scene) {
	return postCard(null, "note", {
		icon: "fa-solid fa-chess-king",
		text: t("company.starts.courtier.held"),
		action: { data: "court-news", icon: "fa-solid fa-scroll", label: t("company.starts.courtier.deliver") }
	}, { mode: "gm", flags: { [SYSTEM_ID]: { courtNews: scene.id } } });
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

/** Wire up the Referee's buttons that seat the Knights at Court, or deliver the Court's news, later. Called during init. */
export function registerSeatingLater() {
	registerCardButtons({
		selector: HELD_NEWS_SELECTOR,
		gmOnly: true,
		// Spent once delivered: a second press would bring the Court a second Omen.
		once: true,
		handler: async (_button, message) => {
			const scene = game.scenes.get(message?.flags?.[SYSTEM_ID]?.courtNews ?? "");
			// A warning leaves the button to be pressed again.
			if (!scene) {
				warn("company.starts.courtier.realmGone");
				return false;
			}
			if (!seatOfPower(scene)) {
				warn("company.starts.courtier.noSeatYet");
				return false;
			}
			await announceStart(scene, "courtier");
			return true;
		}
	});
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
	// A resolved Myth shows no more Omens, so the Court hears nothing of it (p27).
	const realm = liveRealm(scene);
	const seat = realm.holdings.find((holding) => holding.seat);
	if (!seat || !realm.myths.length) return null;
	const { nearest } = wildernessSituation(realm, sceneGeometry(scene), seat.hex);
	// Myths equally near are chosen between by a roll the Referee sees, as the Wilderness roll does.
	const { pick, shown } = await rollBetween(nearest.length);
	const myth = nearest[pick];
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
		hint: [
			...(shown ? [tiedHint(nearest)] : []),
			t("company.starts.courtier.newsHint")
		].join(" ")
	}, { rolls: shown ? [shown] : [], mode: "gm" });
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
