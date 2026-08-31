import { Page } from '@playwright/test';

export class HomePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/');
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }
}
