import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateGceReleaseManifest, gceManifestSha256, verifyGceCandidate, verifyGceRuntime } from '../gce-release-identity.mjs';
import { validateReleaseManifest } from '../release-identity.mjs';
const hash = 'a'.repeat(64);
const identity = { sourceCommit: 'b'.repeat(40), sourceTree: 'c'.repeat(40), release: 'r27-test', buildTime: '2026-09-10T12:00:00Z' };
const node = { project: 'synthetic-project', zone: 'us-west1-b', instanceId: '123456789' };
const target = { environment: 'production', url: 'https://timeline.all-too-well.com', node, database: 'feishu_timeline_r27' };
const image = name => ({ imageId: `sha256:${hash}`, repositoryDigest: `registry.example.test/timeline/${name === 'apiOps' ? 'api-ops' : name}@sha256:${hash}` });
const bytes = Buffer.from('Synthetic reviewed build evidence.');
const reference = { path: 'evidence.txt', sha256: createHash('sha256').update(bytes).digest('hex') };
function manifest() {
  const component = name => ({ kind: 'host-package', packageName: name === 'postgres' ? 'postgresql-14' : 'nginx-core', packageVersion: '1.0-1ubuntu1', architecture: 'amd64', runtimeVersion: name === 'postgres' ? '14.24' : '1.18.0', binarySha256: hash, configSha256: hash, buildEvidence: reference });
  return {
    schemaVersion: 2, topology: 'gce-host-pg-nginx-external-clamav', identity, target,
    images: Object.fromEntries(['api', 'apiOps', 'web', 'redis'].map(name => [name, image(name)])),
    hostComponents: { postgres: component('postgres'), nginx: component('nginx') },
    externalServices: { clamav: {
      kind: 'external-container-service', node: { ...node, instanceId: '987654321' }, platform: 'linux/amd64', image: image('clamav'),
      source: { upstreamVersion: '1.4.6', sourceSha256: hash, patchSha256: hash },
      configuration: { clamdSha256: hash, freshclamSha256: hash, seccompSha256: hash },
      channel: { kind: 'ssh-local-forward', serverFingerprint: `SHA256:${'A'.repeat(43)}`, clientFingerprint: `SHA256:${'B'.repeat(43)}`, permitOpen: '127.0.0.1:3310', permitListen: 'none', passwordAuthentication: false, maxSessions: 0, restrictionsEvidence: reference },
      signaturePolicy: { officialOnly: true, testDatabases: true, maxAgeHours: 24 }, buildEvidence: reference,
    } },
  };
}
function options(evidenceRoot) {
  const m = validateGceReleaseManifest(manifest());
  const inspect = im => [{ Id: im.imageId, RepoDigests: [im.repositoryDigest], Os: 'linux', Architecture: 'amd64', Config: { Labels: { 'org.opencontainers.image.revision': identity.sourceCommit, 'org.opencontainers.image.version': identity.release, 'org.opencontainers.image.created': identity.buildTime, 'com.feishu-timeline.source-tree': identity.sourceTree } } }];
  const container = im => [{ Image: im.imageId, Config: { Image: im.repositoryDigest }, State: { Running: true } }];
  const host = value => ({ active: true, packageName: value.packageName, packageVersion: value.packageVersion, architecture: value.architecture, runtimeVersion: value.runtimeVersion, packageBinarySha256: value.binarySha256, runningBinarySha256: value.binarySha256, configSha256: value.configSha256 });
  const scanner = m.externalServices.clamav;
  return {
    manifest: m, expectedManifestSha256: gceManifestSha256(m), expectedIdentity: identity, expectedTarget: target, evidenceRoot,
    imageInspects: Object.fromEntries(Object.entries(m.images).map(([name, im]) => [name, inspect(im)])), scannerImageInspect: inspect(scanner.image),
    observedAfter: '2026-09-10T12:00:00Z', now: '2026-09-10T12:02:00Z',
    observation: { observedAt: '2026-09-10T12:01:00Z', target, serverHead: identity.sourceCommit, apiDatabase: target.database,
      apiResponse: { ...identity, runtimeCommit: identity.sourceCommit, status: 'ok' }, webResponse: { ...identity, runtimeCommit: identity.sourceCommit },
      containerInspects: Object.fromEntries(['api', 'web', 'redis'].map(name => [name, container(m.images[name])])),
      hostComponents: Object.fromEntries(Object.entries(m.hostComponents).map(([name, value]) => [name, host(value)])),
      scanner: { node: scanner.node, containerInspect: container(scanner.image), source: scanner.source, configuration: scanner.configuration, channel: scanner.channel, signatures: { official: true, tested: true, loaded: true, updatedAt: '2026-09-10T11:00:00Z' }, scanProbePassed: true },
      migration: { database: target.database, pending: 0, failed: 0 }, nginxUpstream: { web: '127.0.0.1:3000', api: '127.0.0.1:3001' },
    },
  };
}
function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'gce-identity-'));
  try { writeFileSync(join(root, 'evidence.txt'), bytes); fn(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
test('explicit hybrid candidate and separately observed runtime verify', () => fixture(root => {
  const o = options(root); assert.equal(verifyGceCandidate(o).schemaVersion, 2); assert.equal(verifyGceRuntime(o).schemaVersion, 2);
  assert.throws(() => validateReleaseManifest(o.manifest));
  delete o.observation; assert.throws(() => verifyGceRuntime(o));
}));
const manifestMutations = {
  'unknown topology': m => { m.topology = 'anything'; },
  'missing Redis': m => { delete m.images.redis; },
  'host masquerades as image': m => { m.images.postgres = image('postgres'); },
  'missing host': m => { delete m.hostComponents.nginx; },
  'host kind': m => { m.hostComponents.postgres.kind = 'container'; },
  'wrong URL': m => { m.target.url = 'https://other.example.test'; },
  'same scanner node': m => { m.externalServices.clamav.node = m.target.node; },
  'plaintext channel': m => { m.externalServices.clamav.channel.kind = 'tcp'; },
  'password channel': m => { m.externalServices.clamav.channel.passwordAuthentication = true; },
  'broad forwarding': m => { m.externalServices.clamav.channel.permitOpen = '*:*'; },
  'interactive channel': m => { m.externalServices.clamav.channel.maxSessions = 1; },
  'unvalidated signatures': m => { m.externalServices.clamav.signaturePolicy.testDatabases = false; },
  'unbounded signature age': m => { m.externalServices.clamav.signaturePolicy.maxAgeHours = 9999; },
  'artifact traversal': m => { m.hostComponents.nginx.buildEvidence.path = '../outside'; },
};
for (const [name, mutate] of Object.entries(manifestMutations)) test(`reject ${name}`, () => { const m = structuredClone(manifest()); validateGceReleaseManifest(m); mutate(m); assert.throws(() => validateGceReleaseManifest(m)); });
const runtimeMutations = {
  'wrong API database': o => { o.observation.apiDatabase = 'feishu_timeline'; },
  'wrong migration database': o => { o.observation.migration.database = 'feishu_timeline'; },
  'wrong server HEAD': o => { o.observation.serverHead = 'd'.repeat(40); },
  'wrong API runtime': o => { o.observation.apiResponse.runtimeCommit = 'd'.repeat(40); },
  'old observation': o => { o.observation.observedAt = '2026-09-10T11:59:59Z'; },
  'future observation': o => { o.observation.observedAt = '2026-09-10T12:03:00Z'; },
  'stale observation': o => { o.now = '2026-09-10T13:00:00Z'; },
  'stopped API': o => { o.observation.containerInspects.api[0].State.Running = false; },
  'stale running host binary': o => { o.observation.hostComponents.nginx.runningBinarySha256 = 'd'.repeat(64); },
  'wrong host config': o => { o.observation.hostComponents.postgres.configSha256 = 'd'.repeat(64); },
  'inactive host service': o => { o.observation.hostComponents.postgres.active = false; },
  'scanner wrong image': o => { o.observation.scanner.containerInspect[0].Image = `sha256:${'d'.repeat(64)}`; },
  'scanner stopped': o => { o.observation.scanner.containerInspect[0].State.Running = false; },
  'scanner outdated signatures': o => { o.observation.scanner.signatures.updatedAt = '2026-09-01T12:00:00Z'; },
  'scanner failed real probe': o => { o.observation.scanner.scanProbePassed = false; },
  'pending migration': o => { o.observation.migration.pending = 1; },
  'wrong upstream': o => { o.observation.nginxUpstream.api = '127.0.0.1:3999'; },
};
for (const [name, mutate] of Object.entries(runtimeMutations)) test(`reject ${name}`, () => fixture(root => { const o = structuredClone(options(root)); verifyGceRuntime(o); mutate(o); assert.throws(() => verifyGceRuntime(o)); }));
for (const name of ['api', 'apiOps', 'web', 'redis']) test(`reject ${name} wrong platform, digest, and image ID`, () => fixture(root => {
  for (const change of [im => { im.Architecture = 'arm64'; }, im => { im.RepoDigests = []; }, im => { im.Id = `sha256:${'d'.repeat(64)}`; }]) {
    const o = options(root); verifyGceCandidate(o); change(o.imageInspects[name][0]); assert.throws(() => verifyGceCandidate(o));
  }
}));
test('externally approved digest protects every dependency field', () => fixture(root => {
  for (const mutate of [m => { m.hostComponents.nginx.configSha256 = 'd'.repeat(64); }, m => { m.externalServices.clamav.source.patchSha256 = 'd'.repeat(64); }, m => { m.externalServices.clamav.channel.serverFingerprint = `SHA256:${'D'.repeat(43)}`; }]) {
    const o = structuredClone(options(root)); verifyGceCandidate(o); mutate(o.manifest); assert.throws(() => verifyGceCandidate(o), /externally approved manifest/);
  }
}));
test('reject missing, changed, or linked evidence', () => fixture(root => {
  const o = options(root); verifyGceCandidate(o); writeFileSync(join(root, 'evidence.txt'), 'tampered'); assert.throws(() => verifyGceCandidate(o));
  rmSync(join(root, 'evidence.txt')); assert.throws(() => verifyGceCandidate(o));
  writeFileSync(join(root, 'other.txt'), bytes); symlinkSync(join(root, 'other.txt'), join(root, 'evidence.txt')); assert.throws(() => verifyGceCandidate(o), /symlink/);
}));

test('semantic JSON key order does not alter runtime result', () => fixture(root => {
  const o = options(root);
  for (const key of ['source', 'configuration', 'channel']) o.observation.scanner[key] = Object.fromEntries(Object.entries(o.observation.scanner[key]).reverse());
  o.observation.nginxUpstream = Object.fromEntries(Object.entries(o.observation.nginxUpstream).reverse());
  assert.equal(verifyGceRuntime(o).schemaVersion, 2);
}));
