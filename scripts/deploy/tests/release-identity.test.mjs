import { createHash } from 'node:crypto';
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
  candidateEvidenceSha256,
  generateCandidateEvidence,
  releaseManifestSha256,
  validateCandidateEvidenceManifest,
  verifyCandidateEvidence,
  renderTypeScriptBuildIdentity,
  validateBuildIdentity,
  validateImageCoordinates,
  validateReleaseApproval,
  validateReleaseImages,
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
  postgres: image('postgres', 'd', '7'),
  redis: image('redis', 'e', '8'),
  nginx: image('nginx', 'f', '9'),
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

function repositoryDigests() {
  return Object.fromEntries(
    Object.entries(IMAGES).map(([name, value]) => [name, value.repositoryDigest]),
  );
}

function releaseImageCoordinates() {
  return Object.fromEntries(
    Object.entries(IMAGES).map(([name, value]) => {
      const [repository, digest] = value.repositoryDigest.split('@sha256:');
      return [name, { repository, digest }];
    }),
  );
}

function evidence() {
  return {
    manifest: structuredClone(MANIFEST),
    expectedIdentity: { ...IDENTITY },
    apiResponse: { status: 'ok', ...IDENTITY, runtimeCommit: IDENTITY.sourceCommit },
    webResponse: { ...IDENTITY, runtimeCommit: IDENTITY.sourceCommit },
    repositoryDigests: repositoryDigests(),
    imageInspects: {
      api: [{ Id: IMAGES.api.imageId, RepoDigests: [IMAGES.api.repositoryDigest], Config: { Labels: labels() } }],
      apiOps: [{ Id: IMAGES.apiOps.imageId, RepoDigests: [IMAGES.apiOps.repositoryDigest], Config: { Labels: labels() } }],
      web: [{ Id: IMAGES.web.imageId, RepoDigests: [IMAGES.web.repositoryDigest], Config: { Labels: labels() } }],
      postgres: [{ Id: IMAGES.postgres.imageId, RepoDigests: [IMAGES.postgres.repositoryDigest] }],
      redis: [{ Id: IMAGES.redis.imageId, RepoDigests: [IMAGES.redis.repositoryDigest] }],
      nginx: [{ Id: IMAGES.nginx.imageId, RepoDigests: [IMAGES.nginx.repositoryDigest] }],
    },
    containerInspects: {
      api: [{ Image: IMAGES.api.imageId, Config: { Image: IMAGES.api.repositoryDigest } }],
      web: [{ Image: IMAGES.web.imageId, Config: { Image: IMAGES.web.repositoryDigest } }],
      postgres: [{ Image: IMAGES.postgres.imageId, Config: { Image: IMAGES.postgres.repositoryDigest } }],
      redis: [{ Image: IMAGES.redis.imageId, Config: { Image: IMAGES.redis.repositoryDigest } }],
      nginx: [{ Image: IMAGES.nginx.imageId, Config: { Image: IMAGES.nginx.repositoryDigest } }],
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

test('canonical four-field identity and six-image manifest are accepted', () => {
  assert.deepEqual(validateBuildIdentity({ ...IDENTITY }), IDENTITY);
  assert.deepEqual(validateReleaseManifest(structuredClone(MANIFEST)), MANIFEST);
  assert.deepEqual(
    validateReleaseApproval({
      manifest: structuredClone(MANIFEST),
      expectedIdentity: { ...IDENTITY },
      repositoryDigests: repositoryDigests(),
    }),
    MANIFEST,
  );
});

test('six-image coordinate validator rejects the complete invalid input matrix', () => {
  const valid = releaseImageCoordinates();
  assert.deepEqual(validateReleaseImages(structuredClone(valid)), {
    api: { ...valid.api, repositoryDigest: IMAGES.api.repositoryDigest },
    apiOps: { ...valid.apiOps, repositoryDigest: IMAGES.apiOps.repositoryDigest },
    web: { ...valid.web, repositoryDigest: IMAGES.web.repositoryDigest },
    postgres: { ...valid.postgres, repositoryDigest: IMAGES.postgres.repositoryDigest },
    redis: { ...valid.redis, repositoryDigest: IMAGES.redis.repositoryDigest },
    nginx: { ...valid.nginx, repositoryDigest: IMAGES.nginx.repositoryDigest },
  });
  assert.equal(
    validateImageCoordinates(
      'registry.example.test:5443/feishu/api',
      'a'.repeat(64),
    ).repositoryDigest,
    `registry.example.test:5443/feishu/api@sha256:${'a'.repeat(64)}`,
  );

  const invalidCoordinates = [
    { repository: undefined, digest: 'a'.repeat(64) },
    { repository: 'registry.example.test/feishu/image', digest: undefined },
    { repository: '', digest: 'a'.repeat(64) },
    { repository: 'registry.example.test/feishu/image', digest: '' },
    { repository: '   ', digest: 'a'.repeat(64) },
    { repository: 'registry.example.test/feishu/image', digest: '   ' },
    { repository: 'registry.example.test/feishu/image', digest: 'a'.repeat(63) },
    { repository: 'registry.example.test/feishu/image', digest: 'a'.repeat(65) },
    { repository: 'registry.example.test/feishu/image', digest: 'A'.repeat(64) },
    { repository: 'registry.example.test/feishu/image', digest: `${'a'.repeat(63)}g` },
    { repository: 'registry.example.test/feishu/image', digest: `sha512:${'a'.repeat(64)}` },
    { repository: 'registry.example.test/feishu/image ', digest: 'a'.repeat(64) },
    { repository: 'registry.example.test/feishu/image', digest: `${'a'.repeat(64)} ` },
    { repository: 'registry.example.test/feishu/image\nnext', digest: 'a'.repeat(64) },
    { repository: 'registry.example.test/feishu/image\rnext', digest: 'a'.repeat(64) },
    { repository: 'registry.example.test/feishu/image', digest: `${'a'.repeat(64)}\n` },
    { repository: 'registry.example.test/feishu/image', digest: `${'a'.repeat(64)}\r` },
    { repository: 'registry.example.test/feishu/image@other', digest: 'a'.repeat(64) },
    { repository: 'registry.example.test//feishu/image', digest: 'a'.repeat(64) },
    { repository: 'registry.example.test/feishu/image:latest', digest: 'a'.repeat(64) },
    { repository: '-leading-option/image', digest: 'a'.repeat(64) },
    { repository: 'registry_host:5000/feishu/image', digest: 'a'.repeat(64) },
    { repository: 'registry.example.test/feishu/image;command', digest: 'a'.repeat(64) },
  ];

  for (const imageName of Object.keys(valid)) {
    for (const coordinates of invalidCoordinates) {
      const candidate = structuredClone(valid);
      candidate[imageName] = { ...coordinates };
      assert.throws(
        () => validateReleaseImages(candidate),
        `unexpectedly accepted invalid ${imageName} coordinates`,
      );
    }
    const legacyOverride = structuredClone(valid);
    legacyOverride[imageName].image = `${legacyOverride[imageName].repository}:latest`;
    assert.throws(() => validateReleaseImages(legacyOverride));
  }
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
  const missingRedis = structuredClone(MANIFEST);
  delete missingRedis.images.redis;
  assert.throws(() => validateReleaseManifest(missingRedis));

  const wrongIdentity = { ...IDENTITY, release: 'r27rc1.other' };
  assert.throws(() => validateReleaseApproval({
    manifest: MANIFEST,
    expectedIdentity: wrongIdentity,
    repositoryDigests: repositoryDigests(),
  }));
  assert.throws(() => validateReleaseApproval({
    manifest: MANIFEST,
    expectedIdentity: IDENTITY,
    repositoryDigests: { ...repositoryDigests(), api: IMAGES.web.repositoryDigest },
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
    (value) => { value.repositoryDigests.redis = IMAGES.nginx.repositoryDigest; },
    (value) => { value.imageInspects.postgres[0].RepoDigests = []; },
    (value) => { value.imageInspects.nginx[0].Id = IMAGES.redis.imageId; },
    (value) => { value.containerInspects.redis[0].Image = IMAGES.nginx.imageId; },
    (value) => { value.containerInspects.nginx[0].Config.Image = IMAGES.redis.repositoryDigest; },
  ];
  for (const mutate of mutations) {
    const value = evidence();
    mutate(value);
    assert.throws(() => verifyReleaseEvidence(value));
  }
});

// Synthetic fixtures exercise the contract; they are never release evidence.
function candidateFixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'candidate-evidence-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const reference = (path, value) => {
    const bytes = typeof value === 'string' ? value : JSON.stringify(value);
    writeFileSync(resolve(root, path), bytes);
    return { path, sha256: createHash('sha256').update(bytes).digest('hex') };
  };
  const inspects = evidence().imageInspects;
  for (const value of Object.values(inspects)) Object.assign(value[0], { Os: 'linux', Architecture: 'amd64' });
  const details = {
    parentCommit: '3'.repeat(40), targetPlatform: 'linux/amd64',
    platformEvidence: reference('image-inspects.json', inspects),
    checks: Object.fromEntries(['g3', 'g4Diff', 'g4Full', 'secrets', 'sast', 'sca', 'images'].map((name) =>
      [name, { status: 'PASS', artifact: reference(`${name}.txt`, `SYNTHETIC ${name} test fixture\n`) }])),
  };
  const candidate = generateCandidateEvidence({ manifest: MANIFEST, details });
  const args = { manifest: MANIFEST, evidence: candidate, expectedIdentity: IDENTITY,
    expectedEvidenceSha256: candidateEvidenceSha256(candidate), evidenceRoot: root };
  return { root, details, candidate, args, reference, inspects };
}

test('candidate CLI generation, external digest pin and consumption preserve runtime v1', (t) => {
  const f = candidateFixture(t);
  writeFileSync(resolve(f.root, 'runtime.json'), JSON.stringify(MANIFEST));
  writeFileSync(resolve(f.root, 'details.json'), JSON.stringify(f.details));
  const generated = runHelper(['generate-candidate-evidence', '--manifest', 'runtime.json', '--details', 'details.json'], f.root);
  assert.equal(generated.status, 0, generated.stderr);
  assert.deepEqual(JSON.parse(generated.stdout), f.candidate);
  writeFileSync(resolve(f.root, 'candidate.json'), generated.stdout);
  const hashed = runHelper(['candidate-evidence-sha256', '--evidence', 'candidate.json'], f.root);
  assert.equal(hashed.status, 0, hashed.stderr);
  assert.equal(hashed.stdout.trim(), f.args.expectedEvidenceSha256);
  const cliArgs = ['verify-candidate-evidence', '--manifest', 'runtime.json', '--evidence', 'candidate.json',
    '--evidence-root', f.root, '--expected-evidence-sha256', f.args.expectedEvidenceSha256,
    '--expected-source-commit', IDENTITY.sourceCommit, '--expected-source-tree', IDENTITY.sourceTree,
    '--expected-release', IDENTITY.release, '--expected-build-time', IDENTITY.buildTime];
  const verified = runHelper(cliArgs, f.root);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(runHelper(['validate-manifest', '--manifest', 'candidate.json'], f.root).status, 1);
  assert.equal(runHelper(['validate-manifest', '--manifest', 'runtime.json'], f.root).status, 0);
  assert.deepEqual(verifyReleaseEvidence(evidence()), MANIFEST);
  // A consumer's pin remains fixed when untrusted candidate content is changed.
  const changed = structuredClone(f.candidate); changed.parentCommit = 'a'.repeat(40);
  writeFileSync(resolve(f.root, 'candidate.json'), JSON.stringify(changed));
  assert.equal(runHelper(cliArgs, f.root).status, 1);
  unlinkSync(resolve(f.root, 'candidate.json'));
  assert.equal(runHelper(['validate-manifest', '--manifest', 'runtime.json'], f.root).status, 0);
});

test('canonical candidate and runtime hashes ignore formatting and key order only', (t) => {
  const f = candidateFixture(t);
  const reversed = (value) => Object.fromEntries(Object.entries(value).reverse());
  assert.equal(releaseManifestSha256(reversed(MANIFEST)), releaseManifestSha256(MANIFEST));
  assert.equal(candidateEvidenceSha256({ ...reversed(f.candidate), checks: reversed(f.candidate.checks) }), f.args.expectedEvidenceSha256);
  const invalidRuntime = { ...MANIFEST, extra: true };
  assert.throws(() => releaseManifestSha256(invalidRuntime));
  assert.throws(() => generateCandidateEvidence({ manifest: invalidRuntime, details: f.details }));
});

test('candidate schema rejects missing, extra, incompatible and malformed fields', (t) => {
  const f = candidateFixture(t);
  for (const key of Object.keys(f.candidate)) {
    const changed = structuredClone(f.candidate); delete changed[key];
    assert.throws(() => validateCandidateEvidenceManifest(changed), `missing ${key}`);
  }
  for (const patch of [{ extra: true }, { schemaVersion: 2 }, { kind: 'release' }, { parentCommit: 'short' },
    { parentCommit: '0'.repeat(40) }, { targetPlatform: 'host' }, { runtimeManifestSha256: 'bad' },
    { checks: {} }, { identity: { ...IDENTITY, sourceTree: 'bad' } }]) {
    assert.throws(() => validateCandidateEvidenceManifest({ ...f.candidate, ...patch }));
  }
  const changed = structuredClone(f.candidate); changed.checks.g3.extra = true;
  assert.throws(() => validateCandidateEvidenceManifest(changed));
  assert.throws(() => generateCandidateEvidence({ manifest: MANIFEST, details: { ...f.details, identity: IDENTITY } }));
});

test('runtime identity, image content, expected identity and externally pinned evidence must agree', (t) => {
  const f = candidateFixture(t);
  assert.throws(() => verifyCandidateEvidence({ ...f.args, expectedIdentity: { ...IDENTITY, sourceCommit: 'a'.repeat(40) } }));
  const changedIdentity = structuredClone(f.candidate); changedIdentity.identity.sourceTree = 'a'.repeat(40);
  assert.throws(() => verifyCandidateEvidence({ ...f.args, evidence: changedIdentity, expectedEvidenceSha256: candidateEvidenceSha256(changedIdentity) }));
  const changedRuntime = structuredClone(MANIFEST); changedRuntime.images.api.imageId = `sha256:${'b'.repeat(64)}`;
  assert.throws(() => verifyCandidateEvidence({ ...f.args, manifest: changedRuntime }), /runtime manifest SHA-256/);
  const rebound = generateCandidateEvidence({ manifest: changedRuntime, details: f.details });
  assert.throws(() => verifyCandidateEvidence({ ...f.args, manifest: changedRuntime, evidence: rebound }), /external/);
  assert.throws(() => verifyCandidateEvidence({ ...f.args, expectedEvidenceSha256: undefined }), /external/);
});

test('drafts preserve missing platform and NOT_RUN checks; incomplete or failed evidence cannot pass', (t) => {
  const f = candidateFixture(t);
  const details = structuredClone(f.details); details.targetPlatform = null; details.platformEvidence = null;
  details.checks.sast = { status: 'NOT_RUN', artifact: null };
  const draft = generateCandidateEvidence({ manifest: MANIFEST, details });
  assert.equal(draft.targetPlatform, null);
  assert.throws(() => verifyCandidateEvidence({ ...f.args, evidence: draft, expectedEvidenceSha256: candidateEvidenceSha256(draft) }), /platform/);
  for (const name of Object.keys(f.details.checks)) {
    for (const status of ['NOT_RUN', 'FAIL']) {
      const changed = structuredClone(f.candidate);
      changed.checks[name] = { status, artifact: status === 'NOT_RUN' ? null : f.details.checks[name].artifact };
      assert.throws(() => verifyCandidateEvidence({ ...f.args, evidence: changed, expectedEvidenceSha256: candidateEvidenceSha256(changed) }), /not PASS/);
    }
  }
  const invalid = structuredClone(f.candidate); invalid.checks.sast.status = 'NOT_RUN';
  assert.throws(() => validateCandidateEvidenceManifest(invalid), /no artifact/);
});

test('platform evidence validates all six actual image identities, labels and architectures', (t) => {
  const f = candidateFixture(t);
  for (const name of Object.keys(IMAGES)) {
    for (const patch of [{ Architecture: 'arm64' }, { Os: 'darwin' }, { Architecture: undefined },
      { Id: `sha256:${'a'.repeat(64)}` }, { RepoDigests: [] }]) {
      const inspects = structuredClone(f.inspects); Object.assign(inspects[name][0], patch);
      const changed = structuredClone(f.candidate); changed.platformEvidence = f.reference('bad-platform.json', inspects);
      assert.throws(() => verifyCandidateEvidence({ ...f.args, evidence: changed, expectedEvidenceSha256: candidateEvidenceSha256(changed) }));
    }
  }
  const changed = structuredClone(f.candidate);
  const inspects = structuredClone(f.inspects); inspects.apiOps[0].Config.Labels['org.opencontainers.image.revision'] = 'a'.repeat(40);
  changed.platformEvidence = f.reference('bad-label.json', inspects);
  assert.throws(() => verifyCandidateEvidence({ ...f.args, evidence: changed, expectedEvidenceSha256: candidateEvidenceSha256(changed) }), /label/);
});

test('changed artifact bytes and invalid paths are rejected', (t) => {
  const f = candidateFixture(t);
  writeFileSync(resolve(f.root, 'g3.txt'), 'changed content');
  assert.throws(() => verifyCandidateEvidence(f.args), /SHA-256 mismatch/);
  for (const path of ['/tmp/outside', '../outside', 'dir/../outside', './g3.txt', 'dir//file', 'dir\\file', 'a\nfile']) {
    const changed = structuredClone(f.candidate); changed.checks.g3.artifact.path = path;
    assert.throws(() => validateCandidateEvidenceManifest(changed));
  }
});

test('artifact reader rejects symlink files, symlink directories, missing files, directories and oversized files', (t) => {
  const f = candidateFixture(t);
  const outside = mkdtempSync(resolve(tmpdir(), 'candidate-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(resolve(outside, 'g3.txt'), 'outside');
  symlinkSync(resolve(f.root, 'g3.txt'), resolve(f.root, 'link.txt'));
  symlinkSync(outside, resolve(f.root, 'linked-dir'));
  mkdirSync(resolve(f.root, 'directory'));
  writeFileSync(resolve(f.root, 'large.txt'), Buffer.alloc(16 * 1024 * 1024 + 1));
  writeFileSync(resolve(f.root, 'empty.txt'), '');
  for (const path of ['link.txt', 'linked-dir/g3.txt', 'missing.txt', 'directory', 'large.txt', 'empty.txt']) {
    const changed = structuredClone(f.candidate); changed.checks.g3.artifact.path = path;
    assert.throws(() => verifyCandidateEvidence({ ...f.args, evidence: changed, expectedEvidenceSha256: candidateEvidenceSha256(changed) }), path);
  }
});
