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
import { BULLET, MINOR_WORDS, cleanText, joinLines, logicalLines, titleCase } from "./text.js";

/** Top-level folder under Foundry's Data path, outside any system or world. */
export const ART_ROOT = "mythic-bastionland-art";

export const INDEX_FILE = "index.json";

/**
 * 2 added each Knight's Property, Ability and Passion. 3 added each Myth's
 * Omens and Cast, and each Seer's stats. 4 added the Spark Tables. 5 added
 * the City Quest's Omens and Cast. 6 added each Knight's square token. 7
 * added the prompts along the foot of each Knight's page to their Seer. 8
 * added the rules pages, starting with Creating a Realm (p14). 9 added the
 * table at the foot of each Myth's page. 10 added the table on each Knight's.
 * 11 added the verse under each Myth's name. 12 added the prompts along the
 * foot of each Myth's page. 13 added the book's words for the rules text the
 * system shows (module/rules/book-text.js). 14 added the verse under each Knight's name.
 */
export const INDEX_VERSION = 14;

/** The first index version with the prompts along the foot of each Knight's page, kept on their Seer. */
export const SEER_PROMPTS_VERSION = 7;

/** The first index version with the table on each Knight's page. */
export const KNIGHT_TABLE_VERSION = 10;

/** The first index version with the verse under each Myth's name. */
export const MYTH_VERSE_VERSION = 11;

/** The first index version with the prompts along the foot of each Myth's page. */
export const MYTH_PROMPTS_VERSION = 12;

/** The first index version with the verse under each Knight's name. */
export const KNIGHT_VERSE_VERSION = 14;

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
export const PROBLEM_REASONS = Object.freeze(["notFound", "extra", "decode", "upload", "text", "mythText", "seerText", "sparkText", "sparkPage", "goodsKind", "cityQuestText", "rulesText", "bookText"]);

/** The kind a problem reading the Spark Tables is reported under. */
export const SPARK_KIND = "spark";

/** The kind a problem reading the City Quest is reported under. */
export const CITY_QUEST_KIND = "cityQuest";

/** The kind a problem reading a rules page is reported under. */
export const RULES_KIND = "rules";

/** The kind a passage of rules text that couldn't be found is reported under. */
export const BOOK_TEXT_KIND = "bookText";

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
 * @param {{d6: number, d12: number}|null|undefined} dice
 * @returns {boolean} Whether they read as a roll on a d6 by d12 table, like the Knights or Myths (p26-27).
 */
export const isTableRoll = (dice) => Boolean(dice) && isDie(dice.d6, 6) && isDie(dice.d12, 12);

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

/** The 72 spreads, reckoned once: they are the same in every copy of the book. */
let allSpreads = null;

/** @returns {{d6: number, d12: number, roll: string, knightPage: number, mythPage: number}[]} In book order. */
export function spreads() {
	allSpreads ??= Object.freeze(Array.from({ length: SPREAD_COUNT }, (_, index) => {
		const d6 = Math.floor(index / 12) + 1;
		const d12 = (index % 12) + 1;
		const pages = spreadPages(d6, d12);
		return Object.freeze({ d6, d12, roll: rollLabel(d6, d12), knightPage: pages.knight, mythPage: pages.myth });
	}));
	return allSpreads;
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
 * the book prints them, with the verse under their name and their table.
 * @param {object[]} items From `page.getTextContent()`.
 * @returns {{verse: string[]|null, property: string[], ability: {name: string, text: string}, passion: {name: string, text: string}, table: MythTable|null}|null}
 *   Null when any part but the verse or the table can't be found.
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
	return { verse: knightVerseFromItems(items, { lines }), property, ability, passion, table: mythTableFromItems(items, { lines }) };
}

/** The Referee prompts along the foot of every Knight ("Person: …") and Myth ("Dwelling: …") page. */
const PROMPTS = /^(?:dwelling|person)\s*:/i;

/**
 * @param {ReturnType<typeof textLines>} lines
 * @returns {number} The baseline of the highest prompt line, or -Infinity without one.
 */
const promptsTop = (lines) => Math.max(-Infinity, ...lines.filter((line) => PROMPTS.test(line.text)).map((line) => line.y));

/** Each prompt opens with its label, such as "Person:". */
const PROMPT_LABEL = /^([A-Z][A-Za-z' ]*?)\s*:\s*(.*)$/;

/**
 * The Referee prompts along the foot of a page, such as "Person: Glazier ~
 * Name: Oswy", which wrap over two lines.
 * @param {object[]} items From `page.getTextContent()`.
 * @returns {{label: string, value: string}[]|null} In the order printed, or null without any.
 */
export function promptsFromItems(items) {
	const lines = textLines(items);
	const top = promptsTop(lines);
	if (top === -Infinity) return null;
	const { size } = lines.find((line) => line.y === top);
	let text = "";
	for (const line of lines.filter((each) => each.y <= top && Math.abs(each.size - size) <= 0.5)) {
		const next = line.text.trim();
		// A line that opens a new prompt carries on the list; any other continues the last value.
		text = !text ? next : PROMPT_LABEL.test(next) || text.endsWith("~") ? `${text.replace(/\s*~$/, "")} ~ ${next}` : joinLines(text, next);
	}
	const prompts = text.split(/\s*~\s*/).map((part) => PROMPT_LABEL.exec(part.trim())).filter(Boolean)
		.map(([, label, value]) => ({ label: label.trim(), value: value.trim() }))
		.filter(({ value }) => value);
	return prompts.length ? prompts : null;
}

/**
 * A Seer's stats and traits, printed under their name on their Knight's page,
 * and the prompts along the foot of that page. A few give only GD, or no stats at all.
 * @param {object[]} items From `page.getTextContent()`.
 * @returns {{stats: import("./stat-blocks.js").Stats|null, lines: string[], prompts: {label: string, value: string}[]|null}|null}
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
	const result = { stats: parsed?.stats ?? null, lines: logicalLines(printed.filter(Boolean)), prompts: promptsFromItems(items) };
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
 * @returns {{verse: string[]|null, omens: string[], cast: CastEntry[], castNote: string, table: MythTable|null, prompts: {label: string, value: string}[]|null}|null}
 *   `verse` is the couplet under the Myth's name, one line each. `castNote` is
 *   text about the whole Cast, printed above the first entry. `prompts` are
 *   the Landmark prompts along the foot, "Dwelling: …" to "Ruin: …". Null when
 *   the columns can't be found.
 */
export function mythTextFromItems(items) {
	const runs = textRuns(items);
	const omensHeading = columnHeading(runs, "omens");
	const castHeading = columnHeading(runs, "cast");
	if (!omensHeading || !castHeading) return null;

	const split = (runMiddle(omensHeading) + runMiddle(castHeading)) / 2;
	const top = Math.min(omensHeading.y, castHeading.y) - BASELINE_TOLERANCE;
	const lines = textLines(items);
	const bottom = promptsTop(lines) + BASELINE_TOLERANCE;
	const column =(inColumn) => textLines(items.filter((item) => {
		const [, , , , x, y] = item.transform ?? [];
		return y < top && y > bottom && inColumn(x);
	}));

	const omens = readOmens(column((x) => x < split));
	const { cast, castNote } = readCast(column((x) => x >= split));
	if (!omens.length && !cast.length) return null;
	return { verse: mythVerseFromItems(items, { runs }), omens, cast, castNote, table: mythTableFromItems(items, { runs, lines }), prompts: promptsFromItems(items) };
}

/**
 * @param {ReturnType<typeof textRuns>} runs
 * @param {string} word "omens" or "cast".
 * @returns {ReturnType<typeof textRuns>[number]|undefined} The heading over that column of a Myth's page.
 */
const columnHeading = (runs, word) => runs.find((run) => Math.abs(run.size - COLUMN_HEADING_SIZE) <= 1 && run.str.trim().toLowerCase() === word);

/**
 * The verse under a Myth's name, set in the headings' face between the name
 * and the Omens.
 * @param {object[]} items From `page.getTextContent()`.
 * @param {object} [parsed] What a caller has already made of the same items.
 * @param {ReturnType<typeof textRuns>} [parsed.runs] `textRuns(items)`.
 * @returns {string[]|null} One entry a line, or null without an Omens heading or anything above it.
 */
export function mythVerseFromItems(items, { runs = textRuns(items) } = {}) {
	const omensHeading = columnHeading(runs, "omens");
	if (!omensHeading) return null;
	const above = items.filter((item) => {
		const [, , c = 0, d = 0, , y] = item.transform ?? [];
		return y > omensHeading.y + BASELINE_TOLERANCE && Math.abs(Math.hypot(c, d) - COLUMN_HEADING_SIZE) <= 1;
	});
	const verse = textLines(above).map((line) => line.text).filter(Boolean);
	return verse.length ? verse : null;
}

/**
 * The verse under a Knight's name, set as a Myth's is, between the name and
 * their Property. Their Seer's name below is set the same size.
 * @param {object[]} items From `page.getTextContent()`.
 * @param {object} [parsed] What a caller has already made of the same items.
 * @param {ReturnType<typeof textLines>} [parsed.lines] `textLines(items)`.
 * @returns {string[]|null} One entry a line, or null without a Property heading or anything above it.
 */
export function knightVerseFromItems(items, { lines = textLines(items) } = {}) {
	const heading = lines.find((line) => PROPERTY_HEADING.test(line.text));
	if (!heading) return null;
	const verse = lines
		.filter((line) => line.y > heading.y + BASELINE_TOLERANCE && Math.abs(line.size - COLUMN_HEADING_SIZE) <= 1)
		.map((line) => line.text)
		.filter(Boolean);
	return verse.length ? verse : null;
}

/** A Myth's table has a row for each face of a d6. */
export const MYTH_TABLE_ROWS = 6;

/** A table title is printed in capitals, which sets it apart from the column headings. Some ask a question. */
const TABLE_TITLE = /^\p{Lu}[\p{Lu}\s&'’,?!-]*$/u;

/** How a table's title is title-cased: "from" and "with" stay lower case too, and an apostrophe stays inside its word. */
const TABLE_TITLE_CASE = Object.freeze({ minorWords: new Set([...MINOR_WORDS, "from", "with"]), apostrophes: true });

/**
 * Break runs into the pieces of text on each line, parted wherever a gap is
 * wider than a word space. A wide entry can cross the middle of its table, so
 * a piece is placed by where its middle falls, never run by run.
 * @param {ReturnType<typeof textRuns>} runs
 * @returns {{x: number, width: number, runs: ReturnType<typeof textRuns>}[]}
 */
function clusters(runs) {
	const pieces = [];
	for (const run of [...runs].sort((a, b) => (Math.abs(a.y - b.y) <= BASELINE_TOLERANCE ? a.x - b.x : b.y - a.y))) {
		const piece = pieces.at(-1);
		const end = piece && piece.x + piece.width;
		if (piece && Math.abs(piece.runs[0].y - run.y) <= BASELINE_TOLERANCE && run.x - end <= run.size / 2) {
			piece.runs.push(run);
			piece.width = Math.max(end, run.x + run.width) - piece.x;
		} else {
			pieces.push({ x: run.x, width: run.width, runs: [run] });
		}
	}
	return pieces;
}

/**
 * @typedef {object} MythTable
 * @property {string} name      Such as "The Poisonous Young".
 * @property {string[]} columns The two column headings.
 * @property {string[][]} rows  Six rows in roll order, each with one entry per column.
 */

/**
 * The table at the foot of a Myth's Cast column, which its Omens call "opposite",
 * or above the Seer on a Knight's page, which their Property calls "see below".
 * Its rows are numbered 1 to 6 down a dark strip, and an entry that wraps sits
 * either side of its number, so each run joins the row whose number is nearest.
 * @param {object[]} items From `page.getTextContent()`.
 * @param {object} [parsed] What a caller has already made of the same items, so the page isn't read twice.
 * @param {ReturnType<typeof textRuns>} [parsed.runs]   `textRuns(items)`.
 * @param {ReturnType<typeof textLines>} [parsed.lines] `textLines(items)`.
 * @returns {MythTable|null} Null unless there are two headings and every row has both entries.
 */
export function mythTableFromItems(items, { runs = textRuns(items), lines: pageLines = textLines(items) } = {}) {
	const bottom = promptsTop(pageLines);

	// The row numbers: 1 to 6, one under another, in the same place across the page.
	const digits = runs.filter((run) => run.y > bottom && /^[1-6]$/.test(run.str.trim()));
	const marks = [];
	for (const one of digits.filter((run) => run.str.trim() === "1")) {
		const found = [one];
		for (let number = 2; number <= MYTH_TABLE_ROWS; number++) {
			const next = digits.find((run) => run.str.trim() === String(number) && Math.abs(run.x - one.x) <= 3 && run.y < found.at(-1).y);
			if (!next) break;
			found.push(next);
		}
		if (found.length === MYTH_TABLE_ROWS) marks.splice(0, marks.length, ...found);
	}
	if (!marks.length) return null;

	const [first] = marks;
	const right = (run) => run.x > first.x + first.width && !marks.includes(run);
	const lines = textLines(items.filter((item) => typeof item.str === "string" && (item.transform?.[4] ?? 0) > first.x + first.width));

	// Above the rows: the title in capitals, and the column headings under it.
	const titleAt = lines.findLastIndex((line) => line.y > first.y && TABLE_TITLE.test(line.text));
	if (titleAt < 0) return null;
	const titleLines = [lines[titleAt].text];
	for (let at = titleAt - 1; at >= 0 && TABLE_TITLE.test(lines[at].text) && lines[at].y - lines[at + 1].y <= lines[at].size * 1.6; at--) {
		titleLines.unshift(lines[at].text);
	}

	// A row's last entry can run a line or two past its number, down to the prompts.
	// On a Knight's page it ends where their Seer begins.
	const floor = Math.max(bottom, ...runs.filter((run) => SEER_ANCHOR.test(run.str.trim()) && run.y < marks.at(-1).y).map((run) => run.y));
	const nearest = (run) => marks.reduce((best, mark) => (Math.abs(run.y - mark.y) < Math.abs(run.y - best.y) ? mark : best));
	const underTitle = runs.filter((run) => right(run) && run.y < lines[titleAt].y - BASELINE_TOLERANCE && run.y > floor + BASELINE_TOLERANCE);
	// The first entry is centred on its number, reaching as far above it as below.
	// A heading can wrap onto a second line, so whatever sits higher is a heading.
	const lowest = Math.min(first.y, ...underTitle.filter((run) => nearest(run) === first).map((run) => run.y));
	const headingBelow = 2 * first.y - lowest + BASELINE_TOLERANCE;
	const headingRuns = underTitle.filter((run) => run.y > headingBelow);
	const body = underTitle.filter((run) => run.y <= headingBelow);

	// The columns part at the widest gap across the headings, however they wrap.
	const sorted = [...headingRuns].sort((a, b) => a.x - b.x);
	let widest = null;
	let end = sorted[0] ? sorted[0].x + sorted[0].width : 0;
	for (const run of sorted.slice(1)) {
		const gap = run.x - end;
		if (!widest || gap > widest.gap) widest = { at: run.x, gap };
		end = Math.max(end, run.x + run.width);
	}
	if (!widest || widest.gap <= 0) return null;
	const split = widest.at - widest.gap / 2;
	const columns = [0, 1].map((column) => joinRuns(headingRuns.filter((run) => (runMiddle(run) < split ? 0 : 1) === column)));

	const rows = marks.map((mark) => {
		const mine = body.filter((run) => nearest(run) === mark);
		const cells = [[], []];
		for (const cluster of clusters(mine)) cells[runMiddle(cluster) < split ? 0 : 1].push(...cluster.runs);
		return cells.map(joinRuns);
	});
	if (columns.some((column) => !column) || rows.some((row) => row.some((entry) => !entry))) return null;
	return { name: titleCase(cleanText(titleLines.join(" ")), TABLE_TITLE_CASE), columns, rows };
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
 * verse, Property, Ability, Passion and table, a Seer's stats, and a Myth's verse, Omens, Cast, table and prompts.
 * A Knight's `token` is the path of the square cut from their portrait.
 * @param {object} entry
 * @param {object|null} [entry.text] From knightTextFromItems, seerTextFromItems or mythTextFromItems.
 * @returns {object}
 */
export function indexEntry({ kind, d6, d12, page, name = null, file, path = null, width = null, height = null, token = null, text = null }) {
	const entry = { kind, d6, d12, roll: rollLabel(d6, d12), page, name, file, path, width, height };
	switch (kind) {
		case "knight":
			return { ...entry, token, verse: text?.verse ?? null, property: text?.property ?? null, ability: text?.ability ?? null, passion: text?.passion ?? null, table: text?.table ?? null };
		case "seer":
			return { ...entry, stats: text?.stats ?? null, lines: text?.lines ?? null, prompts: text?.prompts ?? null };
		case "myth":
			return { ...entry, verse: text?.verse ?? null, omens: text?.omens ?? null, cast: text?.cast ?? null, castNote: text?.castNote ?? null, table: text?.table ?? null, prompts: text?.prompts ?? null };
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
 * @param {Record<string, {page: number, sections: object[]}>} [data.rules] Each rules page read, by its key in
 *   RULE_PAGES, as rulePageFromItems reads it.
 * @param {Record<string, string>} [data.bookText] The book's words for the rules text, by
 *   language key, as findBookText reads them.
 * @param {number} data.pdfPages
 * @param {string} data.importedAt ISO timestamp.
 * @param {string} data.systemVersion
 * @returns {object}
 */
export function buildIndex({ entries, problems = [], spark = [], cityQuest = null, rules = {}, bookText = {}, pdfPages, importedAt, systemVersion }) {
	const index = { version: INDEX_VERSION, systemVersion, importedAt, pdfPages, root: ART_ROOT };
	for (const kind of KINDS) {
		index[KIND_FOLDERS[kind]] = entries
			.filter((entry) => entry.kind === kind)
			.sort((a, b) => a.d6 - b.d6 || a.d12 - b.d12)
			.map(({ kind: _kind, ...entry }) => entry);
	}
	index.spark = spark;
	index.cityQuest = cityQuest;
	index.rules = rules;
	index.bookText = bookText;
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
