/**
 * Task Decomposition skill implemented in Node.js.
 * Mirrors the previous Python implementation while keeping the contract stable.
 */

/**
 * Normalize the incoming payload into a candidate profile object.
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown>}
 */
const resolveCandidateProfile = (payload) => {
  if (
    payload &&
    typeof payload === 'object' &&
    'candidate_profile' in payload &&
    typeof payload.candidate_profile === 'object' &&
    payload.candidate_profile !== null
  ) {
    return payload.candidate_profile;
  }
  return payload && typeof payload === 'object' ? payload : {};
};

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export const run = async (payload) => {
  const profile = resolveCandidateProfile(payload ?? {});
  return [
    {
      sag_id: 'compensation-advisor-sag',
      input: {
        candidate_profile: profile
      }
    }
  ];
};
