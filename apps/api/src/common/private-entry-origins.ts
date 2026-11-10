/** Explicit opt-in for the owner's two private browser entry points. */
export function resolveBrowserOrigins(frontendUrl: string, flag: string | undefined, deploymentEnvironment: string) {
  if (flag === undefined || flag === '') return [frontendUrl];
  if (flag !== '1' || frontendUrl !== 'https://localhost:18443' || deploymentEnvironment !== 'staging') {
    throw new Error('Private domain requires the exact approved localhost staging configuration.');
  }
  return ['https://localhost:18443', 'https://timeline.all-too-well.com'];
}
