import { Page } from '@playwright/test';

export class HomePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/');
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  // Tab nav buttons render their label as the accessible name directly
  // (see App.jsx's `tabs` array) - "Programma", "Wedstrijdschema", "Team",
  // "Strafcorner", "Historie", "Afspraken", "Teams".
  async openTab(label: string): Promise<void> {
    await this.page.getByRole('button', { name: label, exact: true }).click();
  }

  // Only rendered for a logged-out user, which is the state every
  // accessibility scenario runs in (see ai/accessibility-testing.md's
  // caution against a11y scans touching authenticated/stateful flows).
  async openLoginDialog(): Promise<void> {
    await this.page.getByRole('button', { name: 'Inloggen', exact: true }).click();
  }
}
