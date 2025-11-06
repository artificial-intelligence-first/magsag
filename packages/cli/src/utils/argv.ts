const CAMEL_TO_KEBAB_REGEX = /([a-z0-9])([A-Z])/g;

const toKebabCase = (value: string): string =>
  value
    .replace(CAMEL_TO_KEBAB_REGEX, (_match, lower: string, upper: string) => `${lower}-${upper}`)
    .toLowerCase();

const buildAliasMap = (flagNames: readonly string[]): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const name of flagNames) {
    if (!name || name.includes('-')) {
      continue;
    }
    if (name.toLowerCase() === name) {
      continue;
    }
    const kebab = toKebabCase(name);
    map[kebab] = name;
  }
  return map;
};

export const normalizeCamelCaseFlags = (
  argv: readonly string[],
  flagNames: readonly string[]
): string[] => {
  const map = buildAliasMap(flagNames);
  if (Object.keys(map).length === 0) {
    return Array.from(argv);
  }

  return Array.from(argv).map((token) => {
    if (!token.startsWith('--')) {
      return token;
    }

    const isNegation = token.startsWith('--no-');
    const prefix = isNegation ? '--no-' : '--';
    const startIndex = prefix.length;
    const separatorIndex = token.indexOf('=', startIndex);
    const nameSegment =
      separatorIndex >= startIndex ? token.slice(startIndex, separatorIndex) : token.slice(startIndex);
    const lookupKey = nameSegment.toLowerCase();
    const normalized = map[lookupKey];

    if (!normalized) {
      return token;
    }

    const suffix = separatorIndex >= startIndex ? token.slice(separatorIndex) : '';
    return `${prefix}${normalized}${suffix}`;
  });
};
