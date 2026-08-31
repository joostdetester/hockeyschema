// Aggregates the per-scan JSON + screenshot records written by
// pageobjects/_shared/accessibility.ts (one file per WCAG-level scan, see
// REPORT_DATA_DIR there) into a single standalone HTML accessibility
// report - independent of Allure, so it can be opened directly and shows
// every page's technical violation detail alongside its red-boxed
// screenshot in one place. Run via `npm run a11y:report` after `test:a11y`.
import { readdir, readFile, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = process.env.A11Y_REPORT_DATA_DIR ?? 'a11y-report-data';
const OUT_DIR = process.env.A11Y_REPORT_OUT_DIR ?? 'a11y-report';
const BASE_URL = process.env.BASE_URL ?? '';

const LEVEL_ORDER = ['A', 'AA', 'AAA'];
const SEVERITY_ORDER = ['critical', 'serious', 'moderate', 'minor'];
const SEVERITY_LABELS = {
  critical: 'Blocker/Critical',
  serious: 'Major',
  moderate: 'Minor',
  minor: 'Cosmetic',
};

async function main() {
  const files = await readdir(DATA_DIR).catch(() => []);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  if (!jsonFiles.length) {
    console.log(`No accessibility scan records found in ${DATA_DIR}/ - skipping report.`);
    return;
  }

  const records = await Promise.all(
    jsonFiles.map(async (f) => JSON.parse(await readFile(path.join(DATA_DIR, f), 'utf8'))),
  );

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUT_DIR, 'screenshots'), { recursive: true });

  for (const record of records) {
    if (record.screenshot) {
      await copyFile(
        path.join(DATA_DIR, record.screenshot),
        path.join(OUT_DIR, 'screenshots', record.screenshot),
      );
    }
  }

  const html = buildHtmlReport(records);
  await writeFile(path.join(OUT_DIR, 'index.html'), `${html}\n`, 'utf8');
  console.log(`Wrote ${path.join(OUT_DIR, 'index.html')} from ${records.length} scan(s).`);
}

function severityCounts(violations) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const violation of violations) {
    counts[violation.impact] = (counts[violation.impact] ?? 0) + 1;
  }
  return counts;
}

function addCounts(a, b) {
  const result = {};
  for (const key of SEVERITY_ORDER) result[key] = (a[key] ?? 0) + (b[key] ?? 0);
  return result;
}

function buildHtmlReport(records) {
  const byLevel = new Map();
  for (const record of records) {
    if (!byLevel.has(record.level)) byLevel.set(record.level, []);
    byLevel.get(record.level).push(record);
  }

  const levels = LEVEL_ORDER.filter((level) => byLevel.has(level));

  const overallCounts = records.reduce((acc, r) => addCounts(acc, severityCounts(r.violations)), {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  });
  const overallViolationTotal = Object.values(overallCounts).reduce((a, b) => a + b, 0);
  const pagesScanned = new Set(records.map((r) => r.page)).size;

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Toegankelijkheidsrapport</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <p class="eyebrow">Toegankelijkheidsrapport</p>
    <h1>WCAG 2.1 A / AA / AAA</h1>
    <p class="lede">
      Een compacte, leesbare samenvatting van de accessibility-scan voor de
      belangrijkste schermen in dit project, met technische foutomschrijving
      en een screenshot per pagina waarop elke fout rood omlijnd is.
    </p>
    <div class="metrics">
      <div class="metric">
        <div class="metric-value long">${escapeHtml(BASE_URL || '—')}</div>
        <div class="metric-label">Base URL</div>
      </div>
      <div class="metric">
        <div class="metric-value">${levels.length}</div>
        <div class="metric-label">WCAG-niveaus</div>
      </div>
      <div class="metric">
        <div class="metric-value">${pagesScanned}</div>
        <div class="metric-label">Gescande pagina's</div>
      </div>
      ${SEVERITY_ORDER.map(
        (key) => `
      <div class="metric">
        <div class="metric-value">${overallCounts[key]}</div>
        <div class="metric-label">${escapeHtml(SEVERITY_LABELS[key])}</div>
      </div>`,
      ).join('')}
    </div>
    ${renderBadge(overallViolationTotal === 0, `${overallViolationTotal} violations`, 'Geen violations')}
  </header>

  ${levels.map((level) => renderLevelSection(level, byLevel.get(level))).join('\n')}

  <footer class="footer">
    Gegenereerd op ${escapeHtml(new Date().toISOString())}
  </footer>
</div>
</body>
</html>`;
}

function renderLevelSection(level, levelRecords) {
  const levelCounts = levelRecords.reduce(
    (acc, r) => addCounts(acc, severityCounts(r.violations)),
    { critical: 0, serious: 0, moderate: 0, minor: 0 },
  );
  const levelTotal = Object.values(levelCounts).reduce((a, b) => a + b, 0);
  const pages = [...levelRecords].sort((a, b) => a.page.localeCompare(b.page));

  return `
  <section class="level-section">
    <div class="level-header">
      <h2>WCAG 2.1 ${escapeHtml(level)}</h2>
      ${renderBadge(levelTotal === 0, `${levelTotal} violations`, 'Geen violations')}
    </div>
    <div class="level-summary">
      ${SEVERITY_ORDER.map(
        (key) =>
          `<span class="chip">${escapeHtml(SEVERITY_LABELS[key])}: <strong>${levelCounts[key]}</strong></span>`,
      ).join('')}
    </div>
    <h3 class="subheading">Per pagina</h3>
    ${pages.map((record) => renderPageCard(record)).join('\n')}
  </section>`;
}

function renderPageCard(record) {
  const total = record.violations.length;
  const stateClass = total === 0 ? 'pass' : 'warning';

  return `
    <article class="page-card ${stateClass}">
      <div class="page-card-header">
        <div>
          <div class="page-name">${escapeHtml(record.page)}</div>
          <div class="page-url">${escapeHtml(record.url)}</div>
        </div>
        ${renderBadge(total === 0, `${total} violations`, 'Geen violations')}
      </div>
      ${
        record.screenshot
          ? `<figure class="evidence-shot">
        <img src="screenshots/${escapeHtml(record.screenshot)}" alt="Screenshot van ${escapeHtml(record.page)} met violations rood omlijnd" loading="lazy" />
        <figcaption>Elke rood omlijnde markering is een violation gevonden op deze pagina.</figcaption>
      </figure>`
          : ''
      }
      ${
        total === 0
          ? `<p class="muted">Geen WCAG 2.1 ${escapeHtml(record.level)}-violations gevonden op deze pagina.</p>`
          : record.violations.map((violation) => renderViolation(violation)).join('\n')
      }
    </article>`;
}

function renderViolation(violation) {
  return `
      <section class="violation">
        <div class="violation-header">
          <span class="badge badge-${violation.impact}">${escapeHtml(SEVERITY_LABELS[violation.impact])}</span>
          <span class="violation-id">${escapeHtml(violation.id)}</span>
          <span class="violation-help">${escapeHtml(violation.help)}</span>
        </div>
        <p class="violation-description">${escapeHtml(violation.description)}</p>
        <a class="help-link" href="${escapeHtml(violation.helpUrl)}" target="_blank" rel="noopener noreferrer">
          Meer uitleg over deze regel
        </a>
        <ul class="node-list">
          ${violation.nodes
            .map(
              (node) => `<li>
            <code>${escapeHtml(node.selector)}</code>
            ${node.failureSummary ? `<div class="failure-summary">${escapeHtml(node.failureSummary)}</div>` : ''}
          </li>`,
            )
            .join('')}
        </ul>
      </section>`;
}

function renderBadge(isPass, failLabel, passLabel) {
  return isPass
    ? `<span class="badge badge-pass">${escapeHtml(passLabel)}</span>`
    : `<span class="badge badge-warning">${escapeHtml(failLabel)}</span>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CSS = `
:root {
  color-scheme: light;
  --bg: #f4f7fb;
  --panel: #ffffff;
  --text: #132238;
  --muted: #5b6b84;
  --line: #d9e2ef;
  --pass: #157347;
  --warning: #b46904;
  --critical: #991b1b;
  --serious: #c2410c;
  --moderate: #b45309;
  --minor: #2563eb;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  color: var(--text);
  background: linear-gradient(180deg, #eef4fb 0%, var(--bg) 100%);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.wrap { max-width: 1180px; margin: 0 auto; padding: 32px 20px 56px; }
.hero {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 28px;
  box-shadow: 0 12px 32px rgba(19, 34, 56, 0.08);
}
.eyebrow { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
h1 { margin: 6px 0 12px; font-size: 28px; }
.lede { margin: 0 0 20px; color: var(--muted); max-width: 60ch; }
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px; }
.metric { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; overflow: hidden; }
.metric-value { font-size: 20px; font-weight: 800; word-break: break-word; }
.metric-value.long { font-size: 13px; font-weight: 700; word-break: break-all; }
.metric-label { font-size: 12px; color: var(--muted); }
.level-section { margin-top: 28px; }
.level-header { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
.level-header h2 { margin: 0; }
.level-summary { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 18px; }
.chip { background: #f8fafc; border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; font-size: 13px; color: var(--muted); }
.subheading { font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 18px 0 10px; }
.page-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 14px;
}
.page-card.pass { border-left: 5px solid var(--pass); }
.page-card.warning { border-left: 5px solid var(--warning); }
.page-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.page-name { font-weight: 700; }
.page-url { font-size: 13px; color: var(--muted); word-break: break-all; }
.badge {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 700;
  border: 1px solid transparent; white-space: nowrap;
}
.badge-pass { background: #e8f7ee; color: var(--pass); border-color: #b9e4c8; }
.badge-warning { background: #fff4df; color: var(--warning); border-color: #ffd89a; }
.badge-critical { background: #fee2e2; color: var(--critical); }
.badge-serious { background: #ffedd5; color: var(--serious); }
.badge-moderate { background: #fef3c7; color: var(--moderate); }
.badge-minor { background: #dbeafe; color: var(--minor); }
.muted { color: var(--muted); }
.evidence-shot { margin: 14px 0; }
.evidence-shot img { max-width: 100%; border-radius: 12px; border: 1px solid var(--line); display: block; }
.evidence-shot figcaption { font-size: 12px; color: var(--muted); margin-top: 6px; }
.violation {
  background: #fbfcfe;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px 16px;
  margin-top: 12px;
}
.violation-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.violation-id { font-family: ui-monospace, monospace; font-size: 12px; color: var(--muted); }
.violation-help { font-weight: 600; }
.violation-description { margin: 0 0 8px; color: var(--muted); }
.help-link { font-size: 13px; }
.node-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.node-list li { background: #f8fafc; border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; }
.node-list code { font-size: 12px; }
.failure-summary { font-size: 12px; color: var(--muted); white-space: pre-line; margin-top: 4px; }
.footer { margin-top: 32px; font-size: 12px; color: var(--muted); text-align: center; }
`;

main();
