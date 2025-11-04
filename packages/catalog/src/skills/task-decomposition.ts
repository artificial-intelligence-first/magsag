import { SkillContext } from '../shared/types.js';

export const run = async (
  payload: Record<string, unknown>,
  context: SkillContext = {}
): Promise<Array<Record<string, unknown>>> => {
  void context;
  const profile =
    payload.candidate_profile && typeof payload.candidate_profile === 'object'
      ? (payload.candidate_profile as Record<string, unknown>)
      : payload;

  return [
    {
      sag_id: 'compensation-advisor-sag',
      input: { candidate_profile: profile }
    }
  ];
};
