import assert from 'node:assert/strict';
import test from 'node:test';
import { bindImage } from './export-ci-images.mjs';

const identity = { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), release: 'ci-123-1', buildTime: '2026-11-03T15:00:00Z' };
function fixture() {
  const image = { Id: `sha256:${'c'.repeat(64)}`, Os: 'linux', Architecture: 'amd64', Size: 100,
    Config: { User: 'node', Labels: { 'org.opencontainers.image.revision': identity.sourceCommit,
      'com.feishu-timeline.source-tree': identity.sourceTree, 'org.opencontainers.image.version': identity.release,
      'org.opencontainers.image.created': identity.buildTime } } };
  const report = { SchemaVersion: 2, ArtifactType: 'container_image', Metadata: { ImageID: image.Id },
    Results: [{ Target: 'Alpine', Vulnerabilities: [] }] };
  return { image, report };
}

test('binds a clean scanned image to the exact build identity', () => {
  const { image, report } = fixture();
  assert.equal(bindImage(image, report, identity).imageId, image.Id);
});

for (const [name, change] of [
  ['different scan image', ({ report }) => { report.Metadata.ImageID = `sha256:${'d'.repeat(64)}`; }],
  ['different source', ({ image }) => { image.Config.Labels['org.opencontainers.image.revision'] = 'd'.repeat(40); }],
  ['different tree', ({ image }) => { image.Config.Labels['com.feishu-timeline.source-tree'] = 'd'.repeat(40); }],
  ['different build time', ({ image }) => { image.Config.Labels['org.opencontainers.image.created'] = '2026-11-03T15:00:01Z'; }],
  ['different platform', ({ image }) => { image.Architecture = 'arm64'; }],
  ['root image', ({ image }) => { image.Config.User = 'root'; }],
  ['unbounded image size', ({ image }) => { image.Size = 10 * 1024 ** 3; }],
  ['missing results', ({ report }) => { delete report.Results; }],
  ['empty results', ({ report }) => { report.Results = []; }],
  ['vulnerability', ({ report }) => { report.Results[0].Vulnerabilities = [{ VulnerabilityID: 'CVE-2026-0001', Severity: 'LOW' }]; }],
]) {
  test(`rejects ${name}`, () => {
    const value = fixture();
    change(value);
    assert.throws(() => bindImage(value.image, value.report, identity));
  });
}
