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

  // Logs in via the Login dialog (see Login.jsx) with the given account and
  // waits for "Uitloggen" to replace "Inloggen" in the header, which only
  // happens once Firebase Auth confirms the sign-in - a wrong password
  // leaves the dialog open with an error instead, surfacing as this wait
  // timing out rather than a false-positive pass.
  async login(email: string, password: string): Promise<void> {
    await this.openLoginDialog();
    await this.page.getByLabel('E-mailadres').fill(email);
    await this.page.getByLabel('Wachtwoord').fill(password);
    // Scoped to the form: the header's own "Inloggen" button is still present
    // (unchanged) behind the dialog while logged out, so an unscoped lookup
    // would match both it and the dialog's submit button.
    await this.page.locator('form').getByRole('button', { name: 'Inloggen', exact: true }).click();
    await this.page.getByRole('button', { name: 'Uitloggen', exact: true }).waitFor();
  }

  // "Wedstrijdmodus" is a header button, not a nav tab (see App.jsx) -
  // separate from openTab because it toggles a whole alternate compact view
  // rather than switching which tab's content is shown.
  async switchToWedstrijdmodus(): Promise<void> {
    await this.page.getByRole('button', { name: 'Wedstrijdmodus', exact: true }).click();
  }
}
