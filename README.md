# hockeyschema

Monorepo met de Wedstrijdschema-app en de bijbehorende Playwright-testen.

- `apps/hockeyschema/` — de React/Vite-app (Firebase Auth + Firestore,
  multi-team). Zie `apps/hockeyschema/README.md`.
- `tests/hockeyschema/` — Playwright + Cucumber (BDD) testautomatisering voor
  de app hierboven. Zie `tests/hockeyschema/README.md` en `tests/hockeyschema/ai/`
  voor de testrichtlijnen.

Elke map heeft zijn eigen `package.json` en wordt onafhankelijk geïnstalleerd
(`npm install` binnen de betreffende map).

## CI

`.github/workflows/ci.yml` draait op push/PR naar `test`, `acceptance` en
`main`, elk gekoppeld aan hun eigen omgeving (test/acceptance/production) en
Firebase-project (zie `apps/hockeyschema/.firebaserc`). Op elke push (dus na
een gemergde PR, of een directe push naar `test`) bouwt en deployt de
`deploy`-job de app automatisch naar de bijbehorende Firebase Hosting-
omgeving, waarna de Playwright/Accessibility-jobs tegen die net gedeployde
site draaien. `acceptance` en `main` vereisen een pull request (branch
protection); alleen `test` mag direct gepusht worden. Zie
`tests/hockeyschema/ai/repo-structure.md` voor het volledige branch-/
omgevingsmodel.
