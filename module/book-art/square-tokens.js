import { SYSTEM_ID } from "../system-id.js";
import { ART_ROOT, INDEX_FILE, WEBP_QUALITY, tokenFile } from "../rules/book-art.js";
import { portraitTokens, tokenCrop } from "../rules/knight-tokens.js";
import { loadArtIndex } from "./art-index.js";
import { ensureDirectories, uploadFile } from "./files.js";
import { canvasToBlob, imageFormat } from "./pdf.js";

/**
 * Swap each Knight's portrait for its square token wherever a token still
 * shows the portrait: Knights' prototype tokens, and Knight tokens already
 * on a scene. Token art chosen by hand is left alone. GMs only.
 * @param {object} index
 * @returns {Promise<{actors: number, tokens: number}>} How many of each changed.
 */
export async function useSquareTokens(index) {
	const squares = portraitTokens(index.knights);
	if (!squares.size) return { actors: 0, tokens: 0 };

	const actorUpdates = game.actors
		.filter((actor) => actor.type === "knight" && squares.has(actor.prototypeToken.texture.src))
		.map((actor) => ({ _id: actor.id, "prototypeToken.texture.src": squares.get(actor.prototypeToken.texture.src) }));
	if (actorUpdates.length) await Actor.implementation.updateDocuments(actorUpdates);

	const sceneUpdates = game.scenes
		.map((scene) => [scene, scene.tokens
			.filter((token) => token.actor?.type === "knight" && squares.has(token.texture.src))
			.map((token) => ({ _id: token.id, "texture.src": squares.get(token.texture.src) }))])
		.filter(([, updates]) => updates.length);
	await Promise.all(sceneUpdates.map(([scene, updates]) => scene.updateEmbeddedDocuments("Token", updates)));
	return { actors: actorUpdates.length, tokens: sceneUpdates.reduce((sum, [, updates]) => sum + updates.length, 0) };
}

/**
 * @param {string} path Under Foundry's Data path.
 * @returns {Promise<HTMLImageElement>}
 */
async function loadImage(path) {
	const image = new Image();
	image.src = foundry.utils.getRoute(path);
	await image.decode();
	return image;
}

/**
 * Cut the square token from each saved Knight portrait that hasn't one yet,
 * as an import from before tokens were cut left them, and write them into the
 * index. The portraits already saved are used, so the rulebook isn't needed.
 * @param {object} index Changed in place.
 * @returns {Promise<number>} How many were cut.
 */
async function cutMissingTokens(index) {
	const missing = (index.knights ?? []).filter((entry) => entry?.path && !entry.token);
	if (!missing.length) return 0;

	const format = await imageFormat();
	const dir = tokenFile(1, 1, null, format.extension).dir;
	await ensureDirectories([dir]);
	let cut = 0;
	for (const entry of missing) {
		const canvas = document.createElement("canvas");
		try {
			const image = await loadImage(entry.path);
			const { x, y, size } = tokenCrop({ width: image.naturalWidth, height: image.naturalHeight }, entry.roll);
			canvas.width = canvas.height = size;
			canvas.getContext("2d").drawImage(image, x, y, size, size, 0, 0, size, size);
			const blob = await canvasToBlob(canvas, format.type, WEBP_QUALITY);
			const { fileName } = tokenFile(entry.d6, entry.d12, entry.name, format.extension);
			const path = blob && await uploadFile(dir, new File([blob], fileName, { type: format.type }));
			if (path) {
				entry.token = path;
				cut++;
			}
		} catch (error) {
			console.error(`${SYSTEM_ID} | Couldn't cut a square token from ${entry.path}`, error);
		} finally {
			canvas.width = canvas.height = 0;
		}
	}
	if (cut) await uploadFile(ART_ROOT, new File([JSON.stringify(index, null, "\t")], INDEX_FILE, { type: "application/json" }));
	return cut;
}

/**
 * Give every Knight a square token: cut any the art index lacks, then swap
 * them in wherever a Knight's token still shows the tall portrait. The active
 * GM runs it on each load, which is cheap once everything is square.
 */
export async function squareKnightTokens() {
	if (!game.user.isGM || !game.users.activeGM?.isSelf) return;
	try {
		const index = await loadArtIndex();
		if (!index) return;
		await cutMissingTokens(index);
		await useSquareTokens(index);
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't give Knights their square tokens`, error);
	}
}
