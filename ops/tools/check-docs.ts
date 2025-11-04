import { readFile, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type ValidationIssue = {
  message: string;
  level: 'error' | 'warning';
};

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)), '..');

const FRONT_MATTER_REQUIRED = ['title:', 'last_synced:', 'description:'];

const FRONT_MATTER_FILES = [
  'docs/guides/agent-development.md',
  'docs/guides/api-usage.md',
  'docs/guides/a2a-communication.md',
  'docs/guides/cost-optimization.md',
  'docs/guides/github-integration.md',
  'docs/guides/mcp-integration.md',
  'docs/guides/mcp-migration.md',
  'docs/guides/mcp-server.md',
  'docs/guides/migration.md',
  'docs/guides/moderation.md',
  'docs/guides/multi-provider.md',
  'docs/guides/runner-integration.md',
  'docs/guides/semantic-cache.md',
  'docs/architecture/agents.md',
  'docs/architecture/ssot.md',
  'docs/architecture/skills.md',
  'docs/architecture/plans.md',
  'docs/development/changelog.md',
  'docs/development/contributing.md',
  'docs/development/roadmap.md',
  'docs/storage.md',
  'docs/policies/security.md',
  'docs/policies/code-of-conduct.md'
];

const MUST_EXIST_FILES = [
  'docs/guides/agent-development.md',
  'docs/architecture/ssot.md',
  'docs/architecture/agents.md',
  'docs/architecture/skills.md',
  'docs/architecture/plans.md',
  'docs/development/roadmap.md',
  'README.md',
  'docs/development/changelog.md',
  'docs/guides/runner-integration.md'
];

const report: ValidationIssue[] = [];

const ensureFilesExist = async (): Promise<void> => {
  for (const relative of MUST_EXIST_FILES) {
    const absolute = path.join(ROOT, relative);
    try {
      await access(absolute, fsConstants.F_OK);
    } catch {
      report.push({
        level: 'error',
        message: `Missing required file: ${relative}`
      });
    }
  }
};

const extractFrontMatter = (content: string): { lines: string[]; endIndex: number } | null => {
  if (!content.startsWith('---\n')) {
    return null;
  }

  const lines = content.split('\n');
  for (let index = 1; index < Math.min(lines.length, 50); index += 1) {
    if (lines[index].trim() === '---') {
      return {
        lines: lines.slice(1, index),
        endIndex: index
      };
    }
  }
  return null;
};

const validateFrontMatter = async (relative: string): Promise<void> => {
  const absolute = path.join(ROOT, relative);
  let content: string;
  try {
    content = await readFile(absolute, 'utf8');
  } catch (error) {
    report.push({
      level: 'error',
      message: `Unable to read ${relative}: ${(error as Error).message}`
    });
    return;
  }

  const frontMatter = extractFrontMatter(content);
  if (!frontMatter) {
    report.push({
      level: 'error',
      message: `${relative}: Missing or malformed YAML front-matter`
    });
    return;
  }

  const frontMatterText = frontMatter.lines.join('\n');

  for (const field of FRONT_MATTER_REQUIRED) {
    if (!frontMatterText.includes(field)) {
      report.push({
        level: 'error',
        message: `${relative}: Missing required field '${field.slice(0, -1)}'`
      });
    }
  }

  const syncMatch = frontMatterText.match(/last_synced:\s*(\d{4}-\d{2}-\d{2})/);
  if (syncMatch) {
    const syncDate = new Date(syncMatch[1]);
    if (Number.isNaN(syncDate.valueOf())) {
      report.push({
        level: 'error',
        message: `${relative}: Invalid last_synced date format`
      });
    } else {
      const msPerDay = 24 * 60 * 60 * 1000;
      const ageDays = Math.floor((Date.now() - syncDate.getTime()) / msPerDay);
      if (ageDays > 90) {
        report.push({
          level: 'warning',
          message: `${relative}: last_synced is ${ageDays} days old`
        });
      }
    }
  }

  if (/(ssot|agent)/i.test(path.basename(relative)) && !frontMatterText.includes('source_of_truth:')) {
    report.push({
      level: 'warning',
      message: `${relative}: Consider adding 'source_of_truth' metadata`
    });
  }
};

const validateChangelog = async (): Promise<void> => {
  const relative = 'docs/development/changelog.md';
  const absolute = path.join(ROOT, relative);
  let content: string;
  try {
    content = await readFile(absolute, 'utf8');
  } catch (error) {
    report.push({
      level: 'error',
      message: `Unable to read ${relative}: ${(error as Error).message}`
    });
    return;
  }

  if (!content.includes('## [Unreleased]')) {
    report.push({
      level: 'error',
      message: `${relative}: Missing '## [Unreleased]' section`
    });
  }

  const releasePattern = /^## \[[^\]]+\] - \d{4}-\d{2}-\d{2}$/gm;
  const matches = [...content.matchAll(releasePattern)];
  if (matches.length === 0) {
    report.push({
      level: 'error',
      message: `${relative}: At least one dated release entry is required`
    });
    return;
  }

  const headings = ['### Added', '### Changed', '### Fixed'];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index ?? 0;
    const end = matches[index + 1]?.index ?? content.length;
    const section = content.slice(start, end);
    for (const heading of headings) {
      if (!section.includes(heading)) {
        report.push({
          level: 'error',
          message: `${relative}: Release '${matches[index][0]}' missing heading '${heading}'`
        });
      }
    }
  }
};

const main = async (): Promise<void> => {
  await ensureFilesExist();
  await validateChangelog();

  await Promise.all(FRONT_MATTER_FILES.map((relative) => validateFrontMatter(relative)));

  const errors = report.filter((item) => item.level === 'error');
  const warnings = report.filter((item) => item.level === 'warning');

  for (const warning of warnings) {
    console.warn(`WARNING: ${warning.message}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`ERROR: ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('✓ Documentation checks passed.');
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
