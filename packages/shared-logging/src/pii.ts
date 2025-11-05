export interface PiiMatch {
  readonly type: 'EMAIL' | 'PHONE' | 'SSN' | 'CREDIT_CARD';
  readonly value: string;
}

interface Pattern {
  readonly type: PiiMatch['type'];
  readonly regex: RegExp;
}

const PATTERNS: Pattern[] = [
  {
    type: 'EMAIL',
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
  },
  {
    type: 'PHONE',
    regex: /(?:(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*\d{3}\s*\)|\d{3})\s*(?:[.-]\s*)?)\d{3}\s*(?:[.-]\s*)?\d{4}/g
  },
  {
    type: 'SSN',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g
  },
  {
    type: 'CREDIT_CARD',
    regex: /\b(?:\d[ -]*?){13,16}\b/g
  }
];

export interface MaskResult {
  readonly masked: string;
  readonly matches: PiiMatch[];
}

export const maskSensitiveText = (input: string): MaskResult => {
  let masked = input;
  const matches: PiiMatch[] = [];

  for (const pattern of PATTERNS) {
    masked = masked.replace(pattern.regex, (match) => {
      matches.push({ type: pattern.type, value: match });
      return `[PII:${pattern.type}]`;
    });
  }

  return { masked, matches };
};

export const containsPii = (input: string): boolean => maskSensitiveText(input).matches.length > 0;
