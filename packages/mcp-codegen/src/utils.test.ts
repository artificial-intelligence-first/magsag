import { describe, expect, it } from 'vitest';
import { formatDocComment, toCamelCase, toKebabCase, toPascalCase } from './utils.js';

describe('case conversion', () => {
  it('converts tokens to camelCase', () => {
    expect(toCamelCase('retrieve_page')).toBe('retrievePage');
    expect(toCamelCase('Retrieve Page')).toBe('retrievePage');
    expect(toCamelCase('list-issues')).toBe('listIssues');
  });

  it('converts tokens to PascalCase', () => {
    expect(toPascalCase('retrieve_page')).toBe('RetrievePage');
    expect(toPascalCase('Retrieve Page')).toBe('RetrievePage');
  });

  it('converts tokens to kebab-case', () => {
    expect(toKebabCase('Retrieve Page')).toBe('retrieve-page');
    expect(toKebabCase('sql_select')).toBe('sql-select');
  });
});

describe('formatDocComment', () => {
  it('returns empty string for empty payload', () => {
    expect(formatDocComment([])).toBe('');
    expect(formatDocComment(['   '])).toBe('');
  });

  it('formats doc comment block', () => {
    expect(formatDocComment(['Line one', 'Line two'])).toBe(
      ['/**', ' * Line one', ' * Line two', ' */'].join('\n')
    );
  });
});
