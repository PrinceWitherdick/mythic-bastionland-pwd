/** @returns {Actor[]} The actors of the Tokens this user has selected on the canvas, none when there's no canvas. */
export const selectedActors = () => (canvas?.tokens?.controlled ?? []).map((token) => token.actor);
