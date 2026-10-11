import { reducesMotion } from "../client-settings.js";
import { GLIDE_WINDOW_MS, glideStep, throwVelocity, worthGliding } from "../rules/glide.js";

/**
 * Dragging something about with either button and throwing it, as the Places
 * chart and the Timeline's board are. A press is a drag only once it has
 * travelled a few pixels, so a click still lands where it was aimed; let go
 * moving, it slides on a little and slows to a stop (rules/glide.js); and the
 * click or menu a drag's release makes is swallowed. What moves, and how, is
 * the caller's.
 */

/** How far, in pixels, a press travels before it's a drag rather than a click. */
const LIFT_PX = 4;

/** @returns {number} The clock a drag's trail and a slide are timed on. */
const now = () => performance.now();

/**
 * @template From
 * @param {Element} el What's pressed on, and what keeps the pointer while it's dragged.
 * @param {object} how
 * @param {(event: PointerEvent) => From|null} how.grab Where a drag from this press starts, or null when the press drags nothing.
 * @param {(from: From, dx: number, dy: number) => void} how.pan Move to where the pointer has got to, dx and dy pixels of the page from the press.
 * @param {(dx: number, dy: number) => {x: boolean, y: boolean}|null} how.slide Move on dx and dy pixels of the page, after a throw:
 *   which ways an edge stopped it, or null to stop altogether.
 * @param {string} how.draggingClass Worn while a drag is under way.
 * @returns {{stop: () => boolean, rebase: (from: From) => void, off: () => void}} Stop a slide, saying whether one was running;
 *   carry a drag under way on from the pointer as it is now, as when a zoom moved what it drags; take it all off.
 */
export function wirePanDrag(el, { grab, pan, slide, draggingClass }) {
	/** @type {{id: number, right: boolean, x: number, y: number, lastX: number, lastY: number, from: From, lifted: boolean}|null} */
	let press = null;
	/** @type {{t: number, x: number, y: number}[]} The end of a drag's trail, for how hard it was thrown. */
	let marks = [];
	/** The frame a drag's paint waits on, so many moves make one paint. */
	let frame = 0;
	/** @type {{velocity: {x: number, y: number}, at: number, id: number}|null} */
	let glide = null;
	/** Whether the next click or menu ends a drag, or caught a slide, rather than being asked for. */
	let swallowClick = false;
	let swallowMenu = false;

	const mark = (event) => {
		const t = now();
		marks.push({ t, x: event.clientX, y: event.clientY });
		while (marks.length > 2 && t - marks[0].t > GLIDE_WINDOW_MS) marks.shift();
	};

	const stop = () => {
		const running = Boolean(glide);
		if (glide) cancelAnimationFrame(glide.id);
		glide = null;
		return running;
	};

	const glideFrame = () => {
		if (!glide) return;
		if (!el.isConnected) {
			glide = null;
			return;
		}
		const t = now();
		const { dx, dy, velocity } = glideStep(glide.velocity, t - glide.at);
		glide.at = t;
		glide.velocity = velocity;
		const blocked = slide(dx, dy);
		// Stopped by an edge, it slides on along it, or stops.
		if (blocked?.x) glide.velocity.x = 0;
		if (blocked?.y) glide.velocity.y = 0;
		if (blocked && worthGliding(glide.velocity)) glide.id = requestAnimationFrame(glideFrame);
		else glide = null;
	};

	const paint = () => {
		frame = 0;
		if (press?.lifted) pan(press.from, press.lastX - press.x, press.lastY - press.y);
	};

	const onDown = (event) => {
		// A hand put down on a slide stops it, and a left press that did only that chooses nothing.
		swallowClick = stop() && event.button === 0;
		const right = event.button === 2;
		if (press || (event.button !== 0 && !right) || event.buttons > 2) return;
		const from = grab(event);
		if (from === null || from === undefined) return;
		press = { id: event.pointerId, right, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, from, lifted: false };
		marks = [{ t: now(), x: event.clientX, y: event.clientY }];
	};

	const onMove = (event) => {
		if (press?.id !== event.pointerId) return;
		press.lastX = event.clientX;
		press.lastY = event.clientY;
		mark(event);
		if (!press.lifted) {
			if (Math.hypot(press.lastX - press.x, press.lastY - press.y) < LIFT_PX) return;
			// Only now is it a drag: a click that never moved lands where it was aimed.
			press.lifted = true;
			el.setPointerCapture?.(event.pointerId);
			el.classList.add(draggingClass);
			globalThis.getSelection?.()?.removeAllRanges();
		}
		event.preventDefault();
		frame ||= requestAnimationFrame(paint);
	};

	const finish = (event, released) => {
		if (press?.id !== event.pointerId) return;
		// Taken away rather than let go, there's no click to come.
		if (!released) swallowClick = false;
		// Where it was let go, not a frame behind.
		if (frame) {
			cancelAnimationFrame(frame);
			paint();
		}
		const { lifted, right } = press;
		press = null;
		if (!lifted) return;
		el.classList.remove(draggingClass);
		if (el.hasPointerCapture?.(event.pointerId)) el.releasePointerCapture(event.pointerId);
		if (released) {
			// The click or menu a drag's release makes wasn't asked for.
			if (right) swallowMenu = true;
			else swallowClick = true;
			mark(event);
			const velocity = throwVelocity(marks, now());
			if (worthGliding(velocity) && !reducesMotion()) {
				glide = { velocity, at: now(), id: 0 };
				glide.id = requestAnimationFrame(glideFrame);
			}
		}
		marks = [];
	};
	const onUp = (event) => finish(event, true);
	// Only while a press is live: lostpointercapture also follows every ordinary release, before its click.
	const onCancel = (event) => finish(event, false);

	const onClick = (event) => {
		if (!swallowClick) return;
		swallowClick = false;
		// A press let go off the element makes no click, so the flag outlives it: a click from the keyboard still goes through.
		if (event.detail === 0) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	};
	const onMenu = (event) => {
		if (!swallowMenu) return;
		swallowMenu = false;
		event.preventDefault();
		event.stopPropagation();
	};

	const listeners = [
		["pointerdown", onDown],
		["pointermove", onMove],
		["pointerup", onUp],
		["pointercancel", onCancel],
		["lostpointercapture", onCancel],
		["click", onClick, { capture: true }],
		["contextmenu", onMenu, { capture: true }]
	];
	for (const [type, fn, options] of listeners) el.addEventListener(type, fn, options);

	return {
		stop,
		rebase(from) {
			if (press) Object.assign(press, { x: press.lastX, y: press.lastY, from });
		},
		off() {
			stop();
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
			press = null;
			for (const [type, fn, options] of listeners) el.removeEventListener(type, fn, options);
		}
	};
}
