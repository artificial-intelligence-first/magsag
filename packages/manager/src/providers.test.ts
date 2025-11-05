import { describe, expect, it } from 'vitest';
import { parseGitShortstat } from './providers.js';

describe('parseGitShortstat', () => {
  it('counts insertions and deletions when both are present', () => {
    const summary = '3 files changed, 4 insertions(+), 2 deletions(-)';
    expect(parseGitShortstat(summary)).toBe(6);
  });

  it('counts insertions when deletions are omitted', () => {
    const summary = '1 file changed, 5 insertions(+)';
    expect(parseGitShortstat(summary)).toBe(5);
  });

  it('counts deletions when insertions are omitted', () => {
    const summary = '2 files changed, 7 deletions(-)';
    expect(parseGitShortstat(summary)).toBe(7);
  });

  it('returns zero when no insertion or deletion details exist', () => {
    const summary = '0 files changed';
    expect(parseGitShortstat(summary)).toBe(0);
  });
});
