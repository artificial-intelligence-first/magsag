import { SkillContext } from '../shared/types.js';

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;

export const run = async (
  payload: Record<string, unknown>,
  context: SkillContext = {}
): Promise<Record<string, unknown>> => {
  void context;
  const resultsValue = payload.results;
  const resultList = Array.isArray(resultsValue)
    ? resultsValue
        .map(toRecord)
        .filter((item): item is Record<string, unknown> => item !== null)
    : [];

  if (resultList.length === 0) {
    return {};
  }

  if (resultList.length === 1) {
    return { ...resultList[0] };
  }

  const aggregated: Record<string, unknown> = {};
  for (const result of resultList) {
    for (const [key, value] of Object.entries(result)) {
      aggregated[key] = value;
    }
  }

  return aggregated;
};
