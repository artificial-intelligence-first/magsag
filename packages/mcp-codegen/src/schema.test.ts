import { describe, expect, it } from 'vitest';
import { renderType, schemaToTypeAlias } from './schema.js';

describe('renderType', () => {
  it('renders primitive types', () => {
    expect(renderType({ type: 'string' })).toBe('string');
    expect(renderType({ type: 'number' })).toBe('number');
    expect(renderType({ type: 'boolean' })).toBe('boolean');
  });

  it('renders enums', () => {
    expect(renderType({ enum: ['a', 'b'] })).toBe('"a" | "b"');
  });

  it('renders arrays', () => {
    expect(renderType({ type: 'array', items: { type: 'string' } })).toBe('ReadonlyArray<string>');
  });

  it('renders objects with required and optional fields', () => {
    expect(
      renderType({
        type: 'object',
        required: ['foo'],
        properties: {
          foo: { type: 'string' },
          bar: { type: 'number' }
        }
      })
    ).toBe(['{', '  foo: string;', '  bar?: number;', '}'].join('\n'));
  });
});

describe('schemaToTypeAlias', () => {
  it('renders exportable type alias with doc comment', () => {
    expect(
      schemaToTypeAlias(
        'Example',
        {
          type: 'object',
          properties: { foo: { type: 'string', description: 'Foo value' } }
        },
        { description: 'Example payload' }
      )
    ).toContain('export type Example');
  });
});
