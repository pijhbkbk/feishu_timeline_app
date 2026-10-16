// Explicit GCE hybrid topology. Identity consistency never grants root authority.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  validateBuildIdentity, validateImageIdentity, validateArtifactReference,
  readBoundArtifact, verifyImageEvidence, buildIdentityFromResponse,
} from './release-identity.mjs';

const IMAGES = ['api', 'apiOps', 'web', 'redis'];
const HOSTS = ['postgres', 'nginx'];
const HASH = /^[a-f0-9]{64}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const FINGERPRINT = /^SHA256:[A-Za-z0-9+/]{43}$/;
const TOPOLOGY = 'gce-host-pg-nginx-external-clamav';
function check(value, reason) { if (!value) throw new Error(reason); }
function object(value, keys, context) {
  check(value && typeof value === 'object' && !Array.isArray(value), `${context}: object required`);
  check(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), `${context}: exact keys required`);
}
function text(value, pattern, context) {
  check(typeof value === 'string' && value.length <= 512 && pattern.test(value), `${context}: invalid value`);
  return value;
}
function digest(value, context) {
  text(value, HASH, context); check(!/^0{64}$/.test(value), `${context}: placeholder digest`); return value;
}
function same(actual, expected, context) {
  check(isDeepStrictEqual(actual, expected), `${context}: mismatch`);
}
function timestamp(value, context) {
  text(value, TIME, context);
  check(Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value.replace('Z', '.000Z'), `${context}: invalid timestamp`);
  return value;
}
function node(value) {
  object(value, ['project', 'zone', 'instanceId'], 'GCE node');
  return {
    project: text(value.project, /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, 'GCE project'),
    zone: text(value.zone, /^[a-z]+-[a-z]+[0-9]-[a-z]$/, 'GCE zone'),
    instanceId: text(value.instanceId, /^[1-9][0-9]{0,19}$/, 'GCE instance ID'),
  };
}
function target(value) {
  object(value, ['environment', 'url', 'node', 'database'], 'target');
  check(value.environment === 'production', 'production target required');
  check(value.url === 'https://timeline.all-too-well.com', 'exact production URL required');
  return { environment: 'production', url: value.url, node: node(value.node), database: text(value.database, /^feishu_timeline(?:_[a-z0-9_]{1,48})?$/, 'production database') };
}
function host(value, name) {
  object(value, ['kind', 'packageName', 'packageVersion', 'architecture', 'runtimeVersion', 'binarySha256', 'configSha256', 'buildEvidence'], name);
  check(value.kind === 'host-package' && value.architecture === 'amd64', `${name}: host amd64 package required`);
  check(name === 'postgres' ? value.packageName === 'postgresql-14' : ['nginx-core', 'nginx-full', 'nginx-light', 'nginx-extras'].includes(value.packageName), `${name}: unsupported package`);
  return {
    kind: value.kind, packageName: value.packageName,
    packageVersion: text(value.packageVersion, /^[0-9][A-Za-z0-9.+:~_-]{0,127}$/, `${name} package version`),
    architecture: value.architecture,
    runtimeVersion: text(value.runtimeVersion, name === 'postgres' ? /^14\.[0-9]+$/ : /^[0-9]+\.[0-9]+\.[0-9]+$/, `${name} runtime version`),
    binarySha256: digest(value.binarySha256, `${name} binary`),
    configSha256: digest(value.configSha256, `${name} config`),
    buildEvidence: validateArtifactReference(value.buildEvidence, `${name} build evidence`),
  };
}
function scanner(value, productionNode) {
  object(value, ['kind', 'node', 'platform', 'image', 'source', 'configuration', 'channel', 'signaturePolicy', 'buildEvidence'], 'scanner');
  check(value.kind === 'external-container-service' && value.platform === 'linux/amd64', 'external amd64 scanner required');
  const scannerNode = node(value.node);
  check(scannerNode.project === productionNode.project && scannerNode.zone === productionNode.zone && scannerNode.instanceId !== productionNode.instanceId, 'scanner must be a distinct node in the approved project and zone');
  object(value.source, ['upstreamVersion', 'sourceSha256', 'patchSha256'], 'scanner source');
  object(value.configuration, ['clamdSha256', 'freshclamSha256', 'seccompSha256'], 'scanner configuration');
  object(value.channel, ['kind', 'serverFingerprint', 'clientFingerprint', 'permitOpen', 'permitListen', 'passwordAuthentication', 'maxSessions', 'restrictionsEvidence'], 'scanner channel');
  check(value.channel.kind === 'ssh-local-forward' && value.channel.permitOpen === '127.0.0.1:3310' && value.channel.permitListen === 'none' && value.channel.passwordAuthentication === false && value.channel.maxSessions === 0, 'restricted authenticated scanner channel required');
  object(value.signaturePolicy, ['officialOnly', 'testDatabases', 'maxAgeHours'], 'signature policy');
  check(value.signaturePolicy.officialOnly === true && value.signaturePolicy.testDatabases === true && Number.isInteger(value.signaturePolicy.maxAgeHours) && value.signaturePolicy.maxAgeHours >= 1 && value.signaturePolicy.maxAgeHours <= 48, 'official validated bounded-age signatures required');
  return {
    kind: value.kind, node: scannerNode, platform: value.platform,
    image: validateImageIdentity(value.image, 'scanner image'),
    source: {
      upstreamVersion: text(value.source.upstreamVersion, /^[0-9]+\.[0-9]+\.[0-9]+$/, 'scanner version'),
      sourceSha256: digest(value.source.sourceSha256, 'scanner source'),
      patchSha256: digest(value.source.patchSha256, 'scanner patch'),
    },
    configuration: Object.fromEntries(['clamdSha256', 'freshclamSha256', 'seccompSha256'].map(key => [key, digest(value.configuration[key], key)])),
    channel: {
      kind: value.channel.kind,
      serverFingerprint: text(value.channel.serverFingerprint, FINGERPRINT, 'server fingerprint'),
      clientFingerprint: text(value.channel.clientFingerprint, FINGERPRINT, 'client fingerprint'),
      permitOpen: value.channel.permitOpen, permitListen: value.channel.permitListen,
      passwordAuthentication: false, maxSessions: 0,
      restrictionsEvidence: validateArtifactReference(value.channel.restrictionsEvidence, 'channel evidence'),
    },
    signaturePolicy: { officialOnly: true, testDatabases: true, maxAgeHours: value.signaturePolicy.maxAgeHours },
    buildEvidence: validateArtifactReference(value.buildEvidence, 'scanner build evidence'),
  };
}
export function validateGceReleaseManifest(value) {
  object(value, ['schemaVersion', 'topology', 'identity', 'target', 'images', 'hostComponents', 'externalServices'], 'GCE manifest');
  check(value.schemaVersion === 2 && value.topology === TOPOLOGY, 'explicit GCE manifest v2 required');
  const normalizedTarget = target(value.target);
  object(value.images, IMAGES, 'GCE images');
  object(value.hostComponents, HOSTS, 'host components');
  object(value.externalServices, ['clamav'], 'external services');
  return {
    schemaVersion: 2, topology: TOPOLOGY, identity: validateBuildIdentity(value.identity), target: normalizedTarget,
    images: Object.fromEntries(IMAGES.map(name => [name, validateImageIdentity(value.images[name], name)])),
    hostComponents: Object.fromEntries(HOSTS.map(name => [name, host(value.hostComponents[name], name)])),
    externalServices: { clamav: scanner(value.externalServices.clamav, normalizedTarget.node) },
  };
}
export function gceManifestSha256(value) {
  return createHash('sha256').update(JSON.stringify(validateGceReleaseManifest(value))).digest('hex');
}
export function verifyGceCandidate({ manifest, expectedManifestSha256, expectedIdentity, expectedTarget, evidenceRoot, imageInspects, scannerImageInspect }) {
  const approved = validateGceReleaseManifest(manifest);
  same(gceManifestSha256(approved), digest(expectedManifestSha256, 'external manifest approval'), 'externally approved manifest');
  same(approved.identity, validateBuildIdentity(expectedIdentity), 'expected identity');
  same(approved.target, target(expectedTarget), 'expected target');
  object(imageInspects, IMAGES, 'candidate image inspections');
  for (const name of IMAGES) {
    verifyImageEvidence({ name, approved: approved.images[name], repositoryDigest: approved.images[name].repositoryDigest, imageInspect: imageInspects[name], identity: approved.identity, verifyBuildLabels: name !== 'redis' });
    check(imageInspects[name][0].Os === 'linux' && imageInspects[name][0].Architecture === 'amd64', `${name}: platform mismatch`);
  }
  const clamav = approved.externalServices.clamav;
  verifyImageEvidence({ name: 'clamav', approved: clamav.image, repositoryDigest: clamav.image.repositoryDigest, imageInspect: scannerImageInspect, verifyBuildLabels: false });
  check(scannerImageInspect[0].Os === 'linux' && scannerImageInspect[0].Architecture === 'amd64', 'scanner platform mismatch');
  for (const reference of [...HOSTS.map(name => approved.hostComponents[name].buildEvidence), clamav.buildEvidence, clamav.channel.restrictionsEvidence]) readBoundArtifact(evidenceRoot, reference);
  return approved;
}
export function verifyGceRuntime(options) {
  const approved = verifyGceCandidate(options);
  const { observation, observedAfter, now } = options;
  object(observation, ['observedAt', 'target', 'serverHead', 'apiDatabase', 'apiResponse', 'webResponse', 'containerInspects', 'hostComponents', 'scanner', 'migration', 'nginxUpstream'], 'runtime observation');
  const at = Date.parse(timestamp(observation.observedAt, 'observation time'));
  check(at >= Date.parse(timestamp(observedAfter, 'deployment start')) && at <= Date.parse(timestamp(now, 'verification time')) && Date.parse(now) - at <= 300000, 'runtime observation must be fresh and post-deployment');
  same(target(observation.target), approved.target, 'observed target');
  same(observation.serverHead, approved.identity.sourceCommit, 'server HEAD');
  same(observation.apiDatabase, approved.target.database, 'API connected database');
  check(observation.apiResponse.status === 'ok', 'API must be healthy');
  same(buildIdentityFromResponse(observation.apiResponse, 'API'), approved.identity, 'API identity');
  same(buildIdentityFromResponse(observation.webResponse, 'Web'), approved.identity, 'Web identity');
  object(observation.containerInspects, ['api', 'web', 'redis'], 'running containers');
  for (const name of ['api', 'web', 'redis']) {
    const inspect = observation.containerInspects[name];
    verifyImageEvidence({ name, approved: approved.images[name], repositoryDigest: approved.images[name].repositoryDigest, imageInspect: options.imageInspects[name], containerInspect: inspect, identity: approved.identity, verifyBuildLabels: name !== 'redis' });
    check(inspect[0].State?.Running === true, `${name}: container is not running`);
  }
  object(observation.hostComponents, HOSTS, 'observed host components');
  for (const name of HOSTS) {
    const actual = observation.hostComponents[name]; const expected = approved.hostComponents[name];
    object(actual, ['active', 'packageName', 'packageVersion', 'architecture', 'runtimeVersion', 'packageBinarySha256', 'runningBinarySha256', 'configSha256'], `observed ${name}`);
    check(actual.active === true, `${name}: inactive`);
    for (const key of ['packageName', 'packageVersion', 'architecture', 'runtimeVersion', 'configSha256']) same(actual[key], expected[key], `${name} ${key}`);
    same(actual.packageBinarySha256, expected.binarySha256, `${name} package binary`);
    same(actual.runningBinarySha256, expected.binarySha256, `${name} running binary`);
  }
  const actual = observation.scanner; const expected = approved.externalServices.clamav;
  object(actual, ['node', 'containerInspect', 'source', 'configuration', 'channel', 'signatures', 'scanProbePassed'], 'observed scanner');
  same(node(actual.node), expected.node, 'scanner node');
  verifyImageEvidence({ name: 'clamav', approved: expected.image, repositoryDigest: expected.image.repositoryDigest, imageInspect: options.scannerImageInspect, containerInspect: actual.containerInspect, verifyBuildLabels: false });
  check(actual.containerInspect[0].State?.Running === true, 'scanner not running');
  const requireUniqueEnv = (inspect, key, expectedValue) => {
    const values = inspect[0].Config?.Env;
    check(Array.isArray(values), `${key}: missing runtime environment`);
    const matches = values.filter(value => typeof value === 'string' && value.startsWith(`${key}=`));
    check(matches.length === 1 && matches[0] === `${key}=${expectedValue}`, `${key}: runtime policy mismatch`);
  };
  requireUniqueEnv(actual.containerInspect, 'TZ', 'UTC');
  requireUniqueEnv(observation.containerInspects.api, 'CLAMAV_MAX_SIGNATURE_AGE_HOURS', String(expected.signaturePolicy.maxAgeHours));
  for (const key of ['source', 'configuration', 'channel']) same(actual[key], expected[key], `scanner ${key}`);
  object(actual.signatures, ['official', 'tested', 'loaded', 'updatedAt'], 'observed signatures');
  check(actual.signatures.official === true && actual.signatures.tested === true && actual.signatures.loaded === true && actual.scanProbePassed === true, 'scanner validation incomplete');
  const age = at - Date.parse(timestamp(actual.signatures.updatedAt, 'signature update'));
  check(age >= 0 && age <= expected.signaturePolicy.maxAgeHours * 3600000, 'signature database age exceeded');
  object(observation.migration, ['database', 'pending', 'failed'], 'migration');
  check(observation.migration.database === approved.target.database && observation.migration.pending === 0 && observation.migration.failed === 0, 'production migration incomplete');
  object(observation.nginxUpstream, ['web', 'api'], 'upstream');
  same(observation.nginxUpstream, { web: '127.0.0.1:3000', api: '127.0.0.1:3001' }, 'production upstream');
  return approved;
}
