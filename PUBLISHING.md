# Publishing Guide for MAGSAG

This guide explains how to publish MAGSAG packages to npm.

## Overview

MAGSAG uses a monorepo structure with multiple packages. We use:
- **pnpm workspaces** for dependency management
- **changesets** for version management and changelog generation
- **GitHub Actions** for automated releases

## Package Structure

### Publishable Packages

The following packages are published to npm under the `@magsag` scope:

**Core Infrastructure:**
- `@magsag/core` - Workspace execution and engine management
- `@magsag/schema` - Type definitions and schemas
- `@magsag/governance` - Configuration management

**CLI & Tools:**
- `@magsag/cli` - Main command-line interface (entry point)
- `@magsag/manager` - Workflow and execution management
- `@magsag/specialist` - Specialized workflow handlers
- `@magsag/worktree` - Workspace management utilities

**Runners:**
- `@magsag/runner-adk` - Anthropic ADK runner
- `@magsag/runner-claude-agent` - Claude Agent SDK runner
- `@magsag/runner-claude-cli` - Claude CLI runner
- `@magsag/runner-codex-cli` - Codex CLI runner
- `@magsag/runner-openai-agents` - OpenAI Agents runner

**MCP Integration:**
- `@magsag/mcp-client` - MCP client implementation
- `@magsag/mcp-server` - MCP server base implementation
- `@magsag/mcp-codegen` - Code generation for MCP
- `@magsag/catalog` - MCP tool catalog
- `@magsag/catalog-mcp` - Catalog MCP server

**Supporting Libraries:**
- `@magsag/observability` - Observability utilities
- `@magsag/shared-logging` - Shared logging utilities
- `@magsag/server` - Hono-based HTTP server

### Private Packages (Not Published)

The following packages remain private and are not published:
- `@magsag/demo-api` - Demo API application
- `@magsag/demo-cli` - Demo CLI application
- `@magsag/demo-shared` - Demo shared utilities
- `@magsag/servers` - Internal MCP server implementations

## Prerequisites

### 1. NPM Access

Ensure you have:
1. An npm account with access to the `@magsag` scope
2. NPM_TOKEN configured in GitHub repository secrets
3. Two-factor authentication enabled on your npm account

### 2. Repository Setup

The repository should have:
- `NPM_TOKEN` secret configured in GitHub settings
- Write access to main branch for the release workflow
- Pull request permissions for the changesets bot

## Release Workflow

### Option 1: Automated Release (Recommended)

We use GitHub Actions for automated releases:

1. **Make changes** to packages as needed
2. **Create a changeset** for your changes:
   ```bash
   pnpm changeset
   ```
   - Select which packages changed
   - Choose bump type (major/minor/patch)
   - Write a description of the changes

3. **Commit the changeset**:
   ```bash
   git add .changeset/
   git commit -m "chore: add changeset"
   git push
   ```

4. **Create PR** with your changes
5. **Merge to main** - This triggers the release workflow which:
   - Creates a "Version Packages" PR automatically
   - Updates version numbers and changelogs
   - When this PR is merged, packages are automatically published

### Option 2: Manual Release

For manual releases or testing:

1. **Ensure you're on main** and up to date:
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Create changesets** (if not already done):
   ```bash
   pnpm changeset
   ```

3. **Version packages**:
   ```bash
   pnpm version-packages
   ```
   This will:
   - Update package versions
   - Update CHANGELOG.md files
   - Update dependencies between packages

4. **Review changes**:
   ```bash
   git diff
   ```

5. **Commit version changes**:
   ```bash
   git add .
   git commit -m "chore: version packages"
   ```

6. **Build all packages**:
   ```bash
   pnpm build
   ```

7. **Publish to npm** (requires npm authentication):
   ```bash
   pnpm release
   ```
   OR use changesets directly:
   ```bash
   pnpm changeset publish
   ```

8. **Push tags**:
   ```bash
   git push --follow-tags
   ```

## Pre-release Versions

To publish pre-release versions (alpha, beta, rc):

1. **Enter pre-release mode**:
   ```bash
   pnpm changeset pre enter alpha
   ```

2. **Create changesets** as normal:
   ```bash
   pnpm changeset
   ```

3. **Version and publish**:
   ```bash
   pnpm version-packages
   pnpm build
   pnpm release
   ```

4. **Exit pre-release mode** when ready for stable:
   ```bash
   pnpm changeset pre exit
   ```

## Testing Before Publishing

### 1. Local Pack Test

Test packaging without publishing:

```bash
# Build all packages
pnpm build

# Dry run pack for all packages
pnpm -r exec pnpm pack --dry-run

# Actually create tarballs for inspection
pnpm -r exec pnpm pack
```

### 2. Local Install Test

Test installing from local tarballs:

```bash
# Create a test directory
mkdir /tmp/magsag-test
cd /tmp/magsag-test
npm init -y

# Install from local tarball (adjust paths)
npm install /path/to/magsag/packages/cli/magsag-cli-*.tgz

# Test the CLI
npx magsag --help
```

### 3. Verdaccio Local Registry

For comprehensive testing, use a local npm registry:

```bash
# Install verdaccio
npm install -g verdaccio

# Start verdaccio
verdaccio

# In another terminal, configure npm
npm config set registry http://localhost:4873/

# Publish to local registry
pnpm publish -r

# Test installation
mkdir /tmp/test && cd /tmp/test
npm install @magsag/cli

# Restore npm registry
npm config set registry https://registry.npmjs.org/
```

## Troubleshooting

### Workspace Dependencies Not Resolved

If you see errors about unresolved `workspace:^` dependencies:
- This is expected during development
- Dependencies are resolved to actual versions during `pnpm publish`
- Make sure all dependent packages are published with the same version

### Build Failures

If builds fail:
1. Ensure all dependencies are installed: `pnpm install`
2. Clean and rebuild: `rm -rf packages/*/dist && pnpm build`
3. Check for TypeScript errors: `pnpm typecheck`

### Permission Denied on npm

If you get permission errors:
1. Ensure you're logged in: `npm login`
2. Verify you have access to @magsag scope: `npm access list packages`
3. Check your npm token has the right permissions

### Provenance Attestation Failures

If GitHub Actions fails with provenance errors:
- Ensure `NPM_CONFIG_PROVENANCE` is set to `true`
- Verify repository has `id-token: write` permission
- Check that npm token has provenance permission

## Version Management

### Semantic Versioning

We follow [Semantic Versioning](https://semver.org/):
- **Major (1.0.0 → 2.0.0)**: Breaking changes
- **Minor (1.0.0 → 1.1.0)**: New features, backwards compatible
- **Patch (1.0.0 → 1.0.1)**: Bug fixes, backwards compatible

### Pre-release Versions

Current pre-release versions:
- **alpha (2.0.0-alpha.x)**: Early development, unstable
- **beta (2.0.0-beta.x)**: Feature complete, testing
- **rc (2.0.0-rc.x)**: Release candidate, stable

## CI/CD Pipeline

### Automated Checks

On every PR and push to main:
- Lint all packages
- Type check all packages
- Run all tests
- Build all packages
- Verify package integrity (`pnpm pack --dry-run`)
- Check bundle sizes

### Release Process

On merge to main:
1. Check for changesets
2. If changesets exist, create "Version Packages" PR
3. When version PR is merged:
   - Build all packages
   - Publish to npm with provenance
   - Push git tags
   - Create GitHub release

## Best Practices

1. **Always create changesets** for user-facing changes
2. **Test locally** before pushing
3. **Keep changelogs meaningful** - write for end users, not developers
4. **Coordinate breaking changes** across dependent packages
5. **Use pre-release versions** for experimental features
6. **Document migration paths** for breaking changes

## Scripts Reference

```bash
# Create a changeset
pnpm changeset

# Version packages (updates versions + changelogs)
pnpm version-packages

# Build all packages
pnpm build

# Publish all packages
pnpm release

# Prepare packages for publishing (run our custom script)
pnpm prepare:publish

# Test packaging without publishing
pnpm -r exec pnpm pack --dry-run
```

## Links

- [Changesets Documentation](https://github.com/changesets/changesets)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [npm Publishing](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
