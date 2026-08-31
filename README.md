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

`.github/workflows/ci.yml` draaide oorspronkelijk vanuit de root van een
losstaande testrepo en verwacht `npm`-commando's/paden op dat niveau — nu de
testen in `tests/hockeyschema/` staan, moet deze workflow nog worden
aangepast (working-directory / artifact-paden) voordat hij weer werkt.
