import { loadArtIndex, mythEntry } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import { OMEN_COUNT, REALM_FLAG } from "../rules/realm.js";
import { nextOmen, wildernessSituation } from "../rules/wilderness.js";
import { SYSTEM_ID } from "../system-id.js";
import { getRealm, isRealmScene, sceneGeometry } from "./realm.js";
import { rollSpark } from "./referee-rolls.js";
import { offerRulerDomain } from "./found-domain.js";

/**
 * What the Start the players chose sets going once the Realm is made (p6),
 * besides where the Company begins. A Courtier's Court hears the first Omen of
 * the nearest Myth as news; a Ruler's Seat of Power is under a wicked
 * influence. Whispered to the Referee.
 * @param {Scene} scene The Realm.
 * @param {string} start One of COMPANY_STARTS.
 * @returns {Promise<ChatMessage|null>}
 */
export async function announceStart(scene, start) {
	if (!game.user.isGM || !isRealmScene(scene)) return null;
	if (start === "courtier") return courtNews(scene);
	if (start === "ruler") {
		const card = await wickedInfluence();
		// "One Knight rules a Holding, the others are in their Circle."
		await offerRulerDomain(scene);
		return card;
	}
	return null;
}

/**
 * Courtier (p6): "The first Omen of the nearest Myth is delivered as news to
 * the Court." The Myth nearest the Seat of Power shows its first Omen, which
 * counts as met.
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
	await scene.updateEmbeddedDocuments("Tile", [{ _id: myth.id, [`flags.${SYSTEM_ID}.${REALM_FLAG}.omen`]: omen }]);

	const { name, page, entry } = mythEntry(await loadArtIndex(), myth);
	return postCard(null, "omen", {
		title: t("company.starts.courtier.newsTitle"),
		tagline: t("company.starts.courtier.newsTagline", { name, page }),
		img: entry?.path ?? null,
		omen: t("realm.wilderness.omen", { omen, count: OMEN_COUNT }),
		text: entry?.omens?.[omen - 1] ?? null,
		hint: t("company.starts.courtier.newsHint")
	}, { mode: "gm" });
}

/**
 * Ruler (p6): "One Knight rules a Holding, the others are in their Circle. The
 * Seat of Power is under a wicked influence." What the influence is the Woe
 * Spark Table suggests, once Import PDF has brought it in.
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
