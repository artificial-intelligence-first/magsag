# @magsag/governance

Flow governance and policy evaluation engine for the MAGSAG framework.

## Overview

`@magsag/governance` provides policy-based governance controls for agent workflows. It evaluates flow summaries against YAML policy definitions to ensure agent executions comply with organizational rules and safety requirements.

## Key Components

### Flow Gate Evaluation

- **FlowGate** - Main policy evaluation engine
- **PolicyParser** - Parses YAML policy definitions
- **FlowSummary** - Represents agent workflow execution summaries

### Policy Definition Format

Policies are defined in YAML format:

```yaml
policies:
  - id: require-tests
    name: "Require Test Execution"
    type: required_action
    rules:
      - test_executed: true
      - min_coverage: 80
    severity: error
    message: "All workflows must execute tests with >80% coverage"

  - id: restrict-production
    name: "Production Deployment Gate"
    type: approval_required
    rules:
      - environment: production
    approvers:
      - team-lead
      - security-team
```

## Usage

```typescript
import { FlowGate, PolicyParser } from '@magsag/governance';

// Load policies
const parser = new PolicyParser();
const policies = await parser.loadFromFile('policies.yaml');

// Evaluate flow summary
const gate = new FlowGate(policies);
const result = gate.evaluate(flowSummary);

if (!result.passed) {
  console.error('Policy violations:', result.violations);
  process.exit(1);
}
```

## Policy Types

- **required_action** - Mandates specific actions in workflows
- **approval_required** - Requires human approval before execution
- **forbidden_action** - Blocks specific actions
- **resource_limit** - Enforces resource consumption limits
- **time_constraint** - Enforces execution time windows

## Integration

Flow governance is integrated into the CLI execution flow:

```bash
# Policies are automatically evaluated during execution
pnpm --filter @magsag/cli exec magsag agent exec --plan plan.json
```

Policy evaluation results are logged in the execution JSONL output.

## Policy Catalog

Reference policies are available in `/catalog/policies/`:
- Security policies
- Quality gates
- Compliance requirements
- Resource constraints

## Development

```bash
# Run tests
pnpm --filter @magsag/governance test

# Type checking
pnpm --filter @magsag/governance typecheck

# Linting
pnpm --filter @magsag/governance lint

# Build
pnpm --filter @magsag/governance build
```

## Architecture

The governance engine uses a declarative policy model, allowing policies to be defined, versioned, and audited separately from code. The evaluation engine is designed to be fast and deterministic, suitable for real-time workflow gating.

## Future Enhancements

- Policy composition and inheritance
- Dynamic policy loading from remote sources
- Audit trail and compliance reporting
- Integration with external approval systems

## License

Apache-2.0
