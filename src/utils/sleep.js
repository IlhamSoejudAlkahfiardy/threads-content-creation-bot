/**
 * Delay execution for a given number of milliseconds
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = sleep;
