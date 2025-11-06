# @magsag/catalog

Catalog loading and management for agents, skills, policies, and contracts.

## Overview

`@magsag/catalog` provides utilities for loading, validating, and managing the MAGSAG catalog of agents, skills, policies, and contracts. It serves as the central registry for all workflow components.

## Features

- Agent definition loading
- Skill module management
- Policy catalog access
- Contract validation
- Template management
- Catalog validation and linting

## Catalog Structure

```
catalog/
├── agents/           # Agent definitions
│   ├── code-reviewer/
│   │   └── agent.yaml
│   └── test-generator/
│       └── agent.yaml
├── skills/           # Reusable skills
│   ├── test-runner.ts
│   └── doc-generator.ts
├── policies/         # Governance policies
│   ├── security-gate.yaml
│   └── quality-gate.yaml
└── contracts/        # Agent contracts
    └── mag-contract.yaml
```

## Usage

```typescript
import { CatalogLoader } from '@magsag/catalog';

const loader = new CatalogLoader({
  catalogRoot: './catalog',
});

// Load all agents
const agents = await loader.loadAgents();
console.log(agents);
// [
//   { id: 'code-reviewer', type: 'mag', ... },
//   { id: 'test-generator', type: 'sag', ... }
// ]

// Load specific agent
const agent = await loader.loadAgent('code-reviewer');
console.log(agent);

// Load all skills
const skills = await loader.loadSkills();

// Load all policies
const policies = await loader.loadPolicies();
```

## Agent Definition

Agents are defined in YAML format:

```yaml
# catalog/agents/code-reviewer/agent.yaml
id: code-reviewer
name: Code Reviewer
type: mag
description: Reviews code changes for quality and best practices

capabilities:
  - code-analysis
  - style-checking
  - security-scanning

configuration:
  model: gpt-4-turbo
  temperature: 0.7
  maxTokens: 4096

tools:
  - name: analyze_code
    description: Analyze code for issues
  - name: suggest_improvements
    description: Suggest code improvements

metadata:
  author: MAGSAG Team
  version: 1.0.0
  tags: [code-quality, review]
```

## Skill Definition

Skills are TypeScript modules:

```typescript
// catalog/skills/test-runner.ts
export interface TestRunnerConfig {
  framework: 'vitest' | 'jest' | 'mocha';
  coverage: boolean;
}

export async function runTests(config: TestRunnerConfig) {
  // Implementation
}

export const metadata = {
  name: 'test-runner',
  description: 'Execute test suites',
  version: '1.0.0',
};
```

## Policy Definition

Policies are defined in YAML:

```yaml
# catalog/policies/security-gate.yaml
id: security-gate
name: Security Gate
type: required_action

rules:
  - id: no-secrets
    check: secrets_not_committed
    severity: error
  - id: dependencies-scanned
    check: dependency_scan_passed
    severity: error

actions:
  on_violation:
    - block_execution
    - notify_security_team
```

## Contract Definition

Contracts define agent interfaces:

```yaml
# catalog/contracts/mag-contract.yaml
id: mag-contract
version: 1.0.0

inputs:
  - name: instruction
    type: string
    required: true
  - name: context
    type: object
    required: false

outputs:
  - name: result
    type: object
  - name: artifacts
    type: array

events:
  - start
  - progress
  - complete
  - error
```

## Catalog Validation

Validate catalog integrity:

```typescript
import { CatalogValidator } from '@magsag/catalog';

const validator = new CatalogValidator({
  catalogRoot: './catalog',
});

const result = await validator.validate();

if (!result.valid) {
  console.error('Validation errors:', result.errors);
  // [
  //   { file: 'agents/code-reviewer/agent.yaml', error: 'Missing required field: id' },
  //   ...
  // ]
}
```

## CLI Integration

Catalog validation is integrated into the CLI:

```bash
# Validate catalog
pnpm catalog:validate

# Output:
# ✓ Catalog validation passed
# - 10 agents
# - 15 skills
# - 5 policies
# - 3 contracts
```

## Template Management

Work with agent templates:

```typescript
import { TemplateManager } from '@magsag/catalog';

const manager = new TemplateManager({
  templatesRoot: './catalog/agents/_template',
});

// Create new agent from template
await manager.createFromTemplate('sag-template', {
  id: 'new-agent',
  name: 'New Agent',
  description: 'Description',
});
```

## Listing Catalog Items

```typescript
const loader = new CatalogLoader({ catalogRoot: './catalog' });

// List agents by type
const magAgents = await loader.listAgents({ type: 'mag' });
const sagAgents = await loader.listAgents({ type: 'sag' });

// List skills by domain
const testingSkills = await loader.listSkills({ domain: 'testing' });

// List policies by severity
const errorPolicies = await loader.listPolicies({ severity: 'error' });
```

## Filtering and Search

```typescript
// Search agents
const results = await loader.searchAgents({
  query: 'code review',
  tags: ['quality'],
  type: 'mag',
});

// Filter skills
const skills = await loader.filterSkills({
  language: 'typescript',
  domain: 'testing',
});
```

## Catalog Metadata

Access catalog-wide metadata:

```typescript
const metadata = await loader.getCatalogMetadata();
console.log(metadata);
// {
//   totalAgents: 10,
//   totalSkills: 15,
//   totalPolicies: 5,
//   lastUpdated: '2025-11-06T08:00:00Z',
//   version: '2.0.0',
// }
```

## Development

```bash
# Run tests
pnpm --filter @magsag/catalog test

# Type checking
pnpm --filter @magsag/catalog typecheck

# Linting
pnpm --filter @magsag/catalog lint

# Build
pnpm --filter @magsag/catalog build

# Validate catalog
pnpm catalog:validate
```

## Performance

- Loading time: ~50ms for 100 items
- Validation: ~200ms for full catalog
- Memory: ~1MB per 100 catalog items

## Dependencies

- `yaml` - YAML parsing
- `@magsag/schema` - Schema validation

## License

Apache-2.0
