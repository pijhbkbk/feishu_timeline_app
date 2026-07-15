import {
  buildOptions,
  buildSummary,
  runPreflightIteration,
  setupAuthenticatedScenario,
} from './r23-auth-common.js';

export const options = buildOptions({ vus: 1, duration: __ENV.K6_DURATION || '10m' });

export function setup() {
  return setupAuthenticatedScenario();
}

export default function preflight(data) {
  runPreflightIteration(data);
}

export function handleSummary(data) {
  return buildSummary(data);
}
