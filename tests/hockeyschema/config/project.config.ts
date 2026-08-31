export const projectConfig = {
  baseUrl: process.env.BASE_URL ?? 'https://playwright.dev',
  // Firestore REST API base for this environment's Firebase project (see
  // apps/hockeyschema/.firebaserc) - there is no separate custom backend.
  // Trailing slash matters: Playwright's request context resolves a
  // relative path (e.g. "teams") against baseURL using WHATWG URL rules,
  // which drops the base's last path segment unless it ends in "/".
  apiBaseUrl:
    process.env.API_BASE_URL ??
    'https://firestore.googleapis.com/v1/projects/hockeyschema-test/databases/(default)/documents/',
};
