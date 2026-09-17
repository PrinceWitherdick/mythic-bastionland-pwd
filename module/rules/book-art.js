/**
 * Where the Mythic Bastionland rulebook keeps its art and text, and how the
 * importer names what it saves. Nothing from the book ships with the system:
 * the GM supplies their own PDF, and everything is read from it at import time.
 *
 * Knights & Myths (p26-27) lists 72 Knights and 72 Myths in roll order, d6
 * first, then d12. Each roll has a spread: the Knight on the left-hand page,
 * with a picture of the Seer who knighted them, and a Myth facing it.
 */
import { parseStatLine } from "./stat-blocks.js";
import { cleanText, joinLines, logicalLines } from "./text.js";

/** Top-level folder under Foundry's Data path, outside any system or world. */
export const ART_ROOT = "mythic-bastionland-art";

export const INDEX_FILE = "index.json";

/**
 * 2 added each Knight's Property, Ability and Passion. 3 added each Myth's
 * Omens and Cast, and each Seer's stats. 4 added the Spark Tables. 5 added
 * the City Quest's Omens and Cast. 6 added each Knight's square token.
 */
export const INDEX_VERSION = 6;

/** The first index version with each Myth's Omens and Cast, and each Seer's stats. */
export const MYTH_TEXT_VERSION = 3;

/** The first index version with the City Quest's Omens and Cast. */
export const CITY_QUEST_TEXT_VERSION = 5;

/** Page count of the PDF the layout below was measured against. */
export const EXPECTED_PAGES = 212;

/** Page of the first Knight (1-01). Page numbers in the PDF match the book's. */
const FIRST_SPREAD_PAGE = 28;

const SPREAD_COUNT = 72;

export const WEBP_QUALITY = 0.9;

export const KINDS = Object.freeze(["knight", "seer", "myth"]);

export const KIND_FOLDERS = Object.freeze({ knight: "knights", seer: "seers", myth: "myths" });

/** Where the square tokens cut from Knight portraits are saved. */
const TOKEN_FOLDER = "knight-tokens";

/** The art found on each page of a spread. */
export const PAGE_KINDS = Object.freeze({ knight: ["knight", "seer"], myth: ["myth"] });

/**
 * Why an entry needs a second look. `extra` still saves the largest match and
 * the text reasons still save the picture; the rest leave the picture out.
 */
export const PROBLEM_REASONS = Object.freeze(["notFound", "extra", "decode", "upload", "text", "mythText", "seerText", "sparkText", "sparkPage", "goodsKind", "cityQuestText"]);

/** The kind a problem reading the Spark Tables is reported under. */
export const SPARK_KIND = "spark";

/** The kind a problem reading the City Quest is reported under. */
export const CITY_QUEST_KIND = "cityQuest";

/** Which problem reports that a kind's text couldn't be read. */
export const TEXT_REASONS = Object.freeze({ knight: "text", seer: "seerText", myth: "mythText" });

/** pdf.js `ImageKind` values. */
export const IMAGE_KIND = Object.freeze({ RGB_24BPP: 2, RGBA_32BPP: 3 });

/** Paper and texture images drawn behind every page, in pixels. */
export const BACKGROUND_SIZES = Object.freeze([
	[1225, 1585],
	[1224, 1584],
	[1482, 1960],
	[1098, 1771],
	[746, 1178]
]);

/** Knight and Myth titles are set at 60pt, with a smaller "The" above them. */
const TITLE_MIN_SIZE = 45;

const NAME_MAX_LENGTH = 40;

/** Rejects text from fonts that don't map their glyphs back to letters. */
const NAME_PATTERN = /^\p{L}[\p{L}\p{M}'’ -]*$/u;

/** The label above the Seer's name on a Knight's page. */
const SEER_ANCHOR = /^knighted\b/i;

export const isDie = (value, faces) => Number.isInteger(value) && value >= 1 && value <= faces;

/**
 * @param {number} d6
 * @param {number} d12
 * @returns {string} e.g. "1-01", which sorts in book order.
 */
export function rollLabel(d6, d12) {
	if (!isDie(d6, 6) || !isDie(d12, 12)) throw new RangeError(`No Knight for d6 ${d6} and d12 ${d12}`);
	return `${d6}-${String(d12).padStart(2, "0")}`;
}

/**
 * @param {number} d6
 * @param {number} d12
 * @returns {{knight: number, myth: number}} PDF page numbers.
 */
export function spreadPages(d6, d12) {
	rollLabel(d6, d12);
	const knight = FIRST_SPREAD_PAGE + 2 * ((d6 - 1) * 12 + (d12 - 1));
	return { knight, myth: knight + 1 };
}

/** @returns {{d6: number, d12: number, roll: string, knightPage: number, mythPage: number}[]} In book order. */
export function spreads() {
	return Array.from({ length: SPREAD_COUNT }, (_, index) => {
		const d6 = Math.floor(index / 12) + 1;
		const d12 = (index % 12) + 1;
		const pages = spreadPages(d6, d12);
		return { d6, d12, roll: rollLabel(d6, d12), knightPage: pages.knight, mythPage: pages.myth };
	});
}

/**
 * Tell the art apart by pixel size alone. The bands sit about a fifth either
 * side of the sizes measured across all 72 spreads.
 * @param {{width: number, height: number}} image
 * @returns {"background"|"knight"|"seer"|"myth"|"other"}
 */
export function classifyImage({ width, height }) {
	if (BACKGROUND_SIZES.some(([w, h]) => Math.abs(width - w) <= 2 && Math.abs(height - h) <= 2)) return "background";
	if (width >= 380 && width <= 560 && height >= 2 * width && height <= 1300) return "knight";
	if (width >= 360 && width <= 580 && height >= 140 && height <= 230 && width >= 2 * height) return "seer";
	const ratio = width / height;
	if (width >= 800 && width <= 1100 && ratio >= 1.6 && ratio <= 2.1) return "myth";
	return "other";
}

/**
 * Choose the art on one page of a spread.
 * @param {"knight"|"myth"} role
 * @param {{key: string|null, width: number, height: number}[]} images As painted on the page.
 * @returns {{art: Record<string, object|null>, problems: {kind: string, reason: string}[]}}
 */
export function pickPageArt(role, images) {
	const seen = new Set();
	const unique = images.filter(({ key }) => {
		if (key == null) return true;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	const art = {};
	const problems = [];
	for (const kind of PAGE_KINDS[role]) {
		const matches = unique
			.filter((image) => classifyImage(image) === kind)
			.sort((a, b) => b.width * b.height - a.width * a.height);
		art[kind] = matches[0] ?? null;
		if (!matches.length) problems.push({ kind, reason: "notFound" });
		else if (matches.length > 1) problems.push({ kind, reason: "extra" });
	}
	return { art, problems };
}

/**
 * Flatten pdf.js text items into runs with a font size, baseline position and
 * font. The font is pdf.js's name for it, which only tells one font from another.
 * @param {object[]} items From `page.getTextContent()`.
 * @returns {{str: string, size: number, x: number, y: number, width: number, font: string|null}[]}
 */
export function textRuns(items) {
	return items
		.filter((item) => typeof item.str === "string" && item.str.trim())
		.map(({ str, transform: [, , c, d, x, y], width, fontName }) => ({
			str,
			size: Math.hypot(c, d),
			x,
			y,
			width: width ?? 0,
			font: fontName ?? null
		}));
}

/**
 * @param {{x: number, width: number}} run From `textRuns`.
 * @returns {number} Where its middle falls across the page.
 */
export const runMiddle = (run) => run.x + run.width / 2;

/**
 * Join runs into one line of text, top line first. pdf.js can split a word
 * wherever the PDF adjusts spacing, so a space is added only where the runs
 * leave a visible gap.
 * @param {ReturnType<typeof textRuns>} runs
 * @returns {string}
 */
function joinRuns(runs) {
	const sorted = [...runs].sort((a, b) => (Math.abs(a.y - b.y) <= Math.max(a.size, b.size) / 2 ? a.x - b.x : b.y - a.y));
	let text = "";
	let previous = null;
	for (const run of sorted) {
		if (previous) {
			const sameLine = Math.abs(run.y - previous.y) <= Math.max(run.size, previous.size) / 2;
			const gap = run.x - (previous.x + previous.width);
			if (!sameLine || gap > run.size * 0.2) text += " ";
		}
		text += run.str;
		previous = run;
	}
	return cleanText(text);
}

const cleanName = (text) => (text && text.length <= NAME_MAX_LENGTH && NAME_PATTERN.test(text) ? text : null);

/**
 * The Knight's or Myth's name from the largest text on their page, without
 * the leading "The".
 * @param {object[]} items From `page.getTextContent()`.
 * @returns {string|null}
 */
export function titleFromItems(items) {
	const runs = textRuns(items);
	const largest = Math.max(0, ...runs.map((run) => run.size));
	if (largest < TITLE_MIN_SIZE) return null;
	return cleanName(joinRuns(runs.filter((run) => largest - run.size <= 1)));
}

/**
 * The Seer's name, printed just below "Knighted by…" in a larger face.
 * @param {object[]} items From `page.getTextContent()`.
 * @returns {string|null}
 */
export function seerNameFromItems(items) {
	const runs = textRuns(items);
	const anchor = runs.find((run) => SEER_ANCHOR.test(run.str.trim()));
	if (!anchor) return null;

	const below = (run) => anchor.y - run.y > 0 && anchor.y - run.y <= anchor.size * 4;
	const [first] = runs
		.filter((run) => run.size >= anchor.size * 1.15 && below(run))
		.sort((a, b) => b.y - a.y);
	if (!first) return null;

	const line = runs.filter((run) => Math.abs(run.size - first.size) <= 0.5 && Math.abs(run.y - first.y) <= first.size / 2);
	return cleanName(joinRuns(line));
}

/** Runs this close to the same baseline share a line, such as small capitals within a sentence. */
export const BASELINE_TOLERANCE = 2;

/**
 * The page's text as lines, top to bottom.
 * @param {object[]} items From `page.getTextContent()`.
 * @returns {{y: number, size: number, text: string, runs: ReturnType<typeof textRuns>}[]}
 *   `size` is the line's largest font size.
 */
export function textLines(items) {
	const lines = [];
	for (const run of textRuns(items).sort((a, b) => b.y - a.y)) {
		const line = lines.at(-1);
		if (line && line.y - run.y <= BASELINE_TOLERANCE) line.runs.push(run);
		else lines.push({ y: run.y, runs: [run] });
	}
	return lines.map(({ y, runs }) => ({ y, size: Math.max(...runs.map((run) => run.size)), text: joinRuns(runs), runs }));
}

const PROPERTY_HEADING = /^property$/i;
const ABILITY_HEADING = /^ability\s*[-–—]\s*(.+)$/i;
const PASSION_HEADING = /^passion\s*[-–—]\s*(.+)$/i;
const BULLET = /^[•●▪]\s*/;

/**
 * The body under a heading: each following line in the heading's size, until
 * the size changes, a gap opens wider than the line spacing, or the range
 * ends. A Knight's table can start only a few points below their Passion, but
 * it is always set smaller.
 * @param {ReturnType<typeof textLines>} lines
 * @param {number} headingAt
 * @param {number} endAt
 * @returns {string}
 */
function bodyText(lines, headingAt, endAt) {
	const heading = lines[headingAt];
	let text = "";
	let previous = heading;
	for (const line of lines.slice(headingAt + 1, endAt)) {
		if (Math.abs(line.size - heading.size) > 0.5 || previous.y - line.y > heading.size * 1.2) break;
		text = text ? joinLines(text, line.text) : line.text;
		previous = line;
	}
	return text;
}

/**
 * A Knight's Property, Ability and Passion, read from their page in the order
 * the book prints them.
 * @param {object[]} items From `page.getTextContent()`.
 * @returns {{property: string[], ability: {name: string, text: string}, passion: {name: string, text: string}}|null}
 *   Null when any part can't be found.
 */
export function knightTextFromItems(items) {
	const lines = textLines(items);
	const find = (pattern) => lines.findIndex((line) => pattern.test(line.text));
	const propertyAt = find(PROPERTY_HEADING);
	const abilityAt = find(ABILITY_HEADING);
	const passionAt = find(PASSION_HEADING);
	if (propertyAt < 0 || abilityAt < propertyAt || passionAt < abilityAt) return null;

	const property = [];
	for (const { text } of lines.slice(propertyAt + 1, abilityAt)) {
		if (BULLET.test(text) || !property.length) property.push(text.replace(BULLET, ""));
		else property.push(joinLines(property.pop(), text));
	}

	const section = (at, endAt, pattern) => ({ name: pattern.exec(lines[at].text)[1].trim(), text: bodyText(lines, at, endAt) });
	const ability = section(abilityAt, passionAt, ABILITY_HEADING);
	const passion = section(passionAt, lines.length, PASSION_HEADING);
	if (!property.length || !ability.text || !passion.text) return null;
	return { property, ability, passion };
}

/** The Referee prompts along the foot of every Knight ("Person: …") and Myth ("Dwelling: …") page. */
const PROMPTS = /^(?:dwelling|person)\s*:/i;

/**
 * @param {ReturnType<typeof textLines>} lines
 * @returns {number} The baseline of the highest prompt line, or -Infinity without one.
 */
const promptsTop = (lines) => Math.max(-Infinity, ...lines.filter((line) => PROMPTS.test(line.text)).map((line) => line.y));

/**
 * A Seer's stats and traits, printed under their name on their Knight's page.
 * A few give only GD, or no stats at all.
 * @param {object[]} items From `page.getTextContent()`.
 * @returns {{stats: import("./stat-blocks.js").Stats|null, lines: string[]}|null}
 *   `lines` holds whatever the stats don't, one written line each. Null without
 *   the Seer's heading, or with nothing under it.
 */
export function seerTextFromItems(items) {
	const lines = textLines(items);
	const anchorAt = lines.findIndex((line) => SEER_ANCHOR.test(line.text));
	if (anchorAt < 0) return null;
	const nameAt = lines.findIndex((line, index) => index > anchorAt && line.size >= lines[anchorAt].size * 1.15);
	const endY = promptsTop(lines);
	const body = lines.slice((nameAt < 0 ? anchorAt : nameAt) + 1).filter((line) => line.y > endY);

	const parsed = parseStatLine(body[0]?.text);
	const printed = parsed ? [parsed.rest, ...body.slice(1).map((line) => line.text)] : body.map((line) => line.text);
	const result = { stats: parsed?.stats ?? null, lines: logicalLines(printed.filter(Boolean)) };
	return result.stats || result.lines.length ? result : null;
}

/** Myth pages head their two columns "Omens" and "Cast" at this size. */
const COLUMN_HEADING_SIZE = 14;

/** The Cast is set at 11pt. The table below it is headed smaller. */
const CAST_MIN_SIZE = 10.5;

const OMEN_START = /^(\d+)\.\s*(.*)$/;

/**
 * @typedef {object} CastEntry
 * @property {string} name As printed, such as "Name, Epithet".
 * @property {import("./stat-blocks.js").Stats|null} stats Null for a Cast entry without them, such as an object.
 * @property {string[]} lines What follows the stats, one written line each.
 */

/**
 * A Myth's Omens and Cast. The Omens fill the left column and the Cast the
 * right, above a table and the prompts along the foot.
 * @param {object[]} items From `page.getTextContent()`.
 * @returns {{omens: string[], cast: CastEntry[], castNote: string}|null}
 *   `castNote` is text about the whole Cast, printed above the first entry.
 *   Null when the columns can't be found.
 */
export function mythTextFromItems(items) {
	const runs = textRuns(items);
	const heading = (word) => runs.find((run) => Math.abs(run.size - COLUMN_HEADING_SIZE) <= 1 && run.str.trim().toLowerCase() === word);
	const omensHeading = heading("omens");
	const castHeading = heading("cast");
	if (!omensHeading || !castHeading) return null;

	const split = (runMiddle(omensHeading) + runMiddle(castHeading)) / 2;
	const top = Math.min(omensHeading.y, castHeading.y) - BASELINE_TOLERANCE;
	const bottom = promptsTop(textLines(items)) + BASELINE_TOLERANCE;
	const column = (inColumn) => textLines(items.filter((item) => {
		const [, , , , x, y] = item.transform ?? [];
		return y < top && y > bottom && inColumn(x);
	}));

	const omens = readOmens(column((x) => x < split));
	const { cast, castNote } = readCast(column((x) => x >= split));
	if (!omens.length && !cast.length) return null;
	return { omens, cast, castNote };
}

/**
 * @param {ReturnType<typeof textLines>} lines The Omens column.
 * @returns {string[]} Each numbered Omen, in order.
 */
function readOmens(lines) {
	const omens = [];
	for (const { text } of lines) {
		const start = OMEN_START.exec(text);
		if (start) omens.push(start[2]);
		else if (omens.length) omens.push(joinLines(omens.pop(), text));
	}
	return omens;
}

/**
 * @param {ReturnType<typeof textLines>} lines
 * @returns {string|null} The font most of the text is set in.
 */
function bodyFont(lines) {
	const counts = new Map();
	for (const run of lines.flatMap((line) => line.runs)) counts.set(run.font, (counts.get(run.font) ?? 0) + run.str.length);
	return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Split the Cast column into entries. Each starts with its name in bold, and
 * entries are spaced further apart than their lines. Text before the first
 * name, in the body font, is about the whole Cast.
 * @param {ReturnType<typeof textLines>} lines The Cast column.
 * @returns {{cast: CastEntry[], castNote: string}}
 */
export function readCast(lines) {
	const tableAt = lines.findIndex((line) => line.size < CAST_MIN_SIZE);
	const castLines = tableAt < 0 ? lines : lines.slice(0, tableAt);
	const body = bodyFont(castLines);
	// Judged on the letters, since a name's "&" can be set in the body font.
	const isName = (line) => {
		const words = line.runs.filter((run) => /\p{L}/u.test(run.str));
		return words.length > 0 && words.every((run) => run.font !== null && run.font !== body);
	};

	const entries = [];
	const notes = [];
	let entry = null;
	let previous = null;
	for (const line of castLines) {
		const gap = !previous || previous.y - line.y > line.size * 1.4;
		if (isName(line)) {
			if (entry && !entry.details.length && !gap) entry.name.push(line.text);
			else entries.push(entry = { name: [line.text], details: [] });
		} else if (entry && !gap) {
			entry.details.push(line.text);
		} else {
			notes.push(line.text);
			entry = null;
		}
		previous = line;
	}

	const cast = entries.map(({ name, details }) => {
		const parsed = parseStatLine(details[0]);
		const printed = parsed ? [parsed.rest, ...details.slice(1)] : details;
		return { name: name.reduce(joinLines), stats: parsed?.stats ?? null, lines: logicalLines(printed.filter(Boolean)) };
	});
	return { cast, castNote: logicalLines(notes).join(" ") };
}

/**
 * @param {string} name
 * @returns {string} The name with "The " in front, as the book lists it.
 */
export function withArticle(name) {
	return /^the\s/i.test(name) ? name : `The ${name}`;
}

/**
 * @param {string} name
 * @returns {string} e.g. "The Glass Seer" becomes "glass-seer".
 */
export function slugify(name) {
	return String(name ?? "")
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/^the\s+/, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** @returns {string[]} Every folder the importer writes to, parents first. */
export function artDirectories() {
	return [ART_ROOT, ...KINDS.map((kind) => `${ART_ROOT}/${KIND_FOLDERS[kind]}`), `${ART_ROOT}/${TOKEN_FOLDER}`];
}

/**
 * Where one picture is saved. Without a name, the kind stands in for it.
 * @param {string} kind       One of KINDS.
 * @param {number} d6
 * @param {number} d12
 * @param {string|null} name
 * @param {string} [extension]
 * @returns {{dir: string, fileName: string, file: string}} `file` is relative to ART_ROOT.
 */
export function artFile(kind, d6, d12, name, extension = "webp") {
	const folder = KIND_FOLDERS[kind];
	const fileName = `${rollLabel(d6, d12)}-${slugify(name) || kind}.${extension}`;
	return { dir: `${ART_ROOT}/${folder}`, fileName, file: `${folder}/${fileName}` };
}

/**
 * Where a Knight's square token is saved, named like their portrait.
 * @param {number} d6
 * @param {number} d12
 * @param {string|null} name
 * @param {string} [extension]
 * @returns {{dir: string, fileName: string, file: string}} `file` is relative to ART_ROOT.
 */
export function tokenFile(d6, d12, name, extension = "webp") {
	const { fileName } = artFile("knight", d6, d12, name, extension);
	return { dir: `${ART_ROOT}/${TOKEN_FOLDER}`, fileName, file: `${TOKEN_FOLDER}/${fileName}` };
}

/**
 * One picture's line in the index. `path` is null when it wasn't saved. Each
 * kind also carries the text read from its page, null when unread: a Knight's
 * Property, Ability and Passion, a Seer's stats, and a Myth's Omens and Cast.
 * A Knight's `token` is the path of the square cut from their portrait.
 * @param {object} entry
 * @param {object|null} [entry.text] From knightTextFromItems, seerTextFromItems or mythTextFromItems.
 * @returns {object}
 */
export function indexEntry({ kind, d6, d12, page, name = null, file, path = null, width = null, height = null, token = null, text = null }) {
	const entry = { kind, d6, d12, roll: rollLabel(d6, d12), page, name, file, path, width, height };
	switch (kind) {
		case "knight":
			return { ...entry, token, property: text?.property ?? null, ability: text?.ability ?? null, passion: text?.passion ?? null };
		case "seer":
			return { ...entry, stats: text?.stats ?? null, lines: text?.lines ?? null };
		case "myth":
			return { ...entry, omens: text?.omens ?? null, cast: text?.cast ?? null, castNote: text?.castNote ?? null };
		default:
			return entry;
	}
}

/**
 * Whether an index entry carries the text its page should give: a Knight's
 * Ability, a Seer's stats or traits, or a Myth's Cast.
 * @param {string} kind One of KINDS.
 * @param {object|null} entry From indexEntry.
 * @returns {boolean}
 */
export function hasPageText(kind, entry) {
	switch (kind) {
		case "knight":
			return Boolean(entry?.ability);
		case "seer":
			return Boolean(entry?.stats || entry?.lines?.length);
		case "myth":
			return Boolean(entry?.cast?.length);
		default:
			return false;
	}
}

/**
 * The index written next to the art, so later features can find a picture
 * from a roll. Each kind lists every roll in book order.
 * @param {object} data
 * @param {object[]} data.entries From indexEntry.
 * @param {object[]} [data.problems] `{kind, roll, page, reason}`.
 * @param {{key: string, page: number, name: string|null, tables: object[]}[]} [data.spark]
 *   Each page of Spark Tables, from sparkTablesFromItems.
 * @param {{omens: string[]|null, cast: CastEntry[]|null, castNote: string}|null} [data.cityQuest]
 *   The City Quest's Omens and Cast, each null when unread, and any note beneath the Cast.
 * @param {number} data.pdfPages
 * @param {string} data.importedAt ISO timestamp.
 * @param {string} data.systemVersion
 * @returns {object}
 */
export function buildIndex({ entries, problems = [], spark = [], cityQuest = null, pdfPages, importedAt, systemVersion }) {
	const index = { version: INDEX_VERSION, systemVersion, importedAt, pdfPages, root: ART_ROOT };
	for (const kind of KINDS) {
		index[KIND_FOLDERS[kind]] = entries
			.filter((entry) => entry.kind === kind)
			.sort((a, b) => a.d6 - b.d6 || a.d12 - b.d12)
			.map(({ kind: _kind, ...entry }) => entry);
	}
	index.spark = spark;
	index.cityQuest = cityQuest;
	index.problems = problems;
	return index;
}

/**
 * Every picture a page paints, in drawing order, from pdf.js's operator list.
 * Pictures inside forms are listed too, as the list runs through them.
 * @param {number[]} fnArray From `page.getOperatorList()`.
 * @param {any[]} argsArray
 * @param {object} OPS pdf.js operator codes.
 * @returns {{key: string|null, width: number, height: number, inline?: object}[]}
 */
export function paintedImages(fnArray, argsArray, OPS) {
	return fnArray.flatMap((fn, index) => {
		const args = argsArray[index];
		if (fn === OPS.paintImageXObject) return [{ key: args[0], width: args[1], height: args[2] }];
		if (fn === OPS.paintInlineImageXObject) return [{ key: null, width: args[0].width, height: args[0].height, inline: args[0] }];
		return [];
	});
}

/**
 * Pixels ready for `ImageData`, keeping any transparency. pdf.js hands back
 * RGBA for images with a soft mask and RGB for the rest.
 * @param {{width: number, height: number, data: Uint8ClampedArray, kind?: number}} image
 * @returns {Uint8ClampedArray|null} Null for a layout this can't read.
 */
export function rgbaPixels({ width, height, data, kind }) {
	const count = width * height;
	if (!data || !count) return null;
	const resolved = kind ?? (data.length === count * 4 ? IMAGE_KIND.RGBA_32BPP : IMAGE_KIND.RGB_24BPP);

	if (resolved === IMAGE_KIND.RGBA_32BPP && data.length === count * 4) return new Uint8ClampedArray(data);
	if (resolved !== IMAGE_KIND.RGB_24BPP || data.length !== count * 3) return null;

	const out = new Uint8ClampedArray(count * 4);
	for (let pixel = 0; pixel < count; pixel++) {
		out[pixel * 4] = data[pixel * 3];
		out[pixel * 4 + 1] = data[pixel * 3 + 1];
		out[pixel * 4 + 2] = data[pixel * 3 + 2];
		out[pixel * 4 + 3] = 255;
	}
	return out;
}
