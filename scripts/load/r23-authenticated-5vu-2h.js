import {
  buildOptions,
  buildSummary,
  runProfileIteration,
  setupAuthenticatedScenario,
} from './r23-auth-common.js';

export const options = buildOptions({ vus: 5, duration: __ENV.K6_DURATION || '2h' });

export function setup() {
  return setupAuthenticatedScenario();
}

export default function endurance(data) {
  runProfileIteration(data, '5vu-2h');
}

export function handleSummary(data) {
  return buildSummary(data);
}
