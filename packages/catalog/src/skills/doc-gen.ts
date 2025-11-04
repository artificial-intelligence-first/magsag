import { createRequire } from 'node:module';
import type { ValidateFunction } from 'ajv';
import { SkillContext, McpRuntime, McpToolResult } from '../shared/types.js';
import candidateProfileSchemaJson from '../../../../catalog/contracts/candidate_profile.schema.json' with { type: 'json' };
import offerPacketSchemaJson from '../../../../catalog/contracts/offer_packet.schema.json' with { type: 'json' };

const moduleRequire = createRequire(import.meta.url);

const TEMPLATE_QUERY = `
SELECT
    summary_template,
    talking_points_template,
    default_warnings,
    provenance_inputs,
    provenance_schemas
FROM offer_templates
WHERE slug = $1 OR slug = 'default'
ORDER BY CASE WHEN slug = $1 THEN 0 ELSE 1 END
LIMIT 1
`;

const INPUT_SCHEMA_PATH = 'catalog/contracts/candidate_profile.schema.json';
const OUTPUT_SCHEMA_PATH = 'catalog/contracts/offer_packet.schema.json';

const AjvModule = moduleRequire('ajv/dist/2020.js') as { default?: typeof import('ajv').default };
const AjvFactory = (AjvModule.default ?? AjvModule) as typeof import('ajv').default;
const addFormatsModule = moduleRequire('ajv-formats') as { default?: (ajvInstance: unknown) => void };
const addFormats = (addFormatsModule.default ?? addFormatsModule) as (ajvInstance: unknown) => void;

const ajv = new AjvFactory({ strict: false, allErrors: true });
addFormats(ajv);
const validatorCache = new Map<string, ValidateFunction>();
const schemaCache: Record<string, Record<string, unknown>> = {
  [INPUT_SCHEMA_PATH]: candidateProfileSchemaJson as Record<string, unknown>,
  [OUTPUT_SCHEMA_PATH]: offerPacketSchemaJson as Record<string, unknown>
};

const compileSchema = (pathKey: string): ValidateFunction => {
  const memoized = validatorCache.get(pathKey);
  if (memoized) {
    return memoized;
  }

  const schema = schemaCache[pathKey];
  if (!schema) {
    throw new Error(`Unknown schema requested: ${pathKey}`);
  }

  const validator = ajv.compile(schema);
  validatorCache.set(pathKey, validator);
  return validator;
};

const validateSchema = (pathKey: string, data: unknown, label: string): void => {
  const validator = compileSchema(pathKey);
  if (validator(data)) {
    return;
  }
  const errors = validator.errors ?? [];
  const details =
    errors.length > 0
      ? errors
          .map((item) => {
            const instancePath = item.instancePath && item.instancePath.length > 0 ? item.instancePath : '/';
            const message = item.message ?? 'is invalid';
            return `${instancePath} ${message}`.trim();
          })
          .join('; ')
      : 'validation failed';
  throw new Error(`${label} validation failed: ${details}`);
};

type OfferTemplate = {
  summaryTemplate: string;
  talkingPoints: string[];
  defaultWarnings: string[];
  provenanceInputs: string[];
  provenanceSchemas: Record<string, unknown>;
};

const ensureMcp = (context: SkillContext): McpRuntime => {
  if (!context.mcp) {
    throw new Error("doc-gen requires an MCP runtime with access to the 'pg-readonly' server.");
  }
  return context.mcp;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const toFiniteNumber = (value: unknown, field: string): number | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${field} must be a finite number`);
    }
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${field} must be a finite number`);
    }
    return parsed;
  }
  throw new Error(`${field} must be a finite number`);
};

const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeCandidate = (payload: Record<string, unknown>): Record<string, unknown> => {
  const identifier = String(payload.id ?? '').trim();
  if (!identifier) {
    throw new Error("Candidate profile requires an 'id' field");
  }
  return {
    id: identifier,
    name: asNonEmptyString(payload.name) ?? 'Unknown Candidate',
    role: asNonEmptyString(payload.role) ?? asNonEmptyString(payload.title) ?? 'Unknown Role',
    level: asNonEmptyString(payload.level) ?? asNonEmptyString(payload.seniority),
    location: asNonEmptyString(payload.location)
  };
};

const compensationSection = (payload: Record<string, unknown>): Record<string, unknown> => {
  const rawBand = asRecord(payload.salary_band);
  const band = rawBand ?? {};
  const currency = band.currency ?? 'USD';

  const baseAmount =
    toFiniteNumber(payload.base_salary, 'payload.base_salary') ??
    toFiniteNumber(band.base, 'salary_band.base') ??
    toFiniteNumber(band.min, 'salary_band.min');

  const ceilingAmount =
    toFiniteNumber(payload.max_salary, 'payload.max_salary') ??
    toFiniteNumber(band.max, 'salary_band.max') ??
    toFiniteNumber(band.ceiling, 'salary_band.ceiling');

  const components: Record<string, unknown> = {};
  if (baseAmount !== undefined) {
    components.base = { amount: baseAmount, currency };
  }
  if (ceilingAmount !== undefined) {
    components.ceiling = { amount: ceilingAmount, currency };
  }
  if (payload.variable_comp) {
    components.variable = payload.variable_comp;
  }
  if (payload.equity) {
    components.equity = payload.equity;
  }
  if (payload.compensation_recommendation) {
    components.recommendation = payload.compensation_recommendation;
  }

  return {
    components,
    source: payload.salary_band_source ?? band.source
  };
};

const collectWarnings = (
  payload: Record<string, unknown>,
  compensation: Record<string, unknown>
): string[] => {
  const warnings: string[] = [];
  const components = asRecord(compensation.components) ?? {};
  if (Object.keys(components).length === 0) {
    warnings.push('Salary band information is missing; confirm compensation details.');
  }
  if (!payload.advisor_notes) {
    warnings.push('Advisor notes not supplied.');
  }
  const salaryBandRecord = asRecord(payload.salary_band);
  if (!salaryBandRecord || Object.keys(salaryBandRecord).length === 0) {
    warnings.push('Salary band lookup result not attached.');
  }
  return warnings;
};

const templateSlug = (candidate: Record<string, unknown>): string => {
  const role = String(candidate.role ?? '').trim().toLowerCase() || 'unknown-role';
  const level = String(candidate.level ?? '').trim().toLowerCase() || 'unknown-level';
  return `${role}:${level}`;
};

const renderTemplate = (template: string, context: Record<string, unknown>): string => {
  return template.replace(/\{([^}]+)\}/g, (_match, key) => {
    const value = context[key as string];
    return value === undefined ? `{${key}}` : String(value);
  });
};

const ensureToolResult = (result: McpToolResult | undefined, slug: string): OfferTemplate => {
  if (!result || !result.success) {
    const errorMessage = result?.error ?? 'unknown error';
    throw new Error(`Failed to load offer template via MCP: ${errorMessage}`);
  }
  const payload = asRecord(result.output);
  const rows = Array.isArray(payload?.rows) ? payload?.rows : [];
  const firstRow = asRecord(rows?.[0]);
  if (!firstRow) {
    throw new Error(`No offer template found for slug '${slug}' (including default).`);
  }

  const summaryTemplate = typeof firstRow.summary_template === 'string' ? firstRow.summary_template : '';
  if (!summaryTemplate.trim()) {
    throw new Error(
      `Offer template '${slug}' is missing a summary_template string in the database.`
    );
  }

  const talkingPointsRaw = firstRow.talking_points_template;
  let talkingPoints: string[] = [];
  if (typeof talkingPointsRaw === 'string') {
    talkingPoints = talkingPointsRaw
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  } else if (Array.isArray(talkingPointsRaw)) {
    talkingPoints = talkingPointsRaw.map((item) => String(item));
  }

  const defaultWarnings = Array.isArray(firstRow.default_warnings)
    ? firstRow.default_warnings.map((item) => String(item))
    : firstRow.default_warnings
    ? [String(firstRow.default_warnings)]
    : [];

  const provenanceInputs = Array.isArray(firstRow.provenance_inputs)
    ? firstRow.provenance_inputs.map((item) => String(item))
    : firstRow.provenance_inputs
    ? [String(firstRow.provenance_inputs)]
    : [];

  const provenanceSchemas =
    asRecord(firstRow.provenance_schemas) ?? (firstRow.provenance_schemas ? { raw: firstRow.provenance_schemas } : {});

  return {
    summaryTemplate,
    talkingPoints,
    defaultWarnings,
    provenanceInputs,
    provenanceSchemas
  };
};

const loadOfferTemplate = async (
  slug: string,
  runtime: McpRuntime
): Promise<OfferTemplate> => {
  const result = await runtime.queryPostgres?.({
    serverId: 'pg-readonly',
    sql: TEMPLATE_QUERY,
    params: [slug]
  });
  return ensureToolResult(result, slug);
};

const buildNarrativeFallback = (
  candidate: Record<string, unknown>,
  compensation: Record<string, unknown>
): { summary: string; talking_points: string } => {
  const components = asRecord(compensation.components) ?? {};
  const baseComponent = asRecord(components.base);
  const candidateName = candidate.name ?? candidate.id ?? 'the candidate';
  const role = candidate.role ?? 'the target role';
  const basePhrase =
    baseComponent && baseComponent.amount !== undefined
      ? `${baseComponent.amount} ${baseComponent.currency ?? 'USD'}`
      : 'a competitive base salary aligned with market data';
  const lines = [
    `Recommend ${basePhrase} for ${candidateName} (${role}).`,
    'Total compensation aligns with market benchmarks and advisor guidance.'
  ];
  if (compensation.source) {
    lines.push(`Compensation source: ${compensation.source}.`);
  }
  return {
    summary: lines.join(' '),
    talking_points: lines.join('\n')
  };
};

export const run = async (
  payload: Record<string, unknown>,
  context: SkillContext = {}
): Promise<Record<string, unknown>> => {
  validateSchema(INPUT_SCHEMA_PATH, payload, 'doc-gen input');
  const mcp = ensureMcp(context);
  const candidate = normalizeCandidate(payload);
  const compensation = compensationSection(payload);
  const slug =
    typeof payload.template_slug === 'string' && payload.template_slug.length > 0
      ? payload.template_slug
      : templateSlug(candidate);

  const template = await loadOfferTemplate(slug, mcp);

  const baseComponent = asRecord(compensation.components)?.base;
  const baseRecord = asRecord(baseComponent);
  const baseAmount = toFiniteNumber(baseRecord?.amount, 'compensation.components.base.amount');
  const baseCurrency = baseRecord?.currency ?? 'USD';

  const contextMap: Record<string, unknown> = {
    candidate_name: candidate.name ?? candidate.id,
    candidate_role: candidate.role ?? 'Unknown Role',
    candidate_level: candidate.level ?? 'Unknown Level',
    location: candidate.location ?? 'Unknown Location',
    base_salary_amount: baseAmount ?? '',
    base_salary_currency: baseCurrency,
    base_salary_phrase:
      baseAmount !== undefined ? `${baseAmount} ${baseCurrency}` : 'market-aligned base salary',
    base_salary: baseAmount ?? 'market-aligned base salary',
    advisor_notes: payload.advisor_notes ?? ''
  };

  const summary = renderTemplate(template.summaryTemplate, contextMap);
  const talkingPointsText = template.talkingPoints
    .map((point) => renderTemplate(point, contextMap))
    .join('\n');
  const fallbackNarrative = buildNarrativeFallback(candidate, compensation);

  const narrative = {
    summary,
    talking_points: talkingPointsText || fallbackNarrative.talking_points
  };

  const warnings = Array.from(
    new Set([...template.defaultWarnings, ...collectWarnings(payload, compensation)])
  );

  const offerId =
    typeof payload.offer_id === 'string' && payload.offer_id.length > 0
      ? payload.offer_id
      : `offer-${candidate.id}`;

  const salaryBand = asRecord(payload.salary_band) ?? {};
  const bandCurrency = salaryBand.currency ?? baseCurrency;
  const salaryBandMin =
    toFiniteNumber(salaryBand.min, 'salary_band.min') ??
    toFiniteNumber(salaryBand.base, 'salary_band.base');
  const resolvedBandMin = salaryBandMin ?? baseAmount ?? 0;
  if (!Number.isFinite(resolvedBandMin)) {
    throw new Error('Resolved salary band minimum must be a finite number');
  }

  const salaryBandMax =
    toFiniteNumber(salaryBand.max, 'salary_band.max') ??
    toFiniteNumber(salaryBand.ceiling, 'salary_band.ceiling');
  const resolvedBandMax = salaryBandMax ?? resolvedBandMin;
  if (!Number.isFinite(resolvedBandMax)) {
    throw new Error('Resolved salary band maximum must be a finite number');
  }

  const resolvedBaseAmount = baseAmount ?? resolvedBandMin;

  const offerBlock: Record<string, unknown> = {
    role: candidate.role ?? 'Unknown Role',
    base_salary: {
      currency: baseCurrency,
      amount: resolvedBaseAmount
    },
    band: {
      currency: bandCurrency,
      min: resolvedBandMin,
      max: resolvedBandMax
    }
  };

  const bandSource = compensation.source ?? salaryBand.source;
  if (bandSource) {
    (offerBlock.band as Record<string, unknown>).source = bandSource;
  }

  if (asRecord(payload.sign_on_bonus)) {
    offerBlock.sign_on_bonus = payload.sign_on_bonus;
  }
  if (asRecord(payload.equity)) {
    offerBlock.equity = payload.equity;
  }

  const provenanceSchemas = { ...template.provenanceSchemas };
  provenanceSchemas.input ??= INPUT_SCHEMA_PATH;
  provenanceSchemas.output ??= OUTPUT_SCHEMA_PATH;

  const timestamp = new Date().toISOString();

  const result = {
    offer_id: offerId,
    generated_at: timestamp,
    offer: offerBlock,
    candidate,
    compensation,
    narrative,
    warnings,
    provenance: {
      schemas: provenanceSchemas,
      inputs: template.provenanceInputs.length > 0 ? template.provenanceInputs : ['candidate_profile']
    },
    metadata: {
      generated_by: 'skill.doc-gen',
      timestamp,
      version: '0.1.0'
    }
  };

  validateSchema(OUTPUT_SCHEMA_PATH, result, 'doc-gen output');
  return result;
};
