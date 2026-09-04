// Cross-feature Background steps (login, switching to Wedstrijdmodus) shared
// by team.feature, wedstrijdschema.feature and live-wedstrijdmodus.feature -
// kept separate from homepage.steps.ts since these aren't homepage-specific
// actions, even though "the user opens the {string} tab" (also shared) lives
// there already.
import { Given, When } from './bdd';
import { HomePage } from '../pageobjects/home.page';

Given('the user is logged in as a team member', async ({ page, config, world }) => {
  const home = new HomePage(page);
  await home.open();
  await home.login(config.userEmail, config.userPassword);
  world.home = home;
});

When('the user switches to Wedstrijdmodus', async ({ world }) => {
  await (world.home as HomePage).switchToWedstrijdmodus();
});
