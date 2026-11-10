#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validateBuildIdentity } from './release-identity.mjs';
import { projectReport, readBounded } from '../security/ci-evidence.mjs';

const GiB = 1024 ** 3;
const IMAGES = [
  { name: 'api', tag: 'feishu-timeline-api:ci', report: 'image-sca/image-1' },
  { name: 'web', tag: 'feishu-timeline-web:ci', report: 'image-sca/image-2' },
  { name: 'api-ops', tag: 'feishu-timeline-api-ops:ci', report: 'ops-image-sca/image-1' },
];

function command(program, args, timeout = 15000) {
  const result = spawnSync(program, args, { encoding: 'utf8', timeout, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, `Delivery command failed: ${program}`);
  return result.stdout.trim();
}

function input(root, relative) {
  const result = readBounded(root, relative);
  assert(result, `Missing delivery input: ${relative}`);
  return result;
}

export function bindImage(image, report, identity) {
  validateBuildIdentity(identity);
  assert.match(image.Id, /^sha256:[a-f0-9]{64}$/);
  assert.equal(image.Os, 'linux');
  assert.equal(image.Architecture, 'amd64');
  assert(Number.isSafeInteger(image.Size) && image.Size > 0 && image.Size <= 2 * GiB);
  assert.equal(image.Config?.User, 'node');
  const labels = image.Config.Labels;
  assert.equal(labels?.['org.opencontainers.image.revision'], identity.sourceCommit);
  assert.equal(labels?.['com.feishu-timeline.source-tree'], identity.sourceTree);
  assert.equal(labels?.['org.opencontainers.image.version'], identity.release);
  assert.equal(labels?.['org.opencontainers.image.created'], identity.buildTime);
  assert.equal(report.SchemaVersion, 2);
  assert.equal(report.ArtifactType, 'container_image');
  assert.equal(report.Metadata?.ImageID, image.Id, 'Scanned image differs from export');
  const projected = projectReport('trivy', report);
  assert(projected.targetCount > 0, 'Empty image scan');
  assert.equal(projected.findings.length, 0);
  assert.equal(projected.toolErrors, 0);
  return { imageId: image.Id, platform: 'linux/amd64', imageBytes: image.Size, scan: projected };
}

async function fileDigest(filename) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

export async function exportImages(root, env = process.env) {
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(process.platform, 'linux');
  assert.equal(process.arch, 'x64');
  assert.equal(command('git', ['status', '--porcelain', '--untracked-files=no']), '');
  const metadata = JSON.parse(input(root, 'reports/ci-private/verify/metadata.json').data);
  const identity = validateBuildIdentity(metadata.identity);
  assert.equal(metadata.platformAllowed, true);
  assert.equal(metadata.sourceWorktreeClean, true);
  assert.equal(metadata.runId, env.GITHUB_RUN_ID);
  assert.equal(metadata.runAttempt, env.GITHUB_RUN_ATTEMPT);
  assert.equal(identity.sourceCommit, env.GITHUB_SHA);
  assert.equal(identity.sourceCommit, command('git', ['rev-parse', 'HEAD']));
  assert.equal(identity.sourceTree, command('git', ['rev-parse', 'HEAD^{tree}']));
  const lockfileSha256 = createHash('sha256').update(input(root, 'pnpm-lock.yaml').data).digest('hex');
  assert.equal(lockfileSha256, metadata.lockfileSha256);
  const candidates = IMAGES.map((entry) => {
    const raw = input(root, `reports/security/${entry.report}.json`);
    assert(Date.parse(raw.modifiedAt) >= Date.parse(metadata.observedAt), 'Stale image scan');
    assert.equal(input(root, `reports/security/${entry.report}.status`).data.toString(), 'PASS');
    const inspected = JSON.parse(command('docker', ['image', 'inspect', entry.tag]));
    assert.equal(inspected.length, 1);
    assert(inspected[0].RepoTags?.includes(entry.tag));
    return { ...entry, ...bindImage(inspected[0], JSON.parse(raw.data), identity),
      rawReportSha256: createHash('sha256').update(raw.data).digest('hex') };
  });
  const destination = path.join(root, 'reports/ci-delivery');
  // Exclusive directory creation refuses reuse or a pre-existing symlink.
  fs.mkdirSync(destination, { mode: 0o700 });
  const space = fs.statfsSync(destination);
  assert(space.bavail * space.bsize >= candidates.reduce((sum, item) => sum + item.imageBytes * 2, GiB),
    'Insufficient image export space');
  const images = [];
  for (const candidate of candidates) {
    const filename = `${candidate.name}.tar`;
    const target = path.join(destination, filename);
    command('docker', ['image', 'save', '--output', target, candidate.tag], 600000);
    const stat = fs.lstatSync(target);
    assert(stat.isFile() && stat.nlink === 1 && stat.size > 0 && stat.size <= 4 * GiB);
    fs.chmodSync(target, 0o600);
    assert.equal(JSON.parse(command('docker', ['image', 'inspect', candidate.tag]))[0].Id, candidate.imageId);
    images.push({ ...candidate, file: filename, archiveBytes: stat.size, archiveSha256: await fileDigest(target) });
  }
  const manifest = { version: 1, identity, lockfileSha256, runId: metadata.runId,
    runAttempt: metadata.runAttempt, images, deploymentAuthorizedByArtifact: false };
  fs.writeFileSync(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 });
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  exportImages(process.cwd()).then((result) => {
    console.log(JSON.stringify({ imageExport: 'PASS', sourceCommit: result.identity.sourceCommit,
      images: result.images.map(({ name, imageId, archiveSha256 }) => ({ name, imageId, archiveSha256 })) }));
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
