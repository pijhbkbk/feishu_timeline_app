export function isLogoutLanding(search: string) {
  return new URLSearchParams(search).get('loggedOut') === '1';
}
