// Changelog voor de admin-only "Wijzigingen"-pagina in App.jsx (tab 'wijzigingen'). Nieuwste
// versie eerst. Bij elke noemenswaardige set wijzigingen: bump apps/hockeyschema/package.json's
// version (major.minor - het patch-cijfer daarachter wordt door CI automatisch ingevuld, zie
// vite.config.js) en voeg hier een entry toe met dezelfde major.minor.
export const CHANGELOG = [
  {
    version: '1.5.0',
    date: '2026-09-12',
    changes: [
      'Team: eerste leuke "spelerskaartjes" toegevoegd - een rond fotootje naast de naam (waar aanwezig) waar je op kan klikken voor de volledige kaart. Puur voor de lol, geen echte spelerdata.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-09-12',
    changes: [
      'Bugfix: na een nieuwe versie kon de app door browsercaching nog tot een uur het oude versienummer/de oude versie tonen - de hoofdpagina wordt nu nooit meer gecachet, dus elke nieuwe versie is direct zichtbaar na een ververs.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-09-12',
    changes: [
      'Wedstrijdmodus: bij het doelpunt-commentaar en "Extra live commentaar" kan nu ook worden ingesproken i.p.v. getypt (spraakherkenning) - de tekst blijft daarna gewoon nog met de hand aan te passen.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-12',
    changes: [
      'Wedstrijdmodus: knop "Scherm actief houden" voorkomt dat een laptop tijdens de wedstrijd door inactiviteit in slaapstand gaat / vergrendelt. Zelf aan/uit te zetten, en schakelt automatisch uit bij "Wedstrijd beëindigen".',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-12',
    changes: [
      'Speler-positievoorkeur uitgebreid met "verboden positie" - zo\'n speelster wordt daar nooit ingedeeld, ook niet als er verder geen voorkeur is opgegeven.',
      'Positievoorkeur bij Team is nu een dropdown (1 t/m 6) i.p.v. een los invulveld: geen gaten meer mogelijk (na 1, 2, 3 is 4 de eerstvolgende), en een al gebruikt cijfer kiezen schuift de andere posities automatisch één plek op - net als een item verplaatsen in een gerangschikte lijst.',
      'Wisselsignaal versterkt, nieuw hard eindsignaal bij het einde van een kwart, geluid gaat standaard op maximaal bij het starten van wedstrijdmodus.',
      'Nachtelijke automatische verversing van competitieprogramma, eigen fixtures en stand via de LISA-koppeling, ook voor teams die dit nooit handmatig doen.',
      'Doelpuntviering: banner + pushmelding bij elk doelpunt (eigen én tegen) met een feitelijke tekst (scorer, minuut, assist, stand met verkorte teamnamen) en wisseling-in-de-wedstrijd-context ("komt op voorsprong", "loopt uit", "maakt gelijk", "brengt de achterstand terug tot N") - geen gesproken aankondiging meer, en een witte bal i.p.v. een voetbal-icoon.',
      'Echte pushmeldingen (Firebase Cloud Messaging) - werken ook met vergrendeld scherm, met een eigen "Push meldingen"-pagina (stap-voor-stap voor Android/iPhone) en een aan/uit-schakelaar om ze ook weer uit te zetten.',
      'Wedstrijdschema (indelingsmodus): onder elk kwart een "Pijnpunten"-melding met elke speelster op een positie zonder voorkeur of op een voor haar verboden positie. In het schema zelf, en in de wissel-/verplaatsdialogen, staat bij elke naam nu ook een rond badge-icoontje met haar voorkeurscijfer (groen = beste positie, oranje = haar minst geprefereerde ingevulde positie, rood vraagteken = geen voorkeur ingevuld) of 🚫 als de positie voor haar verboden is.',
      'Team-tabel: de kolomkop blijft zichtbaar bij naar beneden scrollen.',
      'Nieuwe "Wijzigingen"-pagina (dit scherm) met een changelog per versie - zichtbaar voor admin en coaches/managers.',
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
