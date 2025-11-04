import { SkillContext } from '../shared/types.js';

const toNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    if (typeof value === 'number') {
      return [value];
    }
    if (value === null || value === undefined) {
      return [];
    }
    return [Number(value) || 0];
  }
  return value
    .map((item) => {
      if (item === null || item === undefined) {
        return null;
      }
      const numeric = Number(item);
      return Number.isNaN(numeric) ? null : numeric;
    })
    .filter((item): item is number => item !== null);
};

export const run = async (
  payload: Record<string, unknown>,
  context: SkillContext = {}
): Promise<Record<string, unknown>> => {
  void context;
  const text = typeof payload.text === 'string' ? payload.text : String(payload.text ?? '');
  const value = Number(payload.value ?? 0) || 0;
  const numbers = toNumberArray(payload.numbers ?? []);
  const numbersTotal = numbers.reduce((sum, item) => sum + item, 0);

  return {
    upper_text: text.toUpperCase(),
    value_squared: value * value,
    numbers_doubled: numbers.map((item) => item * 2),
    numbers_total: numbersTotal,
    source: 'skill.test-helper-transform'
  };
};
