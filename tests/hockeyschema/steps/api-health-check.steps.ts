import { expect, request } from '@playwright/test';
import { When, Then } from './bdd';

// The public `teams` collection on Firebase's Firestore REST API - see
// firestore.rules (`allow read: if true`). config.apiBaseUrl points at
// `.../databases/(default)/documents` for the current environment's
// Firebase project (see config/project.config.ts).
When('the user calls GET on the teams collection', async ({ config, world }) => {
  const context = await request.newContext({ baseURL: config.apiBaseUrl });
  // No leading slash: baseURL has no trailing slash either, and a leading
  // slash here would resolve against the origin (WHATWG URL rules),
  // discarding the /v1/projects/.../documents path instead of appending to it.
  world.apiResponse = await context.get('teams');
});

Then('the response status is {int}', async ({ world }, expected: number) => {
  expect(world.apiResponse.status()).toBe(expected);
});

Then('the response is valid JSON', async ({ world }) => {
  const body = await world.apiResponse.json();
  expect(body).toEqual(expect.any(Object));
});
