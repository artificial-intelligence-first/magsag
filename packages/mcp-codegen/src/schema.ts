import { formatDocComment } from './utils.js';

export interface JsonSchema {
  type?: string | string[];
  description?: string;
  enum?: Array<string | number | boolean | null>;
  const?: string | number | boolean | null;
  items?: JsonSchema | JsonSchema[];
  properties?: Record<string, JsonSchema | undefined>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  format?: string;
}

const indent = (value: string, spaces = 2): string =>
  value
    .split('\n')
    .map((line) => (line.length > 0 ? ' '.repeat(spaces) + line : line))
    .join('\n');

const renderLiteral = (value: string | number | boolean | null): string => {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return Number.isFinite(value) ? value.toString() : 'number';
};

const renderEnum = (values: Array<string | number | boolean | null>): string => {
  if (values.length === 0) {
    return 'never';
  }
  return values.map((item) => renderLiteral(item)).join(' | ');
};

const renderArray = (schema: JsonSchema | undefined): string => {
  const itemType = schema ? renderType(schema) : 'unknown';
  return `ReadonlyArray<${itemType}>`;
};

const renderAdditionalProperties = (
  schema: boolean | JsonSchema | undefined
): string | undefined => {
  if (schema === undefined || schema === false) {
    return undefined;
  }
  if (schema === true) {
    return '[key: string]: unknown;';
  }
  return `[key: string]: ${renderType(schema)};`;
};

const renderObject = (schema: JsonSchema): string => {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const lines: string[] = [];

  for (const [key, child] of Object.entries(properties)) {
    if (!child) {
      continue;
    }
    const doc = child.description ? formatDocComment([child.description]) : '';
    if (doc) {
      lines.push(doc);
    }
    const optional = required.has(key) ? '' : '?';
    const safeKey = /^[a-zA-Z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
    lines.push(`${safeKey}${optional}: ${renderType(child)};`);
  }

  const additional = renderAdditionalProperties(schema.additionalProperties);
  if (additional) {
    lines.push(additional);
  }

  if (lines.length === 0) {
    return 'Record<string, unknown>';
  }

  return `{\n${indent(lines.join('\n'))}\n}`;
};

const renderAllOf = (schemas: JsonSchema[]): string => {
  if (schemas.length === 0) {
    return 'unknown';
  }
  return schemas.map((schema) => renderType(schema)).join(' & ');
};

const renderCompositeUnion = (schemas: JsonSchema[]): string => {
  if (schemas.length === 0) {
    return 'never';
  }
  return schemas.map((schema) => renderType(schema)).join(' | ');
};

export const renderType = (schema: JsonSchema | undefined): string => {
  if (!schema) {
    return 'unknown';
  }

  if (schema.const !== undefined) {
    return renderLiteral(schema.const);
  }

  if (schema.enum) {
    return renderEnum(schema.enum);
  }

  if (schema.allOf && schema.allOf.length > 0) {
    return renderAllOf(schema.allOf);
  }

  if (schema.anyOf && schema.anyOf.length > 0) {
    return renderCompositeUnion(schema.anyOf);
  }

  if (schema.oneOf && schema.oneOf.length > 0) {
    return renderCompositeUnion(schema.oneOf);
  }

  const { type } = schema;

  if (!type) {
    return 'unknown';
  }

  if (Array.isArray(type)) {
    const uniqueTypes = Array.from(new Set(type));
    return uniqueTypes.map((item) => renderType({ ...schema, type: item })).join(' | ');
  }

  switch (type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      if (Array.isArray(schema.items)) {
        const tupleItems = schema.items.map((item) => renderType(item)).join(', ');
        return `[${tupleItems}${schema.additionalProperties ? ', ...unknown[]' : ''}]`;
      }
      return renderArray(schema.items);
    case 'object':
      return renderObject(schema);
    default:
      return 'unknown';
  }
};

export const schemaToTypeAlias = (
  typeName: string,
  schema: JsonSchema | undefined,
  options: { export?: boolean; description?: string } = {}
): string => {
  const declaration = `${options.export === false ? '' : 'export '}type ${typeName} = ${renderType(
    schema
  )};`;
  const docComment = options.description ? formatDocComment([options.description]) : '';
  if (!docComment) {
    return declaration;
  }
  return `${docComment}\n${declaration}`;
};
