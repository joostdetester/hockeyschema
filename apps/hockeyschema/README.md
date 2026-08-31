# Wedstrijdschema — React build

Standalone Vite + React versie van de hockey-wedstrijdschema-app.

## Starten

```
npm install
npm run dev
```

Open de URL die Vite toont (meestal http://localhost:5173).

## Build

```
npm run build              # productie (hockeyschema-prod)
npm run build:acceptatie   # acceptatie (hockeyschema-acc)
npm run build:test         # test (hockeyschema-test)
npm run preview
```

## Opslag & omgevingen

Data (team, strafcorner, programma, historie, huidige wedstrijd) staat per team
in Firestore, verdeeld over 3 Firebase-projecten (`hockeyschema-test`,
`hockeyschema-acc`, `hockeyschema-prod`) — welke omgeving actief is, bepalen de
`.env.*`-bestanden. Alleen ingelogde gebruikers kunnen wijzigen; Team, Afspraken
en Historie zijn ook bij lezen alleen zichtbaar voor ingelogde teamleden/admins.

### Nieuwe gebruiker toevoegen

1. Account aanmaken in Firebase Console → Authentication → Users (e-mail +
   wachtwoord), voor de juiste omgeving.
2. De UID van dat account kopiëren.
3. In Firestore (zelfde project) een document aanmaken: `users/{uid}` met
   `{ teamId: "...", role: "member" of "admin", email: "..." }` — het
   `teamId` staat in de Teams-tab van de app.

### Firestore-rules aanpassen

`firestore.rules` bewerken, dan per omgeving deployen:
```
firebase deploy --only firestore:rules --project test
firebase deploy --only firestore:rules --project acceptatie
firebase deploy --only firestore:rules --project productie
```

### Wedstrijden importeren vanaf de clubwebsite

Onder Programma kan een teamlid/admin het team koppelen aan de wedstrijdpagina
van de eigen clubwebsite (LISA-platform, bv. hcrb.nl/team-detail/...), en
daarna met één knop de wedstrijden importeren. De koppeling (club-id, team-id,
autorisatie-header) haal je op via de browser-DevTools op die pagina (Network-
tab, filter op "lisahockey", request-headers van `matches_upcoming_round`) en
staat per team in Firestore (`teams/{teamId}/config/lisa`, alleen zichtbaar
voor teamleden/admins). Dit is een onofficiële, ongedocumenteerde koppeling —
kan zonder waarschuwing stoppen met werken als de clubwebsite verandert; val in
dat geval terug op "Programma plakken". Moet per Firebase-omgeving (test/
acceptatie/productie) apart ingesteld worden, en voor elk ander team met een
eigen LISA-website opnieuw uitgevoerd worden.

## Structuur

- `src/App.jsx` — de volledige applicatie (state, indelingslogica, UI).
- `src/ds/styles.css` — het Broadsheet-designsysteem (kleuren, type, componenten).
- `src/index.css` — kleine resets + printregels.
- `src/firebase.js` — Firebase-initialisatie (auth + Firestore).
- `src/AuthContext.jsx` — login/logout, huidige gebruiker + team/rol.
- `src/TeamContext.jsx` — teamlijst + team-switcher-state.
- `src/Login.jsx` — inlogscherm.
