/**
 * Result Aggregation skill implemented in Node.js.
 * Consolidates outputs from multiple sub-agents.
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<Record<string, unknown>>}
 */
export const run = async (payload) => {
  const results = Array.isArray(payload?.results) ? payload.results : [];

  if (results.length === 0) {
    return {};
  }

  if (results.length === 1) {
    return isRecord(results[0]) ? results[0] : {};
  }

  return results.reduce((acc, entry) => {
    if (isRecord(entry)) {
      Object.assign(acc, entry);
    }
    return acc;
  }, {});
};
