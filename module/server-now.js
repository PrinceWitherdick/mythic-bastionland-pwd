/** @returns {number} Now, by the server's clock, which two clients share. */
export const serverNow = () => globalThis.game?.time?.serverTime ?? Date.now();
