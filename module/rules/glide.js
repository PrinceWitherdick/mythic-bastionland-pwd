/**
 * Something dragged and thrown slides on a little after it's let go, and
 * slows to a stop, as Stonetop's relationship map does, only shorter: a
 * Realm's chart is small, so a flick needn't carry it far. Speeds are in
 * pixels of the page per millisecond. Pure, so it can be tested without Foundry.
 */

/**
 * How much of the end of a drag the throw is read from, in milliseconds back
 * from the release, so a hand that pauses before letting go throws nothing.
 */
export const GLIDE_WINDOW_MS = 80;

/** One frame at 60Hz, the rate the friction is given for. */
const FRAME_MS = 1000 / 60;

/** What's left of the speed after one 60Hz frame: a throw runs about its speed times 140ms, half the relationship map's. */
export const GLIDE_FRICTION = 0.88;

/** Below this there's no throw, only a release, and a slide this slow has stopped. */
export const GLIDE_MIN_SPEED = 0.05;

/** The fastest throw taken, half the relationship map's, so a pointer that jumps can't fling the chart off. */
export const GLIDE_MAX_SPEED = 2;

/** The longest step one frame of a slide may take, however long the browser was away. */
const LONGEST_FRAME_MS = 64;

/**
 * @typedef {object} Velocity
 * @property {number} x
 * @property {number} y
 */

/**
 * How fast the pointer was going when it was let go, from the ends of the
 * trail it left in the last moments of the drag.
 * @param {{t: number, x: number, y: number}[]} samples In the order they came.
 * @param {number} now When it was let go, on the samples' clock.
 * @returns {Velocity} Nothing for a trail too short to read, or a pause before the release.
 */
export function throwVelocity(samples, now) {
	const recent = (samples ?? []).filter((sample) => now - sample.t <= GLIDE_WINDOW_MS);
	if (recent.length < 2) return { x: 0, y: 0 };
	const [first, last] = [recent[0], recent.at(-1)];
	const span = last.t - first.t;
	if (!(span > 0)) return { x: 0, y: 0 };
	const velocity = { x: (last.x - first.x) / span, y: (last.y - first.y) / span };
	const speed = Math.hypot(velocity.x, velocity.y);
	return speed > GLIDE_MAX_SPEED ? { x: (velocity.x * GLIDE_MAX_SPEED) / speed, y: (velocity.y * GLIDE_MAX_SPEED) / speed } : velocity;
}

/**
 * @param {Velocity} velocity
 * @returns {boolean} Whether it's still worth a frame.
 */
export const worthGliding = ({ x = 0, y = 0 } = {}) => Math.hypot(x, y) >= GLIDE_MIN_SPEED;

/**
 * One frame of a slide: how far it goes, and the speed left. The friction is
 * reckoned by the time passed, so a throw goes as far on any screen.
 * @param {Velocity} velocity
 * @param {number} dt Milliseconds since the last frame.
 * @returns {{dx: number, dy: number, velocity: Velocity}}
 */
export function glideStep(velocity, dt) {
	const step = Math.min(Math.max(Number(dt) || 0, 0), LONGEST_FRAME_MS);
	const left = GLIDE_FRICTION ** (step / FRAME_MS);
	return { dx: velocity.x * step, dy: velocity.y * step, velocity: { x: velocity.x * left, y: velocity.y * left } };
}
