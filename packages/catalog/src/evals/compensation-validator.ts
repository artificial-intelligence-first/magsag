import { JsonValue } from '../shared/types.js';

type EvaluationResult = {
  score: number;
  passed: boolean;
  details: Record<string, JsonValue>;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const salaryRanges: Record<string, { min: number; max: number }> = {
  USD: { min: 30_000, max: 500_000 },
  EUR: { min: 25_000, max: 400_000 },
  GBP: { min: 20_000, max: 350_000 },
  JPY: { min: 3_000_000, max: 50_000_000 }
};

const extractCurrencyTuple = (offer: Record<string, unknown>): { amount: number; currency: string } => {
  const baseSalary = offer.base_salary;
  if (baseSalary && typeof baseSalary === 'object') {
    const record = baseSalary as Record<string, unknown>;
    const amount = typeof record.amount === 'number' ? record.amount : 0;
    const currency = typeof record.currency === 'string' ? record.currency : 'USD';
    return { amount, currency };
  }

  const amount = typeof baseSalary === 'number' ? baseSalary : 0;
  const currency = typeof offer.currency === 'string' ? offer.currency : 'USD';
  return { amount, currency };
};

export const salaryRangeCheck = (payload: Record<string, unknown>): EvaluationResult => {
  const offer = asRecord(payload.offer) ?? {};
  const { amount, currency } = extractCurrencyTuple(offer);
  const expected = salaryRanges[currency] ?? { min: 0, max: 1_000_000 };
  const withinRange = amount >= expected.min && amount <= expected.max;

  let score = 1;
  if (!withinRange) {
    const deviation =
      amount < expected.min
        ? (expected.min - amount) / expected.min
        : (amount - expected.max) / expected.max;
    score = Math.max(0, 1 - deviation);
  }

  return {
    score,
    passed: withinRange,
    details: {
      base_salary: amount,
      currency,
      expected_range: expected,
      within_range: withinRange
    }
  };
};

export const consistencyCheck = (payload: Record<string, unknown>): EvaluationResult => {
  const offer = asRecord(payload.offer) ?? {};
  const { amount: baseSalary, currency } = extractCurrencyTuple(offer);

  const signOn = asRecord(offer.sign_on_bonus);
  const bonus =
    signOn && typeof signOn.amount === 'number' ? signOn.amount : (typeof offer.bonus === 'number' ? offer.bonus : 0);
  const bonusCurrency =
    signOn && typeof signOn.currency === 'string' ? signOn.currency : currency;

  const equityRecord = asRecord(offer.equity);
  const equityValue =
    equityRecord && typeof equityRecord.amount === 'number'
      ? equityRecord.amount
      : (typeof offer.equity_value === 'number' ? offer.equity_value : 0);

  const issues: string[] = [];
  let score = 1;

  if (bonus > 0 && bonusCurrency !== currency) {
    issues.push('currency_mismatch');
    score -= 0.2;
  }

  const totalComp = baseSalary + bonus + equityValue;
  if (totalComp < baseSalary) {
    issues.push('total_compensation_less_than_base');
    score -= 0.3;
  }

  if (equityValue > 0) {
    const ratio = baseSalary > 0 ? equityValue / baseSalary : 0;
    if (ratio > 2) {
      issues.push('equity_value_unusually_high');
      score -= 0.2;
    }
  }

  if (bonus > 0) {
    const ratio = baseSalary > 0 ? bonus / baseSalary : 0;
    if (ratio > 1) {
      issues.push('sign_on_bonus_unusually_high');
      score -= 0.2;
    }
  }

  if (baseSalary < 0 || bonus < 0 || equityValue < 0) {
    issues.push('negative_values_detected');
    score -= 0.5;
  }

  score = Math.max(0, score);
  return {
    score,
    passed: score >= 0.9,
    details: {
      total_compensation: totalComp,
      base_salary: baseSalary,
      sign_on_bonus: bonus,
      equity_value: equityValue,
      currency,
      issues
    }
  };
};

export const completenessCheck = (payload: Record<string, unknown>): EvaluationResult => {
  const offer = asRecord(payload.offer) ?? {};
  const requiredFields = ['role', 'base_salary', 'band'];
  const recommendedFields = ['sign_on_bonus', 'equity', 'notes'];

  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];

  for (const field of requiredFields) {
    const value = offer[field];
    if (value === undefined || value === null || value === '') {
      missingRequired.push(field);
    } else if (field === 'base_salary') {
      const record = asRecord(value);
      if (!record || record.currency === undefined || record.amount === undefined) {
        missingRequired.push('base_salary.currency_or_amount');
      }
    } else if (field === 'band') {
      const record = asRecord(value);
      if (!record || record.currency === undefined || record.min === undefined || record.max === undefined) {
        missingRequired.push('band.required_fields');
      }
    }
  }

  for (const field of recommendedFields) {
    const value = offer[field];
    if (value === undefined || value === null || value === '') {
      missingRecommended.push(field);
    }
  }

  const requiredScore =
    requiredFields.length > 0 ? 1 - missingRequired.length / requiredFields.length : 1;
  const recommendedScore =
    recommendedFields.length > 0 ? 1 - missingRecommended.length / recommendedFields.length : 1;
  const score = requiredScore * 0.8 + recommendedScore * 0.2;

  return {
    score,
    passed: missingRequired.length === 0,
    details: {
      missing_required: missingRequired,
      missing_recommended: missingRecommended,
      required_fields: requiredFields,
      recommended_fields: recommendedFields
    }
  };
};

export const METRICS = {
  salary_range_check: salaryRangeCheck,
  consistency_check: consistencyCheck,
  completeness_check: completenessCheck
};
