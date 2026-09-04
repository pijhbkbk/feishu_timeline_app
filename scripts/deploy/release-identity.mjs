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
const IMAGE_KEYS = ['api', 'apiOps', 'web', 'postgres', 'redis', 'nginx'];
const FULL_GIT_OBJECT_RE = /^[a-f0-9]{40}$/;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const IMAGE_DIGEST_RE = /^[a-f0-9]{64}$/;
const REPOSITORY_COMPONENT_RE = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
const REGISTRY_HOST_RE = /^(?:localhost|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)$/;
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

export function validateImageCoordinates(repository, digest, context = 'image') {
  assertString(repository, `${context}.repository`, 255);
  assertString(digest, `${context}.digest`, 64);
  assertion(!repository.includes('@'), `${context}.repository must not contain @.`);
  assertion(!PLACEHOLDER_RE.test(repository), `${context}.repository must not be a placeholder.`);

  const components = repository.split('/');
  assertion(components.every((component) => component.length > 0), `${context}.repository is malformed.`);
  let firstComponent = components[0];
  let hasRegistryPort = false;
  if (firstComponent.includes(':')) {
    const portSeparator = firstComponent.lastIndexOf(':');
    const host = firstComponent.slice(0, portSeparator);
    const port = firstComponent.slice(portSeparator + 1);
    assertion(
      components.length > 1 && !host.includes(':') && /^[0-9]{1,5}$/.test(port),
      `${context}.repository may use a numeric registry port only before a repository path.`,
    );
    const numericPort = Number(port);
    assertion(numericPort >= 1 && numericPort <= 65535, `${context}.repository registry port is invalid.`);
    firstComponent = host;
    hasRegistryPort = true;
  }
  if (hasRegistryPort || firstComponent.includes('.') || firstComponent === 'localhost') {
    assertion(REGISTRY_HOST_RE.test(firstComponent), `${context}.repository registry hostname is invalid.`);
  }
  assertion(
    REPOSITORY_COMPONENT_RE.test(firstComponent) &&
      components.slice(1).every((component) => REPOSITORY_COMPONENT_RE.test(component)),
    `${context}.repository is malformed.`,
  );
  assertion(
    IMAGE_DIGEST_RE.test(digest) && !/^0{64}$/.test(digest),
    `${context}.digest must be exactly 64 lowercase hexadecimal characters and not a placeholder.`,
  );

  return Object.freeze({ repository, digest, repositoryDigest: `${repository}@sha256:${digest}` });
}

export function validateReleaseImages(value) {
  assertion(isPlainObject(value), 'release images must be a JSON object.');
  assertExactKeys(value, IMAGE_KEYS, 'release images');
  return Object.freeze(
    Object.fromEntries(
      IMAGE_KEYS.map((name) => {
        const coordinates = value[name];
        assertion(isPlainObject(coordinates), `release images.${name} must be a JSON object.`);
        assertExactKeys(coordinates, ['digest', 'repository'], `release images.${name}`);
        return [
          name,
          validateImageCoordinates(
            coordinates.repository,
            coordinates.digest,
            `release images.${name}`,
          ),
        ];
      }),
    ),
  );
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
  const match = /^(.+)@sha256:([a-f0-9]{64})$/.exec(repositoryDigest);
  assertion(match !== null, `${context}.repositoryDigest must be an approved digest-pinned repository reference.`);
  const coordinates = validateImageCoordinates(match[1], match[2], context);
  assertion(
    coordinates.repositoryDigest === repositoryDigest,
    `${context}.repositoryDigest must use the canonical repository digest format.`,
  );
  return Object.freeze({ imageId, repositoryDigest: coordinates.repositoryDigest });
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
    postgres: validateImageIdentity(value.images.postgres, 'release manifest.images.postgres'),
    redis: validateImageIdentity(value.images.redis, 'release manifest.images.redis'),
    nginx: validateImageIdentity(value.images.nginx, 'release manifest.images.nginx'),
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
  verifyBuildLabels = true,
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
  if (verifyBuildLabels) {
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
  verifyImageEvidence({
    name: 'PostgreSQL',
    approved: approved.images.postgres,
    repositoryDigest: repositoryDigests.postgres,
    imageInspect: imageInspects.postgres,
    containerInspect: containerInspects.postgres,
    identity: approved.identity,
    verifyBuildLabels: false,
  });
  verifyImageEvidence({
    name: 'Redis',
    approved: approved.images.redis,
    repositoryDigest: repositoryDigests.redis,
    imageInspect: imageInspects.redis,
    containerInspect: containerInspects.redis,
    identity: approved.identity,
    verifyBuildLabels: false,
  });
  verifyImageEvidence({
    name: 'Nginx',
    approved: approved.images.nginx,
    repositoryDigest: repositoryDigests.nginx,
    imageInspect: imageInspects.nginx,
    containerInspect: containerInspects.nginx,
    identity: approved.identity,
    verifyBuildLabels: false,
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

function releaseImagesFromOptions(options) {
  return {
    api: { repository: options['--api-repository'], digest: options['--api-digest'] },
    apiOps: {
      repository: options['--api-ops-repository'],
      digest: options['--api-ops-digest'],
    },
    web: { repository: options['--web-repository'], digest: options['--web-digest'] },
    postgres: {
      repository: options['--postgres-repository'],
      digest: options['--postgres-digest'],
    },
    redis: { repository: options['--redis-repository'], digest: options['--redis-digest'] },
    nginx: { repository: options['--nginx-repository'], digest: options['--nginx-digest'] },
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

  if (command === 'validate-images') {
    const options = parseOptions(
      rest,
      new Set([
        '--api-repository',
        '--api-digest',
        '--api-ops-repository',
        '--api-ops-digest',
        '--web-repository',
        '--web-digest',
        '--postgres-repository',
        '--postgres-digest',
        '--redis-repository',
        '--redis-digest',
        '--nginx-repository',
        '--nginx-digest',
      ]),
    );
    validateReleaseImages(releaseImagesFromOptions(options));
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
        '--postgres-repository-digest',
        '--redis-repository-digest',
        '--nginx-repository-digest',
      ]),
    );
    validateReleaseApproval({
      manifest: readJsonFile(options['--manifest'], 'release manifest'),
      expectedIdentity: identityFromOptions(options, 'expected-'),
      repositoryDigests: {
        api: options['--api-repository-digest'],
        apiOps: options['--api-ops-repository-digest'],
        web: options['--web-repository-digest'],
        postgres: options['--postgres-repository-digest'],
        redis: options['--redis-repository-digest'],
        nginx: options['--nginx-repository-digest'],
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
      '--postgres-repository-digest',
      '--redis-repository-digest',
      '--nginx-repository-digest',
      '--api-image-inspect',
      '--api-ops-image-inspect',
      '--web-image-inspect',
      '--postgres-image-inspect',
      '--redis-image-inspect',
      '--nginx-image-inspect',
      '--api-container-inspect',
      '--web-container-inspect',
      '--postgres-container-inspect',
      '--redis-container-inspect',
      '--nginx-container-inspect',
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
        postgres: options['--postgres-repository-digest'],
        redis: options['--redis-repository-digest'],
        nginx: options['--nginx-repository-digest'],
      },
      imageInspects: {
        api: readJsonFile(options['--api-image-inspect'], 'API image inspect'),
        apiOps: readJsonFile(options['--api-ops-image-inspect'], 'API ops image inspect'),
        web: readJsonFile(options['--web-image-inspect'], 'Web image inspect'),
        postgres: readJsonFile(options['--postgres-image-inspect'], 'PostgreSQL image inspect'),
        redis: readJsonFile(options['--redis-image-inspect'], 'Redis image inspect'),
        nginx: readJsonFile(options['--nginx-image-inspect'], 'Nginx image inspect'),
      },
      containerInspects: {
        api: readJsonFile(options['--api-container-inspect'], 'API container inspect'),
        web: readJsonFile(options['--web-container-inspect'], 'Web container inspect'),
        postgres: readJsonFile(options['--postgres-container-inspect'], 'PostgreSQL container inspect'),
        redis: readJsonFile(options['--redis-container-inspect'], 'Redis container inspect'),
        nginx: readJsonFile(options['--nginx-container-inspect'], 'Nginx container inspect'),
      },
    });
    return;
  }

  throw new Error(
    'Usage: release-identity.mjs <generate-ts|validate-identity|validate-images|validate-manifest|validate-approval|verify-evidence> [options]',
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
