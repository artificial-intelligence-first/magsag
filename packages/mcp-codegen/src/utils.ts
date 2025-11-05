const WORD_BOUNDARY = /[\s_\-:/]+/;

const normalizeSegments = (value: string): string[] =>
  value
    .split(WORD_BOUNDARY)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

export const toCamelCase = (value: string): string => {
  const segments = normalizeSegments(value);
  if (segments.length === 0) {
    return '';
  }
  const [first, ...rest] = segments;
  return (
    first.toLowerCase() +
    rest
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join('')
  );
};

export const toPascalCase = (value: string): string => {
  const segments = normalizeSegments(value);
  return segments
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join('');
};

export const toKebabCase = (value: string): string => {
  const segments = normalizeSegments(value);
  return segments.map((segment) => segment.toLowerCase()).join('-');
};

export const formatDocComment = (lines: string[]): string => {
  if (lines.length === 0) {
    return '';
  }
  const content = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (content.length === 0) {
    return '';
  }
  const formatted = ['/**', ...content.map((line) => ` * ${line}`), ' */'];
  return formatted.join('\n');
};
