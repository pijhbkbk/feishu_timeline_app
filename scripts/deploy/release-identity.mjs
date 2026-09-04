#!/usr/bin/env node

import {
  chmodSync,
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const IDENTITY_KEYS = ['buildTime', 'release', 'sourceCommit', 'sourceTree'];
const IMAGE_KEYS = ['api', 'apiOps', 'web'];
const FULL_GIT_OBJECT_RE = /^[a-f0-9]{40}$/;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const REPOSITORY_DIGEST_RE =
  /^(?:[a-z0-9]|[a-z0-9][a-z0-9._/:_-]{0,253}[a-z0-9])@sha256:[a-f0-9]{64}$/;
const RELEASE_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const RESERVED_RELEASE_RE = /^(?:dev|development|latest|local|unknown)$/i;
const PLACEHOLDER_RE = /(?:placeholder|replace[-_]?with|replace[-_]?me)/i;
const MAX_JSON_BYTES = 1024 * 1024;
const GENERATED_IDENTITY_PATHS = [
  'apps/api/src/common/build-identity.generated.ts',
  'apps/web/src/lib/build-identity.generated.ts',
];

function assertion(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value, expectedKeys, context) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assertion(
    actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]),
    `${context} must contain exactly: ${expected.join(', ')}.`,
  );
}

function assertString(value, field, maximumLength) {
  assertion(typeof value === 'string', `${field} must be a string.`);
  assertion(value.length > 0, `${field} must not be empty.`);
  assertion(value.length <= maximumLength, `${field} exceeds its maximum length.`);
  assertion(!value.includes('\0'), `${field} must not contain NUL.`);
  assertion(!/[\r\n]/.test(value), `${field} must not contain a newline.`);
}

export function validateBuildIdentity(value, context = 'build identity') {
  assertion(isPlainObject(value), `${context} must be a JSON object.`);
  assertExactKeys(value, IDENTITY_KEYS, context);

  const { sourceCommit, sourceTree, release, buildTime } = value;
  assertString(sourceCommit, `${context}.sourceCommit`, 40);
  assertString(sourceTree, `${context}.sourceTree`, 40);
  assertString(release, `${context}.release`, 128);
  assertString(buildTime, `${context}.buildTime`, 20);

  assertion(
    FULL_GIT_OBJECT_RE.test(sourceCommit) && !/^0{40}$/.test(sourceCommit),
    `${context}.sourceCommit must be a complete non-placeholder lowercase 40-hex Git object id.`,
  );
  assertion(
    FULL_GIT_OBJECT_RE.test(sourceTree) && !/^0{40}$/.test(sourceTree),
    `${context}.sourceTree must be a complete non-placeholder lowercase 40-hex Git tree id.`,
  );
  assertion(RELEASE_RE.test(release), `${context}.release has an invalid format.`);
  assertion(
    !RESERVED_RELEASE_RE.test(release) && !PLACEHOLDER_RE.test(release),
    `${context}.release must identify an approved immutable release.`,
  );
  assertion(
    UTC_TIMESTAMP_RE.test(buildTime),
    `${context}.buildTime must be a UTC timestamp in YYYY-MM-DDTHH:mm:ssZ form.`,
  );
  const parsedBuildTime = new Date(buildTime);
  assertion(
    !Number.isNaN(parsedBuildTime.getTime()) &&
      parsedBuildTime.toISOString().replace('.000Z', 'Z') === buildTime,
    `${context}.buildTime is not a real canonical UTC timestamp.`,
  );

  return Object.freeze({ sourceCommit, sourceTree, release, buildTime });
}

function validateImageIdentity(value, context) {
  assertion(isPlainObject(value), `${context} must be a JSON object.`);
  assertExactKeys(value, ['imageId', 'repositoryDigest'], context);
  const { imageId, repositoryDigest } = value;
  assertString(imageId, `${context}.imageId`, 71);
  assertString(repositoryDigest, `${context}.repositoryDigest`, 327);
  assertion(
    SHA256_RE.test(imageId) && !/^sha256:0{64}$/.test(imageId),
    `${context}.imageId must be a non-placeholder sha256 digest.`,
  );
  assertion(
    REPOSITORY_DIGEST_RE.test(repositoryDigest) &&
      !repositoryDigest.includes('..') &&
      !repositoryDigest.includes('//') &&
      !repositoryDigest.includes('::') &&
      !repositoryDigest.endsWith(`@${'sha256:'}${'0'.repeat(64)}`) &&
      !PLACEHOLDER_RE.test(repositoryDigest),
    `${context}.repositoryDigest must be an approved digest-pinned repository reference.`,
  );
  return Object.freeze({ imageId, repositoryDigest });
}

export function validateReleaseManifest(value) {
  assertion(isPlainObject(value), 'release manifest must be a JSON object.');
  assertExactKeys(value, ['identity', 'images', 'schemaVersion'], 'release manifest');
  assertion(value.schemaVersion === 1, 'release manifest.schemaVersion must equal 1.');
  const identity = validateBuildIdentity(value.identity, 'release manifest.identity');
  assertion(isPlainObject(value.images), 'release manifest.images must be a JSON object.');
  assertExactKeys(value.images, IMAGE_KEYS, 'release manifest.images');
  const images = Object.freeze({
    api: validateImageIdentity(value.images.api, 'release manifest.images.api'),
    apiOps: validateImageIdentity(value.images.apiOps, 'release manifest.images.apiOps'),
    web: validateImageIdentity(value.images.web, 'release manifest.images.web'),
  });
  return Object.freeze({ schemaVersion: 1, identity, images });
}

export function validateReleaseApproval({
  manifest,
  expectedIdentity,
  repositoryDigests,
}) {
  const approved = validateReleaseManifest(manifest);
  const expected = validateBuildIdentity(expectedIdentity, 'expected identity');
  assertSameIdentity(approved.identity, expected, 'expected identity');
  for (const name of IMAGE_KEYS) {
    assertion(
      repositoryDigests[name] === approved.images[name].repositoryDigest,
      `${name} repository digest does not match the approved release manifest.`,
    );
  }
  return approved;
}

export function readJsonFile(filePath, context) {
  const absolutePath = resolve(filePath);
  const stat = lstatSync(absolutePath);
  assertion(stat.isFile() && !stat.isSymbolicLink(), `${context} must be a regular non-symlink file.`);
  assertion(stat.size > 0 && stat.size <= MAX_JSON_BYTES, `${context} has an invalid size.`);
  let value;
  try {
    value = JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch {
    throw new Error(`${context} must contain valid JSON.`);
  }
  return value;
}

export function renderTypeScriptBuildIdentity(value) {
  const identity = validateBuildIdentity(value);
  return [
    '// Generated by scripts/deploy/release-identity.mjs. Do not edit.',
    'export const IMMUTABLE_BUILD_IDENTITY = {',
    `  sourceCommit: ${JSON.stringify(identity.sourceCommit)},`,
    `  sourceTree: ${JSON.stringify(identity.sourceTree)},`,
    `  release: ${JSON.stringify(identity.release)},`,
    `  buildTime: ${JSON.stringify(identity.buildTime)},`,
    '} as const;',
    '',
  ].join('\n');
}

export function writeTypeScriptBuildIdentity(outputPath, value) {
  const requestedPath = resolve(outputPath);
  const outputDirectory = realpathSync(dirname(requestedPath));
  const absolutePath = resolve(outputDirectory, basename(requestedPath));
  const canonicalWorkingDirectory = realpathSync(process.cwd());
  const allowedPaths = GENERATED_IDENTITY_PATHS.map((path) =>
    resolve(canonicalWorkingDirectory, path),
  );
  assertion(
    allowedPaths.includes(absolutePath),
    'build identity output is not an approved generated identity path.',
  );
  const directoryStat = lstatSync(outputDirectory);
  assertion(directoryStat.isDirectory(), 'build identity output parent must be a directory.');
  assertion(absolutePath.endsWith('.ts'), 'build identity output must be a TypeScript file.');
  try {
    const targetStat = lstatSync(absolutePath);
    assertion(
      targetStat.isFile() && !targetStat.isSymbolicLink(),
      'build identity output must be a regular non-symlink file.',
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  const temporaryPath = `${absolutePath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporaryPath, renderTypeScriptBuildIdentity(value), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(temporaryPath, absolutePath);
    chmodSync(absolutePath, 0o444);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function buildIdentityFromResponse(payload, context) {
  assertion(isPlainObject(payload), `${context} must be a JSON object.`);
  const identity = validateBuildIdentity(
    {
      sourceCommit: payload.sourceCommit,
      sourceTree: payload.sourceTree,
      release: payload.release,
      buildTime: payload.buildTime,
    },
    context,
  );
  assertion(
    payload.runtimeCommit === identity.sourceCommit,
    `${context}.runtimeCommit must equal sourceCommit.`,
  );
  return identity;
}

function assertSameIdentity(expected, actual, context) {
  for (const field of IDENTITY_KEYS) {
    assertion(
      actual[field] === expected[field],
      `${context}.${field} does not match the approved release manifest.`,
    );
  }
}

function firstInspectObject(value, context) {
  assertion(Array.isArray(value) && value.length === 1, `${context} must contain one inspect result.`);
  assertion(isPlainObject(value[0]), `${context}[0] must be an object.`);
  return value[0];
}

function verifyImageEvidence({
  name,
  approved,
  repositoryDigest,
  imageInspect,
  containerInspect,
  identity,
}) {
  assertion(
    repositoryDigest === approved.repositoryDigest,
    `${name} compose repository digest does not match the approved manifest.`,
  );
  const image = firstInspectObject(imageInspect, `${name} image inspect`);
  assertion(image.Id === approved.imageId, `${name} image Id does not match the approved manifest.`);
  assertion(
    Array.isArray(image.RepoDigests) && image.RepoDigests.includes(approved.repositoryDigest),
    `${name} image RepoDigests does not contain the approved repository digest.`,
  );
  const labels = image.Config?.Labels;
  assertion(isPlainObject(labels), `${name} image labels are missing.`);
  const expectedLabels = {
    'org.opencontainers.image.revision': identity.sourceCommit,
    'org.opencontainers.image.version': identity.release,
    'org.opencontainers.image.created': identity.buildTime,
    'com.feishu-timeline.source-tree': identity.sourceTree,
  };
  for (const [label, expectedValue] of Object.entries(expectedLabels)) {
    assertion(labels[label] === expectedValue, `${name} image label ${label} is inconsistent.`);
  }

  if (containerInspect !== undefined) {
    const container = firstInspectObject(containerInspect, `${name} container inspect`);
    assertion(
      container.Image === approved.imageId,
      `${name} running container image Id does not match the approved image Id.`,
    );
    assertion(
      container.Config?.Image === approved.repositoryDigest,
      `${name} running container repository digest does not match the approved digest.`,
    );
  }
}

export function verifyReleaseEvidence({
  manifest,
  expectedIdentity,
  apiResponse,
  webResponse,
  repositoryDigests,
  imageInspects,
  containerInspects,
}) {
  const approved = validateReleaseApproval({
    manifest,
    expectedIdentity,
    repositoryDigests,
  });

  assertion(apiResponse.status === 'ok', 'API health status must equal ok.');
  assertSameIdentity(
    approved.identity,
    buildIdentityFromResponse(apiResponse, 'API build identity'),
    'API build identity',
  );
  assertSameIdentity(
    approved.identity,
    buildIdentityFromResponse(webResponse, 'Web build identity'),
    'Web build identity',
  );

  verifyImageEvidence({
    name: 'API',
    approved: approved.images.api,
    repositoryDigest: repositoryDigests.api,
    imageInspect: imageInspects.api,
    containerInspect: containerInspects.api,
    identity: approved.identity,
  });
  verifyImageEvidence({
    name: 'API ops',
    approved: approved.images.apiOps,
    repositoryDigest: repositoryDigests.apiOps,
    imageInspect: imageInspects.apiOps,
    identity: approved.identity,
  });
  verifyImageEvidence({
    name: 'Web',
    approved: approved.images.web,
    repositoryDigest: repositoryDigests.web,
    imageInspect: imageInspects.web,
    containerInspect: containerInspects.web,
    identity: approved.identity,
  });
  return approved;
}

function parseOptions(argv, allowedNames) {
  assertion(argv.length % 2 === 0, 'Every option must have a value.');
  const options = Object.create(null);
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    assertion(allowedNames.has(name), 'Unsupported option.');
    assertion(options[name] === undefined, `Duplicate option: ${name}.`);
    assertString(value, name, 4096);
    options[name] = value;
  }
  for (const name of allowedNames) {
    assertion(options[name] !== undefined, `Missing required option: ${name}.`);
  }
  return options;
}

function identityFromOptions(options, prefix = '') {
  return {
    sourceCommit: options[`--${prefix}source-commit`],
    sourceTree: options[`--${prefix}source-tree`],
    release: options[`--${prefix}release`],
    buildTime: options[`--${prefix}build-time`],
  };
}

function runCli(argv) {
  const [command, ...rest] = argv;
  if (command === 'generate-ts') {
    const options = parseOptions(
      rest,
      new Set([
        '--source-commit',
        '--source-tree',
        '--release',
        '--build-time',
        '--output',
      ]),
    );
    writeTypeScriptBuildIdentity(options['--output'], identityFromOptions(options));
    return;
  }

  if (command === 'validate-identity') {
    const options = parseOptions(
      rest,
      new Set(['--source-commit', '--source-tree', '--release', '--build-time']),
    );
    validateBuildIdentity(identityFromOptions(options));
    return;
  }

  if (command === 'validate-manifest') {
    const options = parseOptions(rest, new Set(['--manifest']));
    validateReleaseManifest(readJsonFile(options['--manifest'], 'release manifest'));
    return;
  }

  if (command === 'validate-approval') {
    const options = parseOptions(
      rest,
      new Set([
        '--manifest',
        '--expected-source-commit',
        '--expected-source-tree',
        '--expected-release',
        '--expected-build-time',
        '--api-repository-digest',
        '--api-ops-repository-digest',
        '--web-repository-digest',
      ]),
    );
    validateReleaseApproval({
      manifest: readJsonFile(options['--manifest'], 'release manifest'),
      expectedIdentity: identityFromOptions(options, 'expected-'),
      repositoryDigests: {
        api: options['--api-repository-digest'],
        apiOps: options['--api-ops-repository-digest'],
        web: options['--web-repository-digest'],
      },
    });
    return;
  }

  if (command === 'verify-evidence') {
    const allowed = new Set([
      '--manifest',
      '--expected-source-commit',
      '--expected-source-tree',
      '--expected-release',
      '--expected-build-time',
      '--api-response',
      '--web-response',
      '--api-repository-digest',
      '--api-ops-repository-digest',
      '--web-repository-digest',
      '--api-image-inspect',
      '--api-ops-image-inspect',
      '--web-image-inspect',
      '--api-container-inspect',
      '--web-container-inspect',
    ]);
    const options = parseOptions(rest, allowed);
    verifyReleaseEvidence({
      manifest: readJsonFile(options['--manifest'], 'release manifest'),
      expectedIdentity: identityFromOptions(options, 'expected-'),
      apiResponse: readJsonFile(options['--api-response'], 'API response'),
      webResponse: readJsonFile(options['--web-response'], 'Web response'),
      repositoryDigests: {
        api: options['--api-repository-digest'],
        apiOps: options['--api-ops-repository-digest'],
        web: options['--web-repository-digest'],
      },
      imageInspects: {
        api: readJsonFile(options['--api-image-inspect'], 'API image inspect'),
        apiOps: readJsonFile(options['--api-ops-image-inspect'], 'API ops image inspect'),
        web: readJsonFile(options['--web-image-inspect'], 'Web image inspect'),
      },
      containerInspects: {
        api: readJsonFile(options['--api-container-inspect'], 'API container inspect'),
        web: readJsonFile(options['--web-container-inspect'], 'Web container inspect'),
      },
    });
    return;
  }

  throw new Error(
    'Usage: release-identity.mjs <generate-ts|validate-identity|validate-manifest|validate-approval|verify-evidence> [options]',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'release identity validation failed';
    process.stderr.write(`[ERROR] ${message}\n`);
    process.exitCode = 1;
  }
}
