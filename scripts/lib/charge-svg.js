/**
 * Cleans a charge drawn for the Book of Traceable Heraldic Art down to the two
 * colours the heraldry painter tints: CHARGE_FILL where the charge takes its
 * tincture and CHARGE_LINE for its lines. Used by scripts/heraldry-charges.js
 * and scripts/realm-armorial-art.js.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mapNodesToParents, optimize } from "svgo";
import { CHARGE_FILL, CHARGE_LINE, HERALDIC_ART } from "../../module/rules/heraldry-charges.js";
import { escapeHTML } from "../../module/rules/text.js";

/** Where fetched drawings are kept, so running a script again works offline. */
const CACHE = join(import.meta.dirname, "..", "..", "node_modules", ".cache", "heraldry-charges");

/**
 * A drawing from the Book of Traceable Heraldic Art, from the cache unless
 * asked to fetch it again.
 * @param {string} svg The drawing's path on the site.
 * @param {object} options
 * @param {string} options.agent The script asking, for the User-Agent.
 * @param {boolean} [options.refresh] Fetch it even if it's cached.
 * @returns {Promise<string>}
 */
export async function fetchDrawing(svg, { agent, refresh = false }) {
	const path = join(CACHE, ...svg.split("/"));
	if (!refresh && existsSync(path)) return readFileSync(path, "utf8");
	const response = await fetch(`${HERALDIC_ART}${svg}`, { headers: { "User-Agent": `mythic-bastionland-pwd ${agent}` } });
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const text = await response.text();
	if (!text.includes("<svg")) throw new Error("Not an SVG");
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
	return text;
}

/** The only fill and stroke values a cleaned charge may use. */
export const CHARGE_PAINTS = Object.freeze([CHARGE_FILL, CHARGE_LINE, "none"]);

/** Elements a leftover picture's frame is built from in the source drawings. */
const RIG_ELEMENTS = new Set(["g", "rect", "clipPath", "use", "image", "title", "desc"]);

/**
 * @param {string} value A fill or stroke as the drawing gives it.
 * @returns {{paint: string, flattened: boolean}|null} What it becomes, or null for a colour a charge can't have.
 */
function chargePaint(value) {
	const paint = value.trim().toLowerCase();
	if (paint === "none") return { paint, flattened: false };
	if (["black", "#000", "#000000"].includes(paint)) return { paint: CHARGE_LINE, flattened: false };
	if (paint === CHARGE_FILL) return { paint, flattened: false };
	const hex = { white: "#ffffff" }[paint] ?? paint.replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/, "#$1$1$2$2$3$3");
	const channels = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(hex)?.slice(1).map((c) => parseInt(c, 16));
	if (!channels) return null;
	// White, and the pale greys some drawings shade the charge with.
	if (new Set(channels).size === 1 && channels[0] >= 0xc0) return { paint: CHARGE_FILL, flattened: true };
	// The near-blacks some drawings shade their lines with.
	if (Math.max(...channels) <= 0x40) return { paint: CHARGE_LINE, flattened: true };
	return null;
}

/**
 * @param {string} text An SVG from heraldicart.org.
 * @param {object} [options]
 * @param {number} [options.precision] Decimal places kept in coordinates.
 * @param {string|null} [options.prefix] Prefix for ids, for drawings sharing a page.
 * @returns {{svg: string, notes: string[]}} The cleaned drawing, and what cleaning had to change.
 */
export function cleanChargeSvg(text, { precision = 1, prefix = null } = {}) {
	const notes = new Set();
	const dropImageRigs = {
		name: "dropImageRigs",
		fn: (root) => {
			const parents = mapNodesToParents(root);
			const only = (node) => node.type !== "element"
				|| (RIG_ELEMENTS.has(node.name) && node.children.every(only));
			const drop = new Set();
			const find = (node) => {
				if (node.type === "root") return node.children.forEach(find);
				if (node.type !== "element") return;
				if (node.name === "image") {
					let rig = node;
					for (let parent = parents.get(rig); parent?.name === "g" && only(parent); parent = parents.get(rig)) rig = parent;
					drop.add(rig);
				}
				node.children.forEach(find);
			};
			find(root);
			for (const rig of drop) {
				const parent = parents.get(rig);
				parent.children = parent.children.filter((child) => child !== rig);
				notes.add("had an image rig");
			}
			return {};
		}
	};
	const normaliseChargeColours = {
		name: "normaliseChargeColours",
		fn: () => ({
			element: {
				enter: (node) => {
					for (const attribute of ["fill", "stroke"]) {
						const value = node.attributes[attribute];
						if (value == null) continue;
						const result = chargePaint(value);
						if (!result) throw new Error(`Unexpected ${attribute} "${value}" on <${node.name}>`);
						if (result.flattened) notes.add("greys flattened");
						node.attributes[attribute] = result.paint;
					}
					for (const attribute of ["fill-opacity", "stroke-opacity", "opacity"]) {
						const value = node.attributes[attribute];
						if (value == null) continue;
						if (Number(value) !== 1) throw new Error(`Unexpected ${attribute} "${value}" on <${node.name}>`);
						delete node.attributes[attribute];
					}
					// Lines are the default black, spelled out so the painter can tint whatever inherits it.
					if (node.name === "svg" && node.attributes.fill == null) node.attributes.fill = CHARGE_LINE;
				}
			}
		})
	};

	const plugins = [
		"convertStyleToAttrs",
		dropImageRigs,
		normaliseChargeColours,
		{
			name: "preset-default",
			params: {
				overrides: {
					convertColors: { shortname: false, shorthex: false },
					// Keep fill="#000": the painter tints lines by finding it.
					removeUnknownsAndDefaults: { defaultAttrs: false },
					convertTransform: { transformPrecision: 5 }
				}
			}
		},
		"removeTitle",
		"removeDesc",
		"removeXlink"
	];
	if (prefix) plugins.push({ name: "prefixIds", params: { prefix, delim: "-" } });

	const { data } = optimize(text, { multipass: true, floatPrecision: precision, js2svg: { pretty: false }, plugins });
	checkChargeSvg(data);
	return { svg: data, notes: [...notes] };
}

/**
 * @param {string} svg A cleaned charge.
 * @param {string} notice Its credit.
 * @returns {string} The charge carrying its credit as its description, first inside the root.
 */
export function withNotice(svg, notice) {
	return svg.replace(/^<svg\b[^>]*>/, (root) => `${root}<desc>${escapeHTML(notice)}</desc>`);
}

/**
 * Throws unless the SVG is a charge the painter can tint safely.
 * @param {string} svg
 */
export function checkChargeSvg(svg) {
	const root = /^<svg\b[^>]*>/.exec(svg)?.[0];
	if (!root) throw new Error("No root <svg> element");
	for (const attribute of ["viewBox", "width", "height"]) {
		if (!new RegExp(`\\s${attribute}="[^"]+"`).test(root)) throw new Error(`The root <svg> has no ${attribute}`);
	}
	for (const [, attribute, value] of svg.matchAll(/\s(fill|stroke)="([^"]*)"/g)) {
		if (!CHARGE_PAINTS.includes(value)) throw new Error(`Unexpected ${attribute} "${value}"`);
	}
	if (!svg.includes(`fill="${CHARGE_FILL}"`)) throw new Error("Nothing in the charge takes a tincture");
	const forbidden = /<(image|script|foreignObject|style|linearGradient|radialGradient|pattern|filter|mask)\b|\sstyle=|\s(on\w+|opacity|fill-opacity|stroke-opacity)=|href="(?!#)|(fill|stroke)="url\(/;
	const found = forbidden.exec(svg);
	if (found) throw new Error(`Unexpected "${found[0].trim()}"`);
}
