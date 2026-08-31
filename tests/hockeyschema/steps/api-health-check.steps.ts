import { expect, request } from '@playwright/test';
import { When, Then } from './bdd';

When('the user calls GET on the API root', async ({ config, world }) => {
  const context = await request.newContext({ baseURL: config.apiBaseUrl });
  world.apiResponse = await context.get('/');
});

Then('the response status is {int}', async ({ world }, expected: number) => {
  expect(world.apiResponse.status()).toBe(expected);
});
