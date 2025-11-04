/**
 * Deterministic test helper transformations.
 */

/**
 * @param {unknown} numbers
 * @returns {number[]}
 */
const collectNumbers = (numbers) => {
  if (numbers == null) {
    return [];
  }

  if (Array.isArray(numbers)) {
    return numbers
      .map((entry) => toNumber(entry))
      .filter((entry) => typeof entry === 'number');
  }

  if (typeof numbers === 'string' || typeof numbers === 'number' || typeof numbers === 'bigint') {
    const numeric = toNumber(numbers);
    return typeof numeric === 'number' ? [numeric] : [];
  }

  if (typeof numbers === 'object' && Symbol.iterator in numbers) {
    const collected = [];
    for (const entry of /** @type {Iterable<unknown>} */ (numbers)) {
      const numeric = toNumber(entry);
      if (typeof numeric === 'number') {
        collected.push(numeric);
      }
    }
    return collected;
  }

  return [];
};

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
const toNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<Record<string, unknown>>}
 */
export const run = async (payload) => {
  const text = typeof payload?.text === 'string' ? payload.text : String(payload?.text ?? '');
  const numericValue = Number.isFinite(Number(payload?.value))
    ? Number(payload?.value)
    : 0;

  const numbers = collectNumbers(payload?.numbers);

  return {
    upper_text: text.toUpperCase(),
    value_squared: numericValue * numericValue,
    numbers_doubled: numbers.map((entry) => entry * 2),
    numbers_total: numbers.reduce((acc, entry) => acc + entry, 0),
    source: 'skill.test-helper-transform'
  };
};
