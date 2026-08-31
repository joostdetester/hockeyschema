import { expect } from '@playwright/test';
import { Then } from './bdd';
import { scanAccessibility, WcagLevel } from '../pageobjects/_shared/accessibility';

const VALID_LEVELS: WcagLevel[] = ['A', 'AA', 'AAA'];

Then('the page meets WCAG level {word}', async ({ page, $testInfo }, level: string) => {
  if (!VALID_LEVELS.includes(level as WcagLevel)) {
    throw new Error(`Unknown WCAG level "${level}" - expected one of ${VALID_LEVELS.join(', ')}`);
  }
  const { failingViolations } = await scanAccessibility(page, $testInfo, level as WcagLevel);
  expect(failingViolations, JSON.stringify(failingViolations, null, 2)).toHaveLength(0);
});
