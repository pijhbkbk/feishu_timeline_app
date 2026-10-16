import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, '../..');
const outputDir = join(rootDir, 'security/licenses');
const lockfilePath = join(rootDir, 'pnpm-lock.yaml');
const lockfileSha256 = createHash('sha256')
  .update(readFileSync(lockfilePath))
  .digest('hex');

const scopes = [
  {
    id: 'workspace-all',
    args: ['licenses', 'list', '--json'],
    output: 'workspace-all-license-inventory.json',
  },
  {
    id: 'workspace-production',
    args: ['licenses', 'list', '--prod', '--json'],
    output: 'workspace-production-license-inventory.json',
  },
  {
    id: 'api-production-resolution',
    args: [
      '--filter',
      '@feishu-timeline/api',
      'licenses',
      'list',
      '--prod',
      '--json',
    ],
    output: 'api-runtime-license-inventory.json',
  },
  {
    id: 'web-production-resolution',
    args: [
      '--filter',
      '@feishu-timeline/web',
      'licenses',
      'list',
      '--prod',
      '--json',
    ],
    output: 'web-runtime-license-inventory.json',
  },
  {
    id: 'api-ops-production-resolution',
    args: [
      '--filter',
      '@feishu-timeline/api-ops',
      'licenses',
      'list',
      '--prod',
      '--json',
    ],
    output: 'api-ops-license-inventory.json',
  },
];

function normalizeAuthor(author) {
  if (typeof author === 'string') {
    return author;
  }
  if (author && typeof author === 'object' && typeof author.name === 'string') {
    return author.name;
  }
  return null;
}

function loadScope(scope) {
  const stdout = execFileSync('pnpm', scope.args, {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const raw = JSON.parse(stdout);
  const byIdentity = new Map();

  for (const [bucketLicense, entries] of Object.entries(raw)) {
    if (!Array.isArray(entries)) {
      throw new Error(`Unexpected pnpm license payload for ${bucketLicense}.`);
    }
    for (const entry of entries) {
      for (const version of entry.versions ?? []) {
        const license = entry.license || bucketLicense || 'UNKNOWN';
        const identity = `${entry.name}@${version}\u0000${license}`;
        const previous = byIdentity.get(identity);
        const current = {
          name: entry.name,
          version,
          license,
          author: normalizeAuthor(entry.author),
          homepage: typeof entry.homepage === 'string' ? entry.homepage : null,
        };
        if (!previous) {
          byIdentity.set(identity, current);
        } else if (
          JSON.stringify(previous) !== JSON.stringify(current)
        ) {
          throw new Error(`Conflicting license metadata for ${entry.name}@${version}.`);
        }
      }
    }
  }

  return [...byIdentity.values()].sort((left, right) =>
    `${left.name}@${left.version}:${left.license}`.localeCompare(
      `${right.name}@${right.version}:${right.license}`,
      'en',
    ),
  );
}

mkdirSync(outputDir, { recursive: true });

const inventories = new Map();
for (const scope of scopes) {
  const packages = loadScope(scope);
  inventories.set(scope.id, packages);
  writeFileSync(
    join(outputDir, scope.output),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        packageManager: 'pnpm@9.15.4',
        generationPlatform: `${process.platform}-${process.arch}`,
        lockfile: 'pnpm-lock.yaml',
        lockfileSha256,
        scope: scope.id,
        packageCount: packages.length,
        packages,
      },
      null,
      2,
    )}\n`,
  );
}

const productionScopes = [
  'api-production-resolution',
  'web-production-resolution',
  'api-ops-production-resolution',
];
const noticeEntries = new Map();
for (const scope of productionScopes) {
  for (const dependency of inventories.get(scope)) {
    const identity = `${dependency.name}@${dependency.version}\u0000${dependency.license}`;
    const entry = noticeEntries.get(identity) ?? { ...dependency, scopes: [] };
    entry.scopes.push(scope);
    noticeEntries.set(identity, entry);
  }
}

const sortedNotices = [...noticeEntries.values()].sort((left, right) =>
  `${left.name}@${left.version}:${left.license}`.localeCompare(
    `${right.name}@${right.version}:${right.license}`,
    'en',
  ),
);

const noticeLines = [
  'THIRD-PARTY SOFTWARE NOTICES',
  '',
  'This file inventories the production dependency resolution graphs for the',
  'API, Web, and short-lived API operations workspaces on the generation host.',
  'pnpm optional-peer and platform resolution can make this a conservative',
  'superset of an individual Linux image. The image SBOMs under security/sbom',
  'are authoritative for actual candidate image contents. This notice does not',
  'replace the license texts shipped by the respective copyright holders.',
  '',
  `pnpm-lock.yaml SHA-256: ${lockfileSha256}`,
  '',
  'Sharp / libvips distribution note:',
  '  sharp is Apache-2.0. Its prebuilt @img/sharp-libvips platform packages are',
  '  LGPL-3.0-or-later and bundle libvips plus additional third-party libraries.',
  '  Distribution obligations remain subject to company legal/security review.',
  '',
  'Package inventory:',
  '',
];

for (const entry of sortedNotices) {
  const homepage = entry.homepage ? ` | ${entry.homepage}` : '';
  noticeLines.push(
    `- ${entry.name}@${entry.version} | ${entry.license} | ${entry.scopes.sort().join(',')}${homepage}`,
  );
}

writeFileSync(join(rootDir, 'THIRD_PARTY_NOTICES'), `${noticeLines.join('\n')}\n`);

for (const scope of scopes) {
  console.log(`${scope.id}: ${inventories.get(scope.id).length} package/license records`);
}
console.log(`production notices: ${sortedNotices.length} unique package/license records`);
console.log(`lockfile sha256: ${lockfileSha256}`);
