// Changelog voor de admin-only "Wijzigingen"-pagina in App.jsx (tab 'wijzigingen'). Nieuwste
// versie eerst. Bij elke noemenswaardige set wijzigingen: bump apps/hockeyschema/package.json's
// version (major.minor - het patch-cijfer daarachter wordt door CI automatisch ingevuld, zie
// vite.config.js) en voeg hier een entry toe met dezelfde major.minor.
export const CHANGELOG = [
  {
    version: '1.1.0',
    date: '2026-09-12',
    changes: [
      'Speler-positievoorkeur uitgebreid met "verboden positie" - zo\'n speelster wordt daar nooit ingedeeld, ook niet als er verder geen voorkeur is opgegeven.',
      'Wisselsignaal versterkt, nieuw hard eindsignaal bij het einde van een kwart, geluid gaat standaard op maximaal bij het starten van wedstrijdmodus.',
      'Nachtelijke automatische verversing van competitieprogramma, eigen fixtures en stand via de LISA-koppeling, ook voor teams die dit nooit handmatig doen.',
      'Doelpuntviering: banner + pushmelding bij elk doelpunt (eigen én tegen), met een feitelijke tekst (scorer, minuut, assist, stand met teamnamen) en wisseling-in-de-wedstrijd-context ("komt op voorsprong", "loopt uit", "maakt gelijk", "brengt de achterstand terug tot N").',
      'Echte pushmeldingen (Firebase Cloud Messaging) - werken ook met vergrendeld scherm, met een eigen "Push meldingen"-pagina (stap-voor-stap voor Android/iPhone) en een aan/uit-schakelaar.',
      'Versienummer onderaan elke pagina, automatisch bijgewerkt per build.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-08-31 t/m 2026-09-04',
    changes: [
      'Basis wedstrijdschema-, team- en programmabeheer opgezet (monorepo-structuur, Firebase Hosting/test-omgeving).',
      'Standen-tab met koppeling aan de clubwebsite (LISA).',
      'Ouders-pagina (pauzehap-/rijderindeling per wedstrijd), publiek leesbaar zonder in te loggen.',
      'Live wedstrijdvolgen: Wedstrijdmodus, Live-pagina, Wedstrijdverslagen en scoreverloop.',
      'Coach-/managerrollen per team, meerdere teams per account, zelfstandig wachtwoord instellen/herstellen.',
      'Speeltijd-eerlijkheid en positietoewijzing-instellingen, strafcorner-editor, printlay-out per kwart.',
      'Mobiele navigatie herzien; admin-only Inlogpogingen-pagina.',
      'Diverse kleinere verbeteringen (leesbaarheid bij alleen-lezen, printweergave, favicon, scoping van de teamdirectory).',
    ],
  },
];
