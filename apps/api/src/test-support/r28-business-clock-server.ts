/** Isolated acceptance entry point, excluded from production builds. It only
 * replaces the calendar dependency; it starts the unchanged HTTP bootstrap. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { BusinessClock } from '../common/business-clock';

const database = new URL(process.env.DATABASE_URL!);
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.port, '55449');
assert.equal(database.pathname, '/r28_http_v2');
assert.equal(process.env.HOST, '127.0.0.1');
assert.equal(process.env.AUTH_MOCK_ENABLED, 'false');
assert.notEqual(process.env.NODE_ENV, 'production');
const filename = process.env.R28_BUSINESS_TIME_FILE!;
assert.ok(path.isAbsolute(filename));
assert.equal(path.basename(filename), 'business-time.json');
assert.equal(path.basename(path.dirname(filename)), 'r28-runtime');
assert.equal(statSync(filename).mode & 0o077, 0);
let previous = 0;
BusinessClock.prototype.now = function () {
  const fixture = JSON.parse(readFileSync(filename, 'utf8'));
  assert.equal(fixture.syntheticOnly, true);
  const now = new Date(fixture.businessNow);
  const value = now.getTime();
  assert.ok(value >= Date.parse('2026-09-28T00:00:00Z') && value <= Date.parse('2028-09-28T00:00:00Z'));
  assert.ok(value >= previous, 'Business time cannot move backwards within an acceptance process.');
  previous = value;
  return now;
};
void import('../main');
