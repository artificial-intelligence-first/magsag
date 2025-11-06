#!/usr/bin/env node

/**
 * Prepare packages for NPM publishing
 *
 * This script:
 * 1. Removes "private": true from publishable packages
 * 2. Replaces workspace:* dependencies with proper semver versions
 * 3. Fixes types field to point to dist/ instead of src/
 * 4. Ensures proper exports configuration
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Packages that should remain private (not published to npm)
const PRIVATE_PACKAGES = new Set([
  '@magsag/demo-api',
  '@magsag/demo-cli',
  '@magsag/demo-shared',
  '@magsag/servers',
]);

// Find all package.json files in the workspace
function findPackageJsonFiles(dir, files = []) {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules, dist, and hidden directories
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) {
        continue;
      }
      findPackageJsonFiles(fullPath, files);
    } else if (entry === 'package.json' && dir !== rootDir) {
      files.push(fullPath);
    }
  }

  return files;
}

// Read all package versions to build a version map
function buildVersionMap(packageFiles) {
  const versionMap = new Map();

  for (const file of packageFiles) {
    const pkg = JSON.parse(readFileSync(file, 'utf-8'));
    if (pkg.name && pkg.version) {
      versionMap.set(pkg.name, pkg.version);
    }
  }

  return versionMap;
}

// Update workspace dependencies to use proper versions
function updateDependencies(deps, versionMap) {
  if (!deps) return deps;

  const updated = { ...deps };

  for (const [name, version] of Object.entries(updated)) {
    if (version === 'workspace:*' && versionMap.has(name)) {
      // Use workspace:^ protocol - it keeps workspace deps during development
      // and gets replaced with actual versions during pnpm publish
      updated[name] = 'workspace:^';
    }
  }

  return updated;
}

// Update a package.json file
function updatePackageJson(filePath, versionMap) {
  const pkg = JSON.parse(readFileSync(filePath, 'utf-8'));
  const packageName = pkg.name;

  console.log(`\nProcessing: ${packageName}`);

  let modified = false;

  // 1. Remove private flag for publishable packages
  if (pkg.private && !PRIVATE_PACKAGES.has(packageName)) {
    console.log(`  ✓ Removing "private": true`);
    delete pkg.private;
    modified = true;
  }

  // 2. Update workspace dependencies
  if (pkg.dependencies) {
    const oldDeps = JSON.stringify(pkg.dependencies);
    pkg.dependencies = updateDependencies(pkg.dependencies, versionMap);
    if (JSON.stringify(pkg.dependencies) !== oldDeps) {
      console.log(`  ✓ Updated dependencies`);
      modified = true;
    }
  }

  if (pkg.devDependencies) {
    const oldDevDeps = JSON.stringify(pkg.devDependencies);
    pkg.devDependencies = updateDependencies(pkg.devDependencies, versionMap);
    if (JSON.stringify(pkg.devDependencies) !== oldDevDeps) {
      console.log(`  ✓ Updated devDependencies`);
      modified = true;
    }
  }

  // 3. Fix types field - should point to dist/ not src/
  if (pkg.types && pkg.types.startsWith('src/')) {
    const newTypes = pkg.types.replace('src/', 'dist/').replace('.ts', '.d.ts');
    console.log(`  ✓ Fixed types: ${pkg.types} → ${newTypes}`);
    pkg.types = newTypes;
    modified = true;
  }

  // 4. Ensure exports field exists and is properly configured
  if (pkg.main && pkg.main.startsWith('dist/') && !pkg.exports) {
    pkg.exports = {
      '.': {
        types: './' + (pkg.types || pkg.main.replace('.js', '.d.ts')),
        default: './' + pkg.main
      }
    };
    console.log(`  ✓ Added exports field`);
    modified = true;
  }

  // 5. Ensure files field includes dist
  if (!pkg.files || !pkg.files.includes('dist')) {
    pkg.files = ['dist'];
    console.log(`  ✓ Ensured files includes dist`);
    modified = true;
  }

  // 6. Add repository, bugs, and homepage fields if missing
  if (!pkg.repository) {
    pkg.repository = {
      type: 'git',
      url: 'https://github.com/artificial-intelligence-first/magsag.git',
      directory: filePath.replace(rootDir + '/', '').replace('/package.json', '')
    };
    console.log(`  ✓ Added repository field`);
    modified = true;
  }

  if (!pkg.bugs) {
    pkg.bugs = {
      url: 'https://github.com/artificial-intelligence-first/magsag/issues'
    };
    console.log(`  ✓ Added bugs field`);
    modified = true;
  }

  if (!pkg.homepage) {
    pkg.homepage = 'https://github.com/artificial-intelligence-first/magsag#readme';
    console.log(`  ✓ Added homepage field`);
    modified = true;
  }

  // 7. Add license if missing
  if (!pkg.license) {
    pkg.license = 'MIT';
    console.log(`  ✓ Added license field`);
    modified = true;
  }

  if (modified) {
    writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    console.log(`  ✅ Updated ${filePath}`);
  } else {
    console.log(`  ⏭️  No changes needed`);
  }
}

// Main execution
console.log('🚀 Preparing packages for NPM publishing...\n');

const packageFiles = findPackageJsonFiles(rootDir);
console.log(`Found ${packageFiles.length} package.json files\n`);

// First pass: build version map
const versionMap = buildVersionMap(packageFiles);
console.log('📦 Package versions:');
for (const [name, version] of versionMap.entries()) {
  console.log(`  ${name}: ${version}`);
}

// Second pass: update all packages
console.log('\n📝 Updating packages...');
for (const file of packageFiles) {
  updatePackageJson(file, versionMap);
}

console.log('\n✅ All packages updated successfully!');
console.log('\n📋 Next steps:');
console.log('  1. Review the changes: git diff');
console.log('  2. Run build: pnpm build');
console.log('  3. Test packaging: pnpm -r exec pnpm pack --dry-run');
console.log('  4. Set up changesets: pnpm add -Dw @changesets/cli && pnpm changeset init');
