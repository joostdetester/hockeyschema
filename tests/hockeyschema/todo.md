# Test-dekking TODO — Hockeyschema

Doel: Playwright/Cucumber-dekking uitbreiden naar alle pagina's/tabbladen,
risk-based opgezet, met duidelijke tagging. Dit bestand volgt onze
voortgang; we werken 'm samen bij na elk gesprek.

## Wat er al staat (bestaande conventie, zie `ai/repo-structure.md`)

- Feature files in `features/*.feature`, Given/When/Then, Engels.
- Eén `*.steps.ts` per feature file, dun (roept alleen page-object-methodes aan).
- Eén page object per scherm in `pageobjects/*.page.ts` (alleen selectors + acties, geen asserts).
- Type-tag per feature: `@ui` / `@api` / `@e2e` / `@db` / `@accessibility`.
- Risico-tag: `@smoke` bestaat al (homepage, api-health-check) — verder nog
  niet uitgewerkt. Dit is waar we vandaag samen invulling aan geven.
- Patroon dat Team/Wedstrijdschema al volgen: eerst scenario's schrijven en
  laten reviewen, dán pas steps/page objects implementeren.

## Tagging-schema (risk-based) — vastgesteld

Elk scenario krijgt een type-tag (bestaand: `@ui`/`@api`/`@accessibility`)
plus precies één risico-tag uit onderstaande 4-punts-schaal:

| Tag | Betekenis |
|---|---|
| `@critical` | Bug hier = de coach zit er *tijdens* de wedstrijd mee vast (schema kwijt, live score/DP fout, kan niet opslaan) |
| `@high` | Belangrijke functionaliteit, geen wedstrijd-blokkerende impact maar wel vervelend/zichtbaar |
| `@medium` | Nuttig maar minder tijdsdruk - normale regressie |
| `@low` | Randgevallen, cosmetisch, zelden gebruikte paden |

`@smoke` blijft daarnaast bestaan als losse, orthogonale vlag (niet risico,
maar "snelle sanity-check die op elke build moet slagen") - een scenario
kan dus `@ui @critical @smoke` zijn. `@critical`-scenario's draaien in elk
geval op elke build/PR; `@high`/`@medium`/`@low` periodiek of voor een
release-promotie (nog te verfijnen als de eerste scenario's er staan).

## Prioriteitsvolgorde (vastgesteld)

1. **Live/Wedstrijdmodus + Wedstrijdschema** — kernflows tijdens de wedstrijd zelf.
2. Team + Strafcorner
3. Programma + Standen + Historie
4. Ouders + Notities

## Pagina's/features — status

| Pagina/tabblad | Scenario's | Steps/page object | Risico | Notities |
|---|---|---|---|---|
| Homepage | klaar | klaar | `@smoke` | af |
| Accessibility scan | klaar | klaar | — | af, dekt alle tabs via één scan |
| API health check | klaar | klaar | `@smoke` | af |
| **Wedstrijdschema** | klaar (draft) | ontbreekt | `@critical` (gezet) | **volgende stap: samen doorlopen** |
| **Live/Wedstrijdmodus** | klaar (draft) | ontbreekt | `@critical`/`@high`/`@medium` gemengd | **volgende stap: samen doorlopen** — DP-bug net hier gefixt, bevat regressietest daarvoor |
| Team | klaar (draft) | ontbreekt | `@high` (voorstel) | scenario's staan klaar, later doorlopen |
| Strafcorner | ontbreekt | ontbreekt | ? | |
| Programma | ontbreekt | ontbreekt | ? | |
| Standen | ontbreekt | ontbreekt | ? | |
| Historie | ontbreekt | ontbreekt | ? | |
| Ouders | ontbreekt | ontbreekt | ? | |
| Notities | ontbreekt | ontbreekt | ? | nieuw deze sessie gebouwd |

## Al geïmplementeerd (deze sessie)

- Login-infrastructuur: `config/project.config.ts` + `.env.example` hebben nu
  `USER_EMAIL`/`USER_PASSWORD` (per `ai/repo-structure.md`'s eigen, tot nu toe
  nooit aangesloten plan). **Er is nog geen echt test-account** — zonder een
  werkend `USER_EMAIL`/`USER_PASSWORD` in je lokale `.env` (en straks als
  GitHub Environment secret per omgeving) faalt elke ingelogde test bij de
  loginstap. Nooit je eigen echte account hiervoor gebruiken.
- `HomePage.login()` en `HomePage.switchToWedstrijdmodus()` (pageobjects/home.page.ts).
- `steps/common.steps.ts`: de gedeelde Background-stappen "the user is
  logged in as a team member" en "the user switches to Wedstrijdmodus" -
  lost de "undefined step"-kringeltjes op in Team/Wedstrijdschema/
  Live-Wedstrijdmodus. De scenario's zelf (de stappen ná de Background)
  staan nog als `test.fixme` - nog niet geïmplementeerd.
- Risico-tags (`@critical`/`@high`/`@medium`/`@low`) zijn nu ook verwerkt in
  de Allure-severity-mapping in `steps/fixtures.ts` (eerst alleen
  `@critical`/`@smoke`).

## Ook nog openstaand

- Een echt test-account aanmaken/koppelen per omgeving (test/acceptance/
  productie) voor `USER_EMAIL`/`USER_PASSWORD` — zonder dat kan geen enkele
  ingelogde test daadwerkelijk draaien.
- `ai/project-context.md` is nog een ongewijzigde template ("Fill this in
  for the actual system under test once known") — nooit ingevuld voor deze
  app. Zou ingevuld moeten worden zodat een volgende sessie niet opnieuw
  alles hoeft te herleiden.

## Volgende stappen

1. ~~Samen tagging-schema + prioriteiten vaststellen~~ — gedaan.
2. ~~Background-stappen (login/tab/Wedstrijdmodus) implementeren~~ — gedaan.
3. Test-account regelen zodat er daadwerkelijk gedraaid kan worden.
4. Wedstrijdschema-scenario's (al geschreven) samen doorlopen — kloppen ze
   nog, missen er `@critical`-flows?
5. De losse stappen ín de Live/Wedstrijdmodus- en Wedstrijdschema-scenario's
   implementeren (steps + page objects), groen krijgen in CI.
6. `project-context.md` invullen.
7. Daarna verder met prioriteit 2 (Team + Strafcorner), enzovoort.
