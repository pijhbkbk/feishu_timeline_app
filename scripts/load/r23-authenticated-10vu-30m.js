import {
  buildOptions,
  buildSummary,
  runProfileIteration,
  setupAuthenticatedScenario,
} from './r23-auth-common.js';

export const options = buildOptions({ vus: 10, duration: __ENV.K6_DURATION || '30m' });

export function setup() {
  return setupAuthenticatedScenario();
}

export default function concurrent(data) {
  runProfileIteration(data, '10vu-30m');
}

export function handleSummary(data) {
  return buildSummary(data);
}
