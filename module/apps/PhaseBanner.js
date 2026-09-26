/**
 * The Phase of the Day, the Season and the Age, held at the top of the screen
 * for the whole table as one bar in three parts. The Phase and the Season are
 * painted in the same light as the card their change posts: bright for
 * Morning, amber for Afternoon, dark for Night, green for Spring, gold for
 * Harvest, pale blue for Winter. They turn with the calendar on every client,
 * and a GM can press any of them to let down the ways of moving time on under
 * the bar: Weeks Pass, Months Pass and A Year Passes.
 */
import { CALENDAR_HOOK, chronicleLabel, getCalendar, ordinalLabel } from "../actions/calendar.js";
import { t } from "../chat/cards.js";
import { TEXT_SIZE_HOOK, read, reducesMotion } from "../client-settings.js";
import { PHASE_ICONS, SEASON_ICONS } from "../rules/time.js";
import { SYSTEM_ID } from "../system-id.js";

/** Whether this browser shows the banner. Everyone else at the table keeps their own choice. */
const SHOWN_SETTING = "phaseBannerShown";

/** The Age's tab has no card of its own to borrow a light from, so it keeps the parchment. */
const AGE_ICON = "fa-solid fa-hourglass-half";

/** The tabs, left to right. */
const PARTS = Object.freeze(["phase", "season", "age"]);

/** @type {HTMLElement|null} The one banner, while it's up. */
let banner = null;

/** @type {number|null} The banner's measured bottom, kept until it's painted, put up, taken down or rescaled. */
let floor = null;

/** @type {WeakMap<HTMLElement, () => void>} Each tab a new face is still sliding in over, and what puts that face up at once. */
const turning = new WeakMap();

/** How long a slide may take before its tab is turned regardless, should its animation never report back. */
const TURN_TIMEOUT_MS = 1500;

/** @type {HTMLElement|null} The GM's ways of moving time on, hanging under the bar while it's let down. */
let menu = null;

/**
 * @typedef {object} TimeMoves  What the GM's buttons under the bar do, handed in so the banner loads none of it itself.
 * @property {() => unknown} weeks        Weeks pass: on to the next seasonal event.
 * @property {() => unknown} months       Months pass: the Season turns.
 * @property {() => unknown} year         A year passes: the Age turns, and the new one begins in Spring.
 * @property {() => unknown} end          End the Session: the book's end-of-session window.
 * @property {() => string|null} nextEvent The next seasonal event's name, or null once every one has passed.
 */

/** @type {TimeMoves} */
let moves = { weeks: () => null, months: () => null, year: () => null, end: () => null, nextEvent: () => null };

/** The buttons under the bar: the three ways of moving time on left to right, then End the Session under them. */
const MOVES = Object.freeze([
	{ move: "weeks", icon: "fa-solid fa-forward", label: "time.banner.weeks", hint: "time.banner.weeksHint" },
	{ move: "months", icon: "fa-solid fa-leaf", label: "time.banner.months", hint: "time.banner.monthsHint" },
	{ move: "year", icon: "fa-solid fa-hourglass-end", label: "time.banner.year", hint: "time.banner.yearHint" },
	{ move: "end", icon: "fa-solid fa-book-open", label: "sessionEnd.open", hint: "sessionEnd.openHint" }
]);

/** @returns {boolean} Whether this browser shows the calendar at the top of the screen. */
const phaseBannerShown = () => read(SHOWN_SETTING, true) !== false;

/**
 * What each tab of the banner says for a calendar, left to right.
 * @param {import("../rules/time.js").Calendar} calendar
 * @returns {{part: string, value: string, label: string, icon: string, light: string}[]}
 */
export function timeBannerTabs(calendar) {
	const { phase, season, age } = calendar;
	return [
		{ part: "phase", value: phase, label: t(`time.phases.${phase}`), icon: PHASE_ICONS[phase], light: `bastionland-card--${phase}` },
		{ part: "season", value: season, label: t(`time.seasons.${season}`), icon: SEASON_ICONS[season], light: `bastionland-card--${season}` },
		{
			part: "age",
			value: String(age),
			label: t("time.banner.age", { age: ordinalLabel(age) }),
			icon: AGE_ICON,
			light: "bastionland-time-banner__age"
		}
	];
}

/**
 * The icon and the words a tab shows.
 * @param {{icon: string, label: string}} face
 * @returns {string}
 */
const faceHTML = ({ icon, label }) => `<i class="${icon}" inert></i><span class="bastionland-time-banner__label">${foundry.utils.escapeHTML(label)}</span>`;

/**
 * Show a face on a tab at once.
 * @param {HTMLElement} tab
 * @param {ReturnType<typeof timeBannerTabs>[number]} face
 */
function dress(tab, face) {
	tab.className = `bastionland-time-banner__tab bastionland-time-banner__tab--${face.part} ${face.light}`;
	tab.dataset.value = face.value;
	tab.innerHTML = faceHTML(face);
}

/**
 * Slide a new face down over the tab from the top edge, the old one still showing under it until it's covered.
 * @param {HTMLElement} tab
 * @param {ReturnType<typeof timeBannerTabs>[number]} face
 */
function turn(tab, face) {
	const cover = document.createElement("span");
	cover.className = `bastionland-time-banner__face ${face.light}`;
	cover.innerHTML = faceHTML(face);
	tab.dataset.value = face.value;
	const finish = () => {
		if (turning.get(tab) !== finish) return;
		turning.delete(tab);
		clearTimeout(timer);
		dress(tab, face);
	};
	const timer = setTimeout(finish, TURN_TIMEOUT_MS);
	cover.addEventListener("animationend", finish);
	turning.set(tab, finish);
	tab.append(cover);
}

/**
 * Paint the banner for a calendar, and let a tab turn if what it shows has changed.
 * @param {import("../rules/time.js").Calendar} calendar
 */
function paint(calendar) {
	floor = null;
	if (!banner) return;
	const date = chronicleLabel(calendar);
	banner.setAttribute("aria-label", date);
	for (const face of timeBannerTabs(calendar)) {
		const tab = banner.querySelector(`[data-part="${face.part}"]`);
		if (!tab) continue;
		// The date would drop over the buttons let down under the bar, so it waits until they're put away.
		if (menu) delete tab.dataset.tooltip;
		else tab.dataset.tooltip = date;
		// Already sliding in; a second change straight after the first puts that one up and slides again.
		const sliding = turning.get(tab);
		if (sliding && tab.dataset.value === face.value) continue;
		sliding?.();
		const turned = tab.dataset.value && tab.dataset.value !== face.value;
		if (turned && !reducesMotion()) turn(tab, face);
		else dress(tab, face);
	}
}

/** Say on each button what it will do, the Weeks naming the event they run on to. */
function labelMoves() {
	const weeks = menu?.querySelector('[data-move="weeks"]');
	if (!weeks) return;
	// Every event of the Season has passed only when the last was marked by hand; Months Pass is all that's left.
	const event = moves.nextEvent();
	weeks.dataset.tooltip = event
		? t("time.banner.weeksHint", { event })
		: t("time.events.nothingLeft", { season: t(`time.seasons.${getCalendar().season}`) });
}

/** Let the GM's buttons down under the bar. */
function openMoves() {
	if (!banner || menu) return;
	menu = document.createElement("nav");
	menu.className = "bastionland-time-banner__moves";
	menu.setAttribute("aria-label", t("time.banner.moves"));
	// The bar reads each new date out; the buttons coming and going aren't news.
	menu.setAttribute("aria-live", "off");
	for (const { move, icon, label, hint } of MOVES) {
		const button = document.createElement("button");
		button.type = "button";
		button.dataset.move = move;
		button.dataset.tooltip = t(hint);
		button.innerHTML = `<i class="${icon}" inert></i> ${foundry.utils.escapeHTML(t(label))}`;
		button.addEventListener("click", () => {
			closeMoves();
			moves[move]();
		});
		menu.append(button);
	}
	banner.append(menu);
	labelMoves();
	for (const tab of banner.querySelectorAll("[data-part]")) {
		tab.setAttribute("aria-expanded", "true");
		delete tab.dataset.tooltip;
	}
	game.tooltip?.deactivate?.();
	document.addEventListener("pointerdown", awayFromMoves, true);
	document.addEventListener("keydown", escapeMoves, true);
}

/** Put the GM's buttons away again. */
function closeMoves() {
	if (!menu) return;
	menu.remove();
	menu = null;
	document.removeEventListener("pointerdown", awayFromMoves, true);
	document.removeEventListener("keydown", escapeMoves, true);
	if (!banner) return;
	for (const tab of banner.querySelectorAll("[data-part]")) tab.setAttribute("aria-expanded", "false");
	paint(getCalendar());
}

/** @param {PointerEvent} event A press anywhere but the bar puts the buttons away. */
function awayFromMoves(event) {
	if (!banner?.contains(event.target)) closeMoves();
}

/** @param {KeyboardEvent} event Escape puts the buttons away. */
function escapeMoves(event) {
	if (event.key !== "Escape") return;
	event.stopPropagation();
	closeMoves();
}

/** Put the banner up at the top of the screen, or bring it up to date if it's already there. */
export function showPhaseBanner() {
	if (!phaseBannerShown()) return closePhaseBanner();
	const top = globalThis.document?.getElementById("ui-top");
	if (!top) return;
	if (!banner) {
		const gm = Boolean(game.user?.isGM);
		banner = document.createElement("div");
		banner.id = "bastionland-phase-banner";
		banner.className = "bastionland bastionland-time-banner";
		banner.setAttribute("role", "status");
		for (const part of PARTS) {
			const tab = document.createElement(gm ? "button" : "div");
			tab.dataset.part = part;
			if (gm) {
				tab.type = "button";
				tab.setAttribute("aria-expanded", "false");
				tab.addEventListener("click", () => (menu ? closeMoves() : openMoves()));
			}
			banner.append(tab);
		}
		top.prepend(banner);
	}
	paint(getCalendar());
}

/** Take the banner down. */
export function closePhaseBanner() {
	closeMoves();
	banner?.remove();
	banner = null;
	floor = null;
}

/**
 * The bottom of the banner, which anything held over the top of the map keeps below.
 * Measuring it lays the page out, and it's asked for as the map moves, so the
 * figure is kept until the banner changes.
 * @returns {number} In CSS pixels, or 0 with no banner up.
 */
export function phaseBannerFloor() {
	floor ??= banner?.isConnected ? banner.getBoundingClientRect().bottom : 0;
	return floor;
}

/**
 * Register whether each browser shows the banner, and keep it turning with the calendar. Called during
 * init; the banner itself goes up once the world is ready, by showPhaseBanner.
 * @param {object} options
 * @param {TimeMoves} options.moves  What the GM's buttons under the bar do.
 */
export function registerPhaseBanner({ moves: given }) {
	moves = given;
	game.settings.register(SYSTEM_ID, SHOWN_SETTING, {
		name: "bastionland.settings.phaseBannerShown.name",
		hint: "bastionland.settings.phaseBannerShown.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
		onChange: () => showPhaseBanner()
	});
	Hooks.on(TEXT_SIZE_HOOK, () => (floor = null));
	Hooks.on(CALENDAR_HOOK, (calendar) => {
		if (!banner) return;
		paint(calendar);
		labelMoves();
	});
}
