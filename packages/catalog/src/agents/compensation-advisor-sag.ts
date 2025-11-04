import { AgentContext, SkillRegistry } from '../shared/types.js';

const levelBaseMap: Record<string, number> = {
  junior: 90_000,
  mid: 120_000,
  senior: 150_000,
  staff: 190_000,
  principal: 220_000
};

const signOnByLevel: Record<string, number> = {
  junior: 5_000,
  mid: 10_000,
  senior: 20_000,
  staff: 30_000,
  principal: 50_000
};

const resolveProfile = (payload: Record<string, unknown>): Record<string, unknown> => {
  const candidate = payload.candidate_profile;
  if (candidate && typeof candidate === 'object') {
    return candidate as Record<string, unknown>;
  }
  return payload;
};

const resolveLevel = (value: unknown): string => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return 'Mid';
};

const applyLocationAdjustments = (baseSalary: number, location: string): number => {
  const normalized = location.toLowerCase();
  if (normalized.includes('san francisco')) {
    return baseSalary + 20_000;
  }
  if (normalized.includes('new york')) {
    return baseSalary + 15_000;
  }
  if (normalized.includes('austin')) {
    return baseSalary + 7_000;
  }
  if (normalized.includes('remote')) {
    return baseSalary - 5_000;
  }
  return baseSalary;
};

const invokeTransform = async (
  registry: SkillRegistry,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  return registry.invokeAsync('skill.test-helper-transform', payload);
};

export const run = async (
  payload: Record<string, unknown>,
  context: AgentContext = {}
): Promise<Record<string, unknown>> => {
  const profile = resolveProfile(payload);
  const role = String(profile.role ?? payload.role ?? 'Engineer');
  const level = resolveLevel(profile.level ?? payload.level);
  const location = String(profile.location ?? payload.location ?? 'Remote');
  const experienceYearsRaw = profile.experience_years ?? payload.experience_years ?? 0;
  const experienceYears = Number(experienceYearsRaw) || 0;
  const levelKey = level.toLowerCase();

  let baseSalary = levelBaseMap[levelKey] ?? 110_000;
  baseSalary += experienceYears * 3_000;
  baseSalary = applyLocationAdjustments(baseSalary, location);

  const numbersForSkill = [experienceYears, Math.floor(baseSalary / 1_000), level.length];

  context.obs?.log?.('sag.start', {
    agent: 'compensation-advisor-sag',
    level,
    experience_years: experienceYears
  });

  let transformResult: Record<string, unknown> = {
    upper_text: role.toUpperCase(),
    value_squared: experienceYears * experienceYears,
    numbers_doubled: numbersForSkill.map((value) => value * 2),
    numbers_total: numbersForSkill.reduce((sum, value) => sum + value, 0),
    source: 'fallback'
  };

  const skills = context.skills;
  if (skills && skills.exists('skill.test-helper-transform')) {
    try {
      transformResult = await invokeTransform(skills, {
        text: role,
        value: experienceYears,
        numbers: numbersForSkill
      });
      context.obs?.log?.('skill_invoked', {
        skill: 'skill.test-helper-transform',
        numbers_total: transformResult.numbers_total
      });
    } catch (error) {
      context.obs?.log?.('sag.skill_error', { error: (error as Error).message });
    }
  }

  context.obs?.metric?.('base_salary', baseSalary);
  context.obs?.log?.('sag.end', {
    agent: 'compensation-advisor-sag',
    status: 'success'
  });

  const bandMin = Math.max(60_000, Math.floor(baseSalary * 0.9));
  const bandMax = Math.floor(baseSalary * 1.1);

  const offer = {
    role,
    level,
    experience_years: experienceYears,
    location,
    base_salary: { currency: 'USD', amount: Math.floor(baseSalary) },
    band: { currency: 'USD', min: bandMin, max: bandMax },
    sign_on_bonus: { currency: 'USD', amount: signOnByLevel[levelKey] ?? 10_000 },
    notes: `Deterministic offer generated for ${role} (${level}).`
  };

  const analysis = {
    transform: transformResult,
    summary: {
      level,
      location,
      experience_years: experienceYears,
      base_salary: Math.floor(baseSalary),
      numbers_total:
        typeof transformResult.numbers_total === 'number'
          ? transformResult.numbers_total
          : numbersForSkill.reduce((sum, value) => sum + value, 0)
    }
  };

  return {
    offer,
    analysis,
    metadata: {
      agent: 'compensation-advisor-sag',
      observability_enabled: Boolean(context.obs)
    }
  };
};
