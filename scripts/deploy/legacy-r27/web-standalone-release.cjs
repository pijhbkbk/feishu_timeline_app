#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CONTRACT_VALUES = Object.freeze({
  NODE_ENV: 'production',
  NEXT_PUBLIC_API_BASE_URL: '/api',
  NEXT_PUBLIC_ENABLE_MOCK_LOGIN: 'false',
  NEXT_PUBLIC_R26_V2_DATA_MODE: 'read-only-real',
  NEXT_PUBLIC_R26_V2_PROTOTYPE: 'false',
  NEXT_PUBLIC_UI_DATA_MODE: 'real',
  NEXT_PUBLIC_UI_VERSION: 'v2',
  V1_FALLBACK_ENABLED: 'false',
});

const IDENTITY_KEYS = Object.freeze([
  ...Object.keys(CONTRACT_VALUES),
  'RUNTIME_COMMIT',
  'BUILD_TIME',
  'RELEASE',
]);

const CONTRACT_DESCRIPTOR = Object.freeze({
  schemaVersion: 1,
  productGeneration: 'v2',
  dataAuthority: 'read-only-real',
  fixedValues: CONTRACT_VALUES,
  runtimeCommit: 'full lowercase 40-hex Git commit, excluding the all-zero sentinel',
  buildTime: 'UTC RFC 3339 timestamp',
  release: 'explicit non-development identifier matching ^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$ and containing the runtime commit short SHA',
  buildRuntimeEquality: IDENTITY_KEYS,
});

const RUNTIME_GUARD_FILE = 'standalone-release.cjs';
const RELEASE_PROFILE_FILE = 'release-profile.json';
const ARTIFACT_MANIFEST_FILE = 'standalone-artifact-manifest.json';
const SERVER_FILE = 'server.js';
const SERVER_GUARD_PREFIX = `require('./${RUNTIME_GUARD_FILE}').assertPackagedRuntime(__dirname);\n`;
const FULL_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const FORBIDDEN_RELEASES = new Set(['development', 'unknown', 'latest', 'local']);
const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', '0.0.0.0', '::1', '::']);
const MANIFEST_PATHS = Object.freeze({
  requiredServerFiles: '.next/required-server-files.json',
  serverEntrypoint: SERVER_FILE,
  runtimeGuardFile: RUNTIME_GUARD_FILE,
  publicRoot: 'public',
  nextStaticRoot: '.next/static',
  serverChunksRoot: '.next/server/chunks',
});

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }

  return value;
}

function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function isRegularFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const stats = fs.lstatSync(filePath);
  return !stats.isSymbolicLink() && stats.isFile();
}

const CONTRACT_SHA256 = sha256(canonicalJson(CONTRACT_DESCRIPTOR));

function fail(message) {
  throw new Error(`[web-release] ${message}`);
}

function readRequiredValue(env, name) {
  const raw = env[name];
  if (typeof raw !== 'string' || raw.length === 0) {
    fail(`${name} is required.`);
  }

  if (raw !== raw.trim()) {
    fail(`${name} must not contain leading or trailing whitespace.`);
  }

  return raw;
}

function assertCanonicalUtcTimestamp(value, context) {
  if (!UTC_TIMESTAMP_PATTERN.test(value) || value.startsWith('0000-')) {
    fail(`${context}: BUILD_TIME must be a valid UTC RFC 3339 timestamp.`);
  }

  const canonicalValue = value.includes('.')
    ? value.replace(/(\.\d{1,3})Z$/, (fraction) => `${fraction.padEnd(4, '0')}Z`)
    : value.replace(/Z$/, '.000Z');
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== canonicalValue) {
    fail(`${context}: BUILD_TIME must be a valid UTC RFC 3339 timestamp.`);
  }
}

function assertReleaseProfile(env = process.env, context = 'production release') {
  const profile = {};

  for (const [name, expected] of Object.entries(CONTRACT_VALUES)) {
    const value = readRequiredValue(env, name);
    if (value !== expected) {
      fail(`${context}: ${name} must equal ${JSON.stringify(expected)}.`);
    }
    profile[name] = value;
  }

  const runtimeCommit = readRequiredValue(env, 'RUNTIME_COMMIT');
  if (!FULL_COMMIT_PATTERN.test(runtimeCommit) || /^0{40}$/.test(runtimeCommit)) {
    fail(`${context}: RUNTIME_COMMIT must be a nonzero full lowercase 40-hex Git commit.`);
  }
  profile.RUNTIME_COMMIT = runtimeCommit;

  const buildTime = readRequiredValue(env, 'BUILD_TIME');
  assertCanonicalUtcTimestamp(buildTime, context);
  profile.BUILD_TIME = buildTime;

  const release = readRequiredValue(env, 'RELEASE');
  if (
    !RELEASE_PATTERN.test(release) ||
    FORBIDDEN_RELEASES.has(release.toLowerCase()) ||
    !release.toLowerCase().includes(runtimeCommit.slice(0, 12))
  ) {
    fail(`${context}: RELEASE must be an explicit identifier bound to RUNTIME_COMMIT.`);
  }
  profile.RELEASE = release;

  return stableValue(profile);
}

function assertRuntimeBinding(env = process.env) {
  const hostname = readRequiredValue(env, 'HOSTNAME');
  if (!ALLOWED_HOSTNAMES.has(hostname)) {
    fail('HOSTNAME must be an explicit loopback or container bind address.');
  }

  const portText = readRequiredValue(env, 'PORT');
  if (!/^[1-9]\d{0,4}$/.test(portText)) {
    fail('PORT must be an integer from 1 through 65535.');
  }
  const port = Number(portText);
  if (port > 65535) {
    fail('PORT must be an integer from 1 through 65535.');
  }

  return { hostname, port };
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} is missing.`);
  }
  if (!isRegularFile(filePath)) {
    fail(`${label} must be a regular file.`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    fail(`${label} is not valid JSON.`);
  }
}

function writeJson(filePath, value) {
  if (fs.existsSync(filePath) && !isRegularFile(filePath)) {
    fail(`Refusing to replace a non-regular JSON target: ${filePath}`);
  }
  fs.writeFileSync(filePath, `${JSON.stringify(stableValue(value), null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o644,
  });
}

function listFiles(rootPath) {
  if (!fs.existsSync(rootPath)) {
    fail(`Required directory is missing: ${rootPath}`);
  }
  const rootStats = fs.lstatSync(rootPath);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    fail(`Required directory must not be a symbolic link: ${rootPath}`);
  }

  const files = [];

  function walk(directory, relativeDirectory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.posix.join(
        relativeDirectory.split(path.sep).join(path.posix.sep),
        entry.name,
      );

      if (entry.isSymbolicLink()) {
        fail(`Symlinks are not allowed in packaged asset manifests: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        walk(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile()) {
        fail(`Unsupported packaged asset type: ${relativePath}`);
      }

      const stats = fs.statSync(absolutePath);
      files.push({
        path: relativePath,
        bytes: stats.size,
        sha256: sha256File(absolutePath),
      });
    }
  }

  walk(rootPath, '');
  return files;
}

function copyVerifiedTree(sourcePath, destinationPath, label) {
  const sourceManifest = listFiles(sourcePath);
  if (sourceManifest.length === 0) {
    fail(`${label} must contain at least one file.`);
  }

  fs.rmSync(destinationPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.cpSync(sourcePath, destinationPath, { recursive: true, force: true });

  const destinationManifest = listFiles(destinationPath);
  if (canonicalJson(sourceManifest) !== canonicalJson(destinationManifest)) {
    fail(`${label} did not copy byte-for-byte into the standalone tree.`);
  }

  return destinationManifest;
}

function resolveCliPath(value, label) {
  if (!value) {
    fail(`${label} is required.`);
  }
  return path.resolve(process.cwd(), value);
}

function assertExactCliPath(value, expectedPath, label) {
  const resolvedPath = resolveCliPath(value, label);
  if (resolvedPath !== expectedPath) {
    fail(`${label} must resolve to ${expectedPath}.`);
  }
  return resolvedPath;
}

function assertDirectoryPathWithoutSymlinks(rootPath, targetPath, label) {
  if (!fs.existsSync(rootPath)) {
    fail(`${label} root is missing.`);
  }
  const rootStats = fs.lstatSync(rootPath);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    fail(`${label} root must be a regular directory.`);
  }

  const relativePath = path.relative(rootPath, targetPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    fail(`${label} must remain inside ${rootPath}.`);
  }

  let currentPath = rootPath;
  const segments = relativePath === '' ? [] : relativePath.split(path.sep);
  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    if (!fs.existsSync(currentPath)) {
      break;
    }
    const stats = fs.lstatSync(currentPath);
    if (stats.isSymbolicLink()) {
      fail(`${label} must not contain a symbolic-link path component.`);
    }
  }

  if (!fs.existsSync(targetPath)) {
    fail(`${label} is missing.`);
  }
  const targetStats = fs.lstatSync(targetPath);
  if (targetStats.isSymbolicLink() || !targetStats.isDirectory()) {
    fail(`${label} must be a regular directory.`);
  }

  const canonicalRootPath = fs.realpathSync(rootPath);
  const canonicalTargetPath = fs.realpathSync(targetPath);
  const canonicalRelativePath = path.relative(canonicalRootPath, canonicalTargetPath);
  if (canonicalRelativePath.startsWith('..') || path.isAbsolute(canonicalRelativePath)) {
    fail(`${label} resolves outside ${rootPath}.`);
  }
}

function expectedRepositoryPaths() {
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const sourceApp = path.join(repositoryRoot, 'apps', 'web');
  return {
    sourceApp,
    standaloneApp: path.join(sourceApp, '.next', 'standalone', 'apps', 'web'),
  };
}

function expectedVerifyAppPath() {
  const repositoryPaths = expectedRepositoryPaths();
  const repositoryScriptPath = path.join(
    path.dirname(repositoryPaths.sourceApp),
    '..',
    'scripts',
    'deploy',
    path.basename(__filename),
  );
  return path.resolve(__filename) === path.resolve(repositoryScriptPath)
    ? repositoryPaths.standaloneApp
    : path.resolve(__dirname);
}

function stripServerGuard(serverSource) {
  return serverSource.startsWith(SERVER_GUARD_PREFIX)
    ? serverSource.slice(SERVER_GUARD_PREFIX.length)
    : serverSource;
}

function buildReleaseProfile(profile) {
  const profileSha256 = sha256(canonicalJson(profile));
  return {
    schemaVersion: 1,
    contract: CONTRACT_DESCRIPTOR,
    contractSha256: CONTRACT_SHA256,
    profile,
    profileSha256,
  };
}

function packageStandalone({ sourceApp, standaloneApp }, env = process.env) {
  const profile = assertReleaseProfile(env, 'standalone package');
  const expectedPaths = expectedRepositoryPaths();
  const sourceAppPath = assertExactCliPath(sourceApp, expectedPaths.sourceApp, '--source-app');
  const standaloneAppPath = assertExactCliPath(
    standaloneApp,
    expectedPaths.standaloneApp,
    '--standalone-app',
  );
  assertDirectoryPathWithoutSymlinks(sourceAppPath, standaloneAppPath, 'standalone app');
  const serverPath = path.join(standaloneAppPath, SERVER_FILE);
  const buildIdPath = path.join(sourceAppPath, '.next', 'BUILD_ID');
  const requiredServerFilesPath = path.join(
    standaloneAppPath,
    '.next',
    'required-server-files.json',
  );

  if (!isRegularFile(serverPath)) {
    fail(`Generated standalone server entrypoint is missing: ${serverPath}`);
  }
  if (
    !isRegularFile(buildIdPath) ||
    fs.readFileSync(buildIdPath, 'utf8').trim() !== profile.RUNTIME_COMMIT
  ) {
    fail('Next BUILD_ID must equal RUNTIME_COMMIT.');
  }
  readJson(requiredServerFilesPath, 'Next required-server-files manifest');

  const originalServerSource = stripServerGuard(fs.readFileSync(serverPath, 'utf8'));
  if (!originalServerSource.includes("require('next')")) {
    fail('Generated standalone server entrypoint does not contain the expected Next runtime.');
  }

  const publicAssets = copyVerifiedTree(
    path.join(sourceAppPath, 'public'),
    path.join(standaloneAppPath, 'public'),
    'public assets',
  );
  const nextStaticAssets = copyVerifiedTree(
    path.join(sourceAppPath, '.next', 'static'),
    path.join(standaloneAppPath, '.next', 'static'),
    'Next static assets',
  );
  const serverChunks = listFiles(path.join(standaloneAppPath, '.next', 'server', 'chunks'));
  if (serverChunks.length === 0) {
    fail('Standalone server chunks are missing.');
  }

  const releaseProfile = buildReleaseProfile(profile);
  writeJson(path.join(standaloneAppPath, RELEASE_PROFILE_FILE), releaseProfile);

  const runtimeGuardPath = path.join(standaloneAppPath, RUNTIME_GUARD_FILE);
  if (fs.existsSync(runtimeGuardPath) && !isRegularFile(runtimeGuardPath)) {
    fail('Refusing to replace a non-regular standalone runtime guard target.');
  }
  fs.copyFileSync(__filename, runtimeGuardPath);
  fs.chmodSync(runtimeGuardPath, 0o755);

  const artifactManifest = {
    schemaVersion: 1,
    contractSha256: CONTRACT_SHA256,
    profileSha256: releaseProfile.profileSha256,
    buildId: profile.RUNTIME_COMMIT,
    requiredServerFiles: MANIFEST_PATHS.requiredServerFiles,
    requiredServerFilesSha256: sha256File(requiredServerFilesPath),
    serverEntrypoint: MANIFEST_PATHS.serverEntrypoint,
    generatedServerBodySha256: sha256(originalServerSource),
    runtimeGuardFile: MANIFEST_PATHS.runtimeGuardFile,
    runtimeGuardSha256: sha256File(runtimeGuardPath),
    publicRoot: MANIFEST_PATHS.publicRoot,
    publicAssets,
    nextStaticRoot: MANIFEST_PATHS.nextStaticRoot,
    nextStaticAssets,
    serverChunksRoot: MANIFEST_PATHS.serverChunksRoot,
    serverChunks,
  };
  writeJson(path.join(standaloneAppPath, ARTIFACT_MANIFEST_FILE), artifactManifest);

  fs.writeFileSync(serverPath, `${SERVER_GUARD_PREFIX}${originalServerSource}`, {
    encoding: 'utf8',
    mode: 0o644,
  });

  assertPackagedArtifact(standaloneAppPath, env, false);

  return {
    contractSha256: CONTRACT_SHA256,
    profileSha256: releaseProfile.profileSha256,
    serverEntrypoint: path.posix.join('apps/web/.next/standalone/apps/web', SERVER_FILE),
    publicAssetCount: publicAssets.length,
    nextStaticAssetCount: nextStaticAssets.length,
    serverChunkCount: serverChunks.length,
  };
}

function assertManifestFiles(appPath, root, expectedFiles, label) {
  if (!Array.isArray(expectedFiles) || expectedFiles.length === 0) {
    fail(`${label} manifest is empty.`);
  }
  const actualFiles = listFiles(path.join(appPath, root));
  if (canonicalJson(actualFiles) !== canonicalJson(expectedFiles)) {
    fail(`${label} do not match the packaged manifest.`);
  }
}

function assertPackagedArtifact(appPath, env = process.env, requireRuntimeBinding = true) {
  const profile = assertReleaseProfile(env, 'standalone runtime');
  if (requireRuntimeBinding) {
    assertRuntimeBinding(env);
  }

  const releaseProfile = readJson(
    path.join(appPath, RELEASE_PROFILE_FILE),
    'standalone release profile',
  );
  const artifactManifest = readJson(
    path.join(appPath, ARTIFACT_MANIFEST_FILE),
    'standalone artifact manifest',
  );

  if (releaseProfile.schemaVersion !== 1 || artifactManifest.schemaVersion !== 1) {
    fail('Standalone release manifests use an unsupported schema version.');
  }
  if (
    releaseProfile.contractSha256 !== CONTRACT_SHA256 ||
    artifactManifest.contractSha256 !== CONTRACT_SHA256
  ) {
    fail('Standalone release contract does not match the runtime guard.');
  }

  for (const [name, expectedPath] of Object.entries(MANIFEST_PATHS)) {
    if (artifactManifest[name] !== expectedPath) {
      fail(`Standalone artifact manifest ${name} path is invalid.`);
    }
  }

  const profileSha256 = sha256(canonicalJson(profile));
  if (
    releaseProfile.profileSha256 !== profileSha256 ||
    artifactManifest.profileSha256 !== profileSha256 ||
    canonicalJson(releaseProfile.profile) !== canonicalJson(profile)
  ) {
    fail('Build-time and runtime release identities do not match.');
  }

  const buildIdPath = path.join(appPath, '.next', 'BUILD_ID');
  if (
    !isRegularFile(buildIdPath) ||
    fs.readFileSync(buildIdPath, 'utf8').trim() !== profile.RUNTIME_COMMIT ||
    artifactManifest.buildId !== profile.RUNTIME_COMMIT
  ) {
    fail('Next BUILD_ID does not match the release runtime commit.');
  }

  const requiredServerFilesPath = path.join(
    appPath,
    MANIFEST_PATHS.requiredServerFiles,
  );
  if (
    !isRegularFile(requiredServerFilesPath) ||
    sha256File(requiredServerFilesPath) !== artifactManifest.requiredServerFilesSha256
  ) {
    fail('Next required-server-files manifest does not match the packaged artifact.');
  }

  const runtimeGuardPath = path.join(appPath, MANIFEST_PATHS.runtimeGuardFile);
  if (
    !isRegularFile(runtimeGuardPath) ||
    sha256File(runtimeGuardPath) !== artifactManifest.runtimeGuardSha256
  ) {
    fail('Standalone runtime guard does not match the packaged manifest.');
  }

  const serverPath = path.join(appPath, MANIFEST_PATHS.serverEntrypoint);
  if (!isRegularFile(serverPath)) {
    fail('Standalone Node server entrypoint is missing.');
  }
  const serverSource = fs.readFileSync(serverPath, 'utf8');
  if (!serverSource.startsWith(SERVER_GUARD_PREFIX)) {
    fail('Standalone Node server entrypoint is missing the fail-closed runtime guard.');
  }
  if (sha256(stripServerGuard(serverSource)) !== artifactManifest.generatedServerBodySha256) {
    fail('Standalone Node server entrypoint does not match the generated build artifact.');
  }

  assertManifestFiles(
    appPath,
    MANIFEST_PATHS.publicRoot,
    artifactManifest.publicAssets,
    'Public assets',
  );
  assertManifestFiles(
    appPath,
    MANIFEST_PATHS.nextStaticRoot,
    artifactManifest.nextStaticAssets,
    'Next static assets',
  );
  assertManifestFiles(
    appPath,
    MANIFEST_PATHS.serverChunksRoot,
    artifactManifest.serverChunks,
    'Standalone server chunks',
  );

  return {
    contractSha256: CONTRACT_SHA256,
    profileSha256,
    runtimeCommit: profile.RUNTIME_COMMIT,
    buildTime: profile.BUILD_TIME,
    release: profile.RELEASE,
    publicAssetCount: artifactManifest.publicAssets.length,
    nextStaticAssetCount: artifactManifest.nextStaticAssets.length,
    serverChunkCount: artifactManifest.serverChunks.length,
  };
}

function assertPackagedRuntime(appDirectory) {
  const appPath = path.resolve(appDirectory);
  try {
    const summary = assertPackagedArtifact(appPath, process.env, true);
    process.stdout.write(
      `[web-release] verified standalone runtime ${summary.runtimeCommit} ${summary.release}\n`,
    );
    return summary;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name || !name.startsWith('--') || value === undefined || value.startsWith('--')) {
      fail('CLI options must use --name value pairs.');
    }
    options[name.slice(2)] = value;
  }
  return options;
}

function main(argv) {
  const [command, ...optionArgs] = argv;
  const options = parseOptions(optionArgs);

  if (command === 'contract') {
    process.stdout.write(
      `${JSON.stringify({ contract: CONTRACT_DESCRIPTOR, contractSha256: CONTRACT_SHA256 }, null, 2)}\n`,
    );
    return;
  }

  if (command === 'validate') {
    const profile = assertReleaseProfile(process.env, 'release profile validation');
    process.stdout.write(
      `${JSON.stringify({ contractSha256: CONTRACT_SHA256, profile, profileSha256: sha256(canonicalJson(profile)) }, null, 2)}\n`,
    );
    return;
  }

  if (command === 'package') {
    const summary = packageStandalone(
      { sourceApp: options['source-app'], standaloneApp: options['standalone-app'] },
      process.env,
    );
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  if (command === 'verify') {
    const appPath = assertExactCliPath(
      options['app-dir'],
      expectedVerifyAppPath(),
      '--app-dir',
    );
    process.stdout.write(`${JSON.stringify(assertPackagedArtifact(appPath), null, 2)}\n`);
    return;
  }

  fail('Expected one of: contract, validate, package, verify.');
}

module.exports = {
  CONTRACT_DESCRIPTOR,
  CONTRACT_SHA256,
  assertPackagedRuntime,
  assertReleaseProfile,
  packageStandalone,
};

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
