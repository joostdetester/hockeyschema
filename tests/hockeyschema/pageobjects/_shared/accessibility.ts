import { Page, TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Result } from 'axe-core';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Per-scan JSON + screenshot records for the standalone HTML accessibility
// report (see scripts/build-a11y-report.mjs) - separate from the Allure
// attachments below, which stay scoped to their own scenario. Aggregating
// across scenarios requires writing to a shared directory on disk, since
// each scenario is its own Playwright test process.
const REPORT_DATA_DIR = 'a11y-report-data';

export type WcagLevel = 'A' | 'AA' | 'AAA';

// axe-core's 4 impact levels, worst to best. A violation with no impact
// (rare, but axe types allow it) is treated as 'critical' rather than
// silently dropped or downgraded - an un-scored finding should never slip
// through a gate meant to catch the worst issues.
type AxeImpact = 'critical' | 'serious' | 'moderate' | 'minor';

// This project's severity scale (see ai/accessibility-testing.md) maps
// 1:1 onto axe's impact levels.
const SEVERITY_LABELS: Record<AxeImpact, string> = {
  critical: 'Blocker/Critical',
  serious: 'Major',
  moderate: 'Minor',
  minor: 'Cosmetic',
};

// Cumulative per WCAG's own structure: AA conformance requires meeting A,
// AAA requires meeting AA (and therefore A) too - so each level's tag set
// is a superset of the one before it.
const WCAG_TAGS: Record<WcagLevel, string[]> = {
  A: ['wcag2a', 'wcag21a'],
  AA: ['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa'],
  AAA: ['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa', 'wcag2aaa', 'wcag21aaa'],
};

// Which impact levels must have zero violations for the scan to pass at
// each WCAG level. A is the strict baseline (0 Blocker/Critical, 0 Major).
// AA/AAA only gate on Blocker/Critical - their much larger rule sets
// surface far more Major/Minor/Cosmetic findings, which are tracked (full
// results are always attached) but don't block release at those levels.
const GATE_IMPACTS: Record<WcagLevel, AxeImpact[]> = {
  A: ['critical', 'serious'],
  AA: ['critical'],
  AAA: ['critical'],
};

function impactOf(violation: { impact?: string | null }): AxeImpact {
  const impact = violation.impact;
  return impact === 'critical' ||
    impact === 'serious' ||
    impact === 'moderate' ||
    impact === 'minor'
    ? impact
    : 'critical';
}

export async function scanAccessibility(page: Page, testInfo: TestInfo, level: WcagLevel) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS[level]).analyze();

  await testInfo.attach(`axe-results-${level}.json`, {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });

  const summary = results.violations.length
    ? results.violations.map((violation) => formatViolation(violation)).join('\n\n')
    : 'No violations found';
  await testInfo.attach(`axe-summary-${level}.txt`, { body: summary, contentType: 'text/plain' });

  let screenshotFile: string | undefined;
  if (results.violations.length) {
    const screenshot = await captureHighlightedViolations(page, results.violations);
    await testInfo.attach(`axe-violations-${level}.png`, {
      body: screenshot,
      contentType: 'image/png',
    });

    screenshotFile = `${randomUUID()}.png`;
    await mkdir(REPORT_DATA_DIR, { recursive: true });
    await writeFile(path.join(REPORT_DATA_DIR, screenshotFile), screenshot);
  }

  await writeReportRecord(testInfo, level, page.url(), results.violations, screenshotFile);

  const gateImpacts = GATE_IMPACTS[level];
  const failingViolations = results.violations.filter((violation) =>
    gateImpacts.includes(impactOf(violation)),
  );

  return { violations: results.violations, failingViolations };
}

// One record per scan, written for scripts/build-a11y-report.mjs to
// aggregate later. `page` here is derived from the scenario's title (e.g.
// "Login page meets WCAG level A" -> "Login page") rather than passed in
// separately, so this stays a drop-in addition to the existing
// scanAccessibility(page, testInfo, level) signature.
async function writeReportRecord(
  testInfo: TestInfo,
  level: WcagLevel,
  url: string,
  violations: Result[],
  screenshotFile: string | undefined,
): Promise<void> {
  await mkdir(REPORT_DATA_DIR, { recursive: true });
  const record = {
    page: testInfo.title.replace(/\s+meets WCAG level \S+$/i, ''),
    level,
    url,
    violations: violations.map((violation) => ({
      id: violation.id,
      impact: impactOf(violation),
      help: violation.help,
      description: violation.description,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node) => ({
        selector: targetToSelector(node.target),
        failureSummary: node.failureSummary ?? null,
      })),
    })),
    screenshot: screenshotFile ?? null,
  };
  await writeFile(
    path.join(REPORT_DATA_DIR, `${randomUUID()}.json`),
    JSON.stringify(record, null, 2),
  );
}

// One violated rule, its technical detail (axe's own description/help/
// helpUrl), and every affected element's selector plus axe's failure
// summary (which already spells out the concrete fix, e.g. exact contrast
// ratios) - so the report explains *what* is wrong without needing the raw
// JSON open.
function formatViolation(violation: Result): string {
  const impact = impactOf(violation);
  const nodeLines = violation.nodes
    .map((node, i) => {
      const selector = targetToSelector(node.target);
      const failure = node.failureSummary?.trim().replace(/\n/g, '\n     ') ?? '(no details)';
      return `  ${i + 1}. ${selector}\n     ${failure}`;
    })
    .join('\n');

  return [
    `[${SEVERITY_LABELS[impact]}] ${violation.id} - ${violation.help}`,
    `  Impact: ${impact}`,
    `  Description: ${violation.description}`,
    `  Help: ${violation.helpUrl}`,
    `  Affected elements (${violation.nodes.length}):`,
    nodeLines,
  ].join('\n');
}

// axe's target is a path of CSS selectors, one level per shadow-DOM
// boundary crossed - for the (typical) non-shadow-DOM case it's a single
// selector. Only the deepest selector is usable directly with
// querySelectorAll from the main document.
function targetToSelector(target: (string | string[])[]): string {
  const last = target[target.length - 1];
  return Array.isArray(last) ? last[last.length - 1] : last;
}

// Draws a red box around every violating element and returns a full-page
// screenshot, so a reviewer can see exactly where each finding is without
// cross-referencing selectors by hand. Highlights every violation found at
// this WCAG level, not just the ones that fail the level's gate, so
// Major/Minor/Cosmetic findings stay visible too.
//
// Uses absolutely-positioned overlay divs rather than styling the elements
// themselves - sites commonly reset `outline` with their own `!important`
// rules (often the same anti-pattern axe is flagging), which silently wins
// over an inline style, `!important` or not. A freshly appended overlay
// element has no competing rules to lose to.
async function captureHighlightedViolations(page: Page, violations: Result[]): Promise<Buffer> {
  const selectors = violations.flatMap((violation) =>
    violation.nodes.map((node) => targetToSelector(node.target)),
  );

  await page.evaluate((sels: string[]) => {
    for (const selector of sels) {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          const rect = el.getBoundingClientRect();
          const overlay = document.createElement('div');
          overlay.setAttribute('data-a11y-highlight', 'true');
          overlay.style.cssText = `
            position: absolute;
            left: ${rect.left + window.scrollX - 2}px;
            top: ${rect.top + window.scrollY - 2}px;
            width: ${rect.width + 4}px;
            height: ${rect.height + 4}px;
            border: 3px solid red;
            pointer-events: none;
            z-index: 2147483647;
            box-sizing: border-box;
          `;
          document.body.appendChild(overlay);
        });
      } catch {
        // Not every axe target is a valid top-level CSS selector (e.g. a
        // shadow-DOM path) - skip highlighting those; the technical
        // summary still lists them by rule and selector text.
      }
    }
  }, selectors);

  const screenshot = await page.screenshot({ fullPage: true });

  await page.evaluate(() => {
    document.querySelectorAll('[data-a11y-highlight]').forEach((el) => el.remove());
  });

  return screenshot;
}
