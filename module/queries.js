/*
 * Every query this system answers is registered here, so whatever must wrap
 * them all (time-capture.js, telling what a client writes for another user
 * from its own advance) wraps each as it's registered, not by sweeping
 * CONFIG.queries again for handlers set since.
 */

/** @type {((name: string, handler: Function) => Function)|null} */
let wrapper = null;

/**
 * Register a query this client answers.
 * @param {string} name
 * @param {Function} handler
 */
export function registerQuery(name, handler) {
	CONFIG.queries[name] = wrapper ? wrapper(name, handler) : handler;
}

/**
 * Wrap every query registered so far, Foundry's own among them, and each one
 * registered after. A wrapper returns the handler as it was for one it leaves alone.
 * @param {(name: string, handler: Function) => Function} wrap
 */
export function wrapQueries(wrap) {
	wrapper = wrap;
	for (const [name, handler] of Object.entries(CONFIG.queries ?? {})) CONFIG.queries[name] = wrap(name, handler);
}
