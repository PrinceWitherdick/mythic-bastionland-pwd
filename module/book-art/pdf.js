import { WEBP_QUALITY, paintedImages, rgbaPixels } from "../rules/book-art.js";
import { SYSTEM_ID } from "../system-id.js";
import { uploadFile } from "./files.js";

/** How long to wait for pdf.js to hand over one decoded image. */
const RESOLVE_TIMEOUT_MS = 30_000;

let pdfjsPromise = null;

/**
 * Foundry's own copy of pdf.js, loaded the first time it's needed.
 * @returns {Promise<object>} The pdf.js module.
 */
function loadPdfjs() {
	pdfjsPromise ??= (async () => {
		const pdfjs = await import(foundry.utils.getRoute("/scripts/pdfjs/build/pdf.mjs"));
		pdfjs.GlobalWorkerOptions.workerSrc = foundry.utils.getRoute("/scripts/pdfjs/build/pdf.worker.mjs");
		return pdfjs;
	})().catch((error) => {
		pdfjsPromise = null;
		throw error;
	});
	return pdfjsPromise;
}

/**
 * Open a PDF the user picked. It is read in the browser and never uploaded.
 * @param {File} file
 * @returns {Promise<{pdf: object, OPS: object}>} The document and pdf.js operator codes.
 */
export async function openPdf(file) {
	const pdfjs = await loadPdfjs();
	const task = pdfjs.getDocument({
		data: new Uint8Array(await file.arrayBuffer()),
		// Without OffscreenCanvas pdf.js hands back raw pixels instead of an ImageBitmap.
		isOffscreenCanvasSupported: false,
		isEvalSupported: false
	});
	try {
		return { pdf: await task.promise, OPS: pdfjs.OPS };
	} catch (error) {
		await task.destroy();
		throw error;
	}
}

/**
 * Every image a page paints, in drawing order. Sizes come from the operator
 * list, so nothing has to be decoded to tell the art from the backgrounds.
 * @param {object} page A pdf.js page.
 * @param {object} OPS  pdf.js operator codes.
 * @returns {Promise<{key: string|null, width: number, height: number, inline?: object}[]>}
 */
export async function listPageImages(page, OPS) {
	const { fnArray, argsArray } = await page.getOperatorList();
	return paintedImages(fnArray, argsArray, OPS);
}

/**
 * The decoded pixels of an image from listPageImages. pdf.js keeps images
 * shared between pages in `commonObjs` under a `g_` id; waiting for one in
 * `objs` would never finish.
 * @param {object} page
 * @param {{key: string|null, inline?: object}} image
 * @returns {Promise<{width: number, height: number, data: Uint8ClampedArray, kind: number}>}
 */
function resolveImage(page, image) {
	if (image.inline) return Promise.resolve(image.inline);
	const pool = image.key.startsWith("g_") ? page.commonObjs : page.objs;
	if (pool.has(image.key)) return Promise.resolve(pool.get(image.key));

	let timer;
	return Promise.race([
		new Promise((resolve) => pool.get(image.key, resolve)),
		new Promise((_resolve, reject) => {
			timer = setTimeout(() => reject(new Error(`Timed out waiting for image ${image.key}`)), RESOLVE_TIMEOUT_MS);
		})
	]).finally(() => clearTimeout(timer));
}

/**
 * @param {object} image Decoded pixels from resolveImage.
 * @returns {HTMLCanvasElement|null} Null when pdf.js used a pixel layout this can't read.
 */
function imageToCanvas(image) {
	const pixels = rgbaPixels(image);
	if (!pixels) return null;
	const canvas = document.createElement("canvas");
	canvas.width = image.width;
	canvas.height = image.height;
	canvas.getContext("2d").putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
	return canvas;
}

/**
 * Release a canvas's pixels now rather than whenever it is collected.
 * @param {HTMLCanvasElement|null} canvas
 */
function freeCanvas(canvas) {
	if (!canvas) return;
	canvas.width = 0;
	canvas.height = 0;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} type
 * @param {number} [quality]
 * @returns {Promise<Blob|null>}
 */
export function canvasToBlob(canvas, type, quality) {
	return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * @param {HTMLCanvasElement} source
 * @param {{x: number, y: number, size: number}} crop In pixels.
 * @returns {HTMLCanvasElement} A square cut from the canvas.
 */
function cropSquare(source, { x, y, size }) {
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	canvas.getContext("2d").drawImage(source, x, y, size, size, 0, 0, size, size);
	return canvas;
}

/**
 * @typedef {object} ImageTarget
 * @property {string} dir      Folder under Data.
 * @property {string} fileName
 * @property {{x: number, y: number, size: number}} [crop] Saves only this square of the picture.
 */

/**
 * Decode one picture from listPageImages once, then encode and upload it to
 * each target in turn, such as a portrait and the token cut from it. Once one
 * fails, the targets after it are skipped and left empty.
 * @param {object} page
 * @param {object} image
 * @param {ImageTarget[]} targets
 * @param {object} options
 * @param {{type: string}} options.format From imageFormat.
 * @returns {Promise<{path?: string, reason?: string}[]>} One for each target.
 */
export async function saveImages(page, image, targets, { format }) {
	let canvas = null;
	try {
		canvas = imageToCanvas(await resolveImage(page, image));
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't read the picture for ${targets[0]?.fileName}`, error);
	}

	const results = [];
	try {
		for (const { dir, fileName, crop } of targets) {
			if (results.some((result) => result.reason)) {
				results.push({});
				continue;
			}
			let piece = null;
			let blob = null;
			try {
				piece = canvas && crop ? cropSquare(canvas, crop) : canvas;
				if (piece) blob = await canvasToBlob(piece, format.type, WEBP_QUALITY);
			} catch (error) {
				console.error(`${SYSTEM_ID} | Couldn't read the picture for ${fileName}`, error);
			} finally {
				if (piece !== canvas) freeCanvas(piece);
			}
			if (!blob) {
				results.push({ reason: "decode" });
				continue;
			}
			const path = await uploadFile(dir, new File([blob], fileName, { type: format.type }));
			results.push(path ? { path } : { reason: "upload" });
		}
	} finally {
		freeCanvas(canvas);
	}
	return results;
}

/**
 * WebP where the browser can write it, otherwise PNG. Both keep transparency.
 * @returns {Promise<{extension: string, type: string}>}
 */
export async function imageFormat() {
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	const blob = await canvasToBlob(canvas, "image/webp");
	freeCanvas(canvas);
	return blob?.type === "image/webp" ? { extension: "webp", type: "image/webp" } : { extension: "png", type: "image/png" };
}
