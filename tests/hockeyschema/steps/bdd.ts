import { createBdd } from 'playwright-bdd';
import { test } from './fixtures';

export const { Given, When, Then, Step, Before, After, BeforeAll, AfterAll } = createBdd(test);
