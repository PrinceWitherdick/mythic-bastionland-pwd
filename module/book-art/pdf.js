import { WEBP_QUALITY, rgbaPixels } from "../rules/book-art.js";
import { imageBox, trackImageTransforms } from "../rules/realm-icons.js";
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
 * @param {object} [options]
 * @param {boolean} [options.boxes] Also give where each picture lands on the page, from imageBox.
 * @returns {Promise<{key: string|null, width: number, height: number, inline?: object, box?: object}[]>}
 */
export async function listPageImages(page, OPS, { boxes = false } = {}) {
	const { fnArray, argsArray } = await page.getOperatorList();
	return trackImageTransforms(fnArray, argsArray, OPS)
		.map(({ matrix, ...image }) => (boxes ? { ...image, box: imageBox(matrix, page.view) } : image));
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
 * @param {(pixels: Uint8ClampedArray) => Uint8ClampedArray} [transform] Changes the RGBA pixels before drawing.
 * @returns {HTMLCanvasElement|null} Null when pdf.js used a pixel layout this can't read.
 */
function imageToCanvas(image, transform = (pixels) => pixels) {
	const pixels = rgbaPixels(image);
	if (!pixels) return null;
	const canvas = document.createElement("canvas");
	canvas.width = image.width;
	canvas.height = image.height;
	canvas.getContext("2d").putImageData(new ImageData(transform(pixels), image.width, image.height), 0, 0);
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
function canvasToBlob(canvas, type, quality) {
	return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Decode, encode and upload one picture from listPageImages.
 * @param {object} page
 * @param {object} image
 * @param {object} target
 * @param {string} target.dir      Folder under Data.
 * @param {string} target.fileName
 * @param {{type: string}} target.format From imageFormat.
 * @param {(pixels: Uint8ClampedArray) => Uint8ClampedArray} [target.transform] Changes the pixels first.
 * @returns {Promise<{path?: string, reason?: string}>}
 */
export async function saveImage(page, image, { dir, fileName, format, transform }) {
	let canvas = null;
	let blob = null;
	try {
		canvas = imageToCanvas(await resolveImage(page, image), transform);
		if (canvas) blob = await canvasToBlob(canvas, format.type, WEBP_QUALITY);
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't read the picture for ${fileName}`, error);
	} finally {
		freeCanvas(canvas);
	}
	if (!blob) return { reason: "decode" };

	const path = await uploadFile(dir, new File([blob], fileName, { type: format.type }));
	return path ? { path } : { reason: "upload" };
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
