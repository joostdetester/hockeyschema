import { expect } from '@playwright/test';
import { Given, Then } from './bdd';
import { HomePage } from '../pageobjects/home.page';

Given('the user opens the homepage', async ({ page, world }) => {
  const home = new HomePage(page);
  await home.open();
  world.home = home;
});

Then('the page title contains {string}', async ({ world }, expected: string) => {
  const title = await world.home.getTitle();
  expect(title).toContain(expected);
});
