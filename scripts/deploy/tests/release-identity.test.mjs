import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  renderTypeScriptBuildIdentity,
  validateBuildIdentity,
  validateReleaseApproval,
  validateReleaseManifest,
  verifyReleaseEvidence,
} from '../release-identity.mjs';

const HELPER = fileURLToPath(new URL('../release-identity.mjs', import.meta.url));
const SOURCE_COMMIT = '1'.repeat(40);
const SOURCE_TREE = '2'.repeat(40);
const IDENTITY = Object.freeze({
  sourceCommit: SOURCE_COMMIT,
  sourceTree: SOURCE_TREE,
  release: 'r27rc1.2026-09-04+approved',
  buildTime: '2026-09-04T05:30:00Z',
});

function image(name, digestCharacter, imageIdCharacter) {
  return {
    imageId: `sha256:${imageIdCharacter.repeat(64)}`,
    repositoryDigest: `registry.example.test/feishu/${name}@sha256:${digestCharacter.repeat(64)}`,
  };
}

const IMAGES = Object.freeze({
  api: image('api', 'a', '4'),
  apiOps: image('api-ops', 'b', '5'),
  web: image('web', 'c', '6'),
});
const MANIFEST = Object.freeze({
  schemaVersion: 1,
  identity: IDENTITY,
  images: IMAGES,
});

function labels() {
  return {
    'org.opencontainers.image.revision': IDENTITY.sourceCommit,
    'org.opencontainers.image.version': IDENTITY.release,
    'org.opencontainers.image.created': IDENTITY.buildTime,
    'com.feishu-timeline.source-tree': IDENTITY.sourceTree,
  };
}

function evidence() {
  return {
    manifest: structuredClone(MANIFEST),
    expectedIdentity: { ...IDENTITY },
    apiResponse: { status: 'ok', ...IDENTITY, runtimeCommit: IDENTITY.sourceCommit },
    webResponse: { ...IDENTITY, runtimeCommit: IDENTITY.sourceCommit },
    repositoryDigests: {
      api: IMAGES.api.repositoryDigest,
      apiOps: IMAGES.apiOps.repositoryDigest,
      web: IMAGES.web.repositoryDigest,
    },
    imageInspects: {
      api: [{ Id: IMAGES.api.imageId, RepoDigests: [IMAGES.api.repositoryDigest], Config: { Labels: labels() } }],
      apiOps: [{ Id: IMAGES.apiOps.imageId, RepoDigests: [IMAGES.apiOps.repositoryDigest], Config: { Labels: labels() } }],
      web: [{ Id: IMAGES.web.imageId, RepoDigests: [IMAGES.web.repositoryDigest], Config: { Labels: labels() } }],
    },
    containerInspects: {
      api: [{ Image: IMAGES.api.imageId, Config: { Image: IMAGES.api.repositoryDigest } }],
      web: [{ Image: IMAGES.web.imageId, Config: { Image: IMAGES.web.repositoryDigest } }],
    },
  };
}

function runHelper(args, cwd) {
  return spawnSync(process.execPath, [HELPER, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function identityArgs() {
  return [
    '--source-commit', IDENTITY.sourceCommit,
    '--source-tree', IDENTITY.sourceTree,
    '--release', IDENTITY.release,
    '--build-time', IDENTITY.buildTime,
  ];
}

test('canonical four-field identity and manifest are accepted', () => {
  assert.deepEqual(validateBuildIdentity({ ...IDENTITY }), IDENTITY);
  assert.deepEqual(validateReleaseManifest(structuredClone(MANIFEST)), MANIFEST);
  assert.deepEqual(
    validateReleaseApproval({
      manifest: structuredClone(MANIFEST),
      expectedIdentity: { ...IDENTITY },
      repositoryDigests: {
        api: IMAGES.api.repositoryDigest,
        apiOps: IMAGES.apiOps.repositoryDigest,
        web: IMAGES.web.repositoryDigest,
      },
    }),
    MANIFEST,
  );
});

test('identity rejects missing, extra, abbreviated, uppercase, zero and malformed values', () => {
  const invalidIdentities = [
    { sourceCommit: SOURCE_COMMIT, sourceTree: SOURCE_TREE, release: IDENTITY.release },
    { ...IDENTITY, extra: 'not-allowed' },
    { ...IDENTITY, sourceCommit: SOURCE_COMMIT.slice(0, 12) },
    { ...IDENTITY, sourceCommit: 'A'.repeat(40) },
    { ...IDENTITY, sourceCommit: '0'.repeat(40) },
    { ...IDENTITY, sourceTree: '0'.repeat(40) },
    { ...IDENTITY, release: '' },
    { ...IDENTITY, release: 'latest' },
    { ...IDENTITY, release: 'replace-with-release' },
    { ...IDENTITY, release: 'r27/unsafe' },
    { ...IDENTITY, release: 'r'.repeat(129) },
    { ...IDENTITY, buildTime: '2026-02-30T00:00:00Z' },
    { ...IDENTITY, buildTime: '2026-09-04T05:30:00.000Z' },
    { ...IDENTITY, buildTime: '2026-09-04T13:30:00+08:00' },
  ];
  for (const candidate of invalidIdentities) {
    assert.throws(() => validateBuildIdentity(candidate));
  }
});

test('manifest rejects schema drift, placeholders and approval mismatches', () => {
  assert.throws(() => validateReleaseManifest({ ...structuredClone(MANIFEST), schemaVersion: 2 }));
  assert.throws(() => validateReleaseManifest({ ...structuredClone(MANIFEST), unexpected: true }));
  const zeroImage = structuredClone(MANIFEST);
  zeroImage.images.api.imageId = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => validateReleaseManifest(zeroImage));
  const tagImage = structuredClone(MANIFEST);
  tagImage.images.api.repositoryDigest = 'registry.example.test/feishu/api:latest';
  assert.throws(() => validateReleaseManifest(tagImage));
  const malformedImage = structuredClone(MANIFEST);
  malformedImage.images.api.repositoryDigest = `registry.example.test//api@sha256:${'a'.repeat(64)}`;
  assert.throws(() => validateReleaseManifest(malformedImage));

  const wrongIdentity = { ...IDENTITY, release: 'r27rc1.other' };
  assert.throws(() => validateReleaseApproval({
    manifest: MANIFEST,
    expectedIdentity: wrongIdentity,
    repositoryDigests: {
      api: IMAGES.api.repositoryDigest,
      apiOps: IMAGES.apiOps.repositoryDigest,
      web: IMAGES.web.repositoryDigest,
    },
  }));
  assert.throws(() => validateReleaseApproval({
    manifest: MANIFEST,
    expectedIdentity: IDENTITY,
    repositoryDigests: {
      api: IMAGES.web.repositoryDigest,
      apiOps: IMAGES.apiOps.repositoryDigest,
      web: IMAGES.web.repositoryDigest,
    },
  }));
});

test('TypeScript renderer emits only the immutable canonical constant', () => {
  const rendered = renderTypeScriptBuildIdentity(IDENTITY);
  assert.match(rendered, /export const IMMUTABLE_BUILD_IDENTITY = \{/);
  assert.match(rendered, new RegExp(SOURCE_COMMIT));
  assert.match(rendered, new RegExp(SOURCE_TREE));
  assert.doesNotMatch(rendered, /process\.env/);
});

test('generate-ts confines output to the two frozen generated paths', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'release-identity-output-'));
  try {
    const approvedRelative = 'apps/api/src/common/build-identity.generated.ts';
    const approvedAbsolute = resolve(root, approvedRelative);
    mkdirSync(dirname(approvedAbsolute), { recursive: true });

    let result = runHelper(['generate-ts', ...identityArgs(), '--output', approvedRelative], root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(approvedAbsolute, 'utf8'), /IMMUTABLE_BUILD_IDENTITY/);
    assert.equal(lstatSync(approvedAbsolute).mode & 0o777, 0o444);

    unlinkSync(approvedAbsolute);
    result = runHelper(['generate-ts', ...identityArgs(), '--output', approvedAbsolute], root);
    assert.equal(result.status, 0, result.stderr);

    const rejected = [
      'apps/api/src/common/../../../escape.ts',
      resolve(root, 'arbitrary-absolute.ts'),
      '-leading-dash.ts',
    ];
    for (const output of rejected) {
      result = runHelper(['generate-ts', ...identityArgs(), '--output', output], root);
      assert.notEqual(result.status, 0, `unexpectedly accepted ${output}`);
      assert.match(result.stderr, /not an approved generated identity path/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unsupported option diagnostics never echo attacker-controlled option text', () => {
  const secret = 'SENSITIVE_ATTACKER_OPTION_DO_NOT_ECHO';
  const result = runHelper(
    ['validate-identity', ...identityArgs(), `--${secret}`, 'ignored'],
    process.cwd(),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsupported option\./);
  assert.doesNotMatch(result.stderr, new RegExp(secret));
});

test('approved manifest reader rejects symlinks', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'release-manifest-symlink-'));
  try {
    const manifestPath = resolve(root, 'manifest.json');
    const linkPath = resolve(root, 'manifest-link.json');
    writeFileSync(manifestPath, JSON.stringify(MANIFEST));
    symlinkSync(manifestPath, linkPath);
    const result = runHelper(['validate-manifest', '--manifest', linkPath], root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /regular non-symlink file/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('health evidence accepts a complete immutable chain', () => {
  assert.deepEqual(verifyReleaseEvidence(evidence()), MANIFEST);
});

test('health evidence fails every identity, OCI, image and running-container mismatch', () => {
  const mutations = [
    (value) => { value.expectedIdentity.sourceCommit = '3'.repeat(40); },
    (value) => { value.apiResponse.sourceTree = '3'.repeat(40); },
    (value) => { value.apiResponse.runtimeCommit = '3'.repeat(40); },
    (value) => { value.apiResponse.status = 'degraded'; },
    (value) => { value.webResponse.release = 'r27rc1.wrong'; },
    (value) => { value.webResponse.runtimeCommit = '3'.repeat(40); },
    (value) => { value.repositoryDigests.api = value.repositoryDigests.web; },
    (value) => { value.imageInspects.api[0].Id = IMAGES.web.imageId; },
    (value) => { value.imageInspects.api[0].RepoDigests = []; },
    (value) => { value.imageInspects.api[0].Config.Labels['org.opencontainers.image.revision'] = '3'.repeat(40); },
    (value) => { value.imageInspects.apiOps[0].Config.Labels['com.feishu-timeline.source-tree'] = '3'.repeat(40); },
    (value) => { value.imageInspects.web[0].Config.Labels['org.opencontainers.image.created'] = '2026-09-04T05:30:01Z'; },
    (value) => { value.containerInspects.api[0].Image = IMAGES.web.imageId; },
    (value) => { value.containerInspects.web[0].Config.Image = IMAGES.api.repositoryDigest; },
  ];
  for (const mutate of mutations) {
    const value = evidence();
    mutate(value);
    assert.throws(() => verifyReleaseEvidence(value));
  }
});
