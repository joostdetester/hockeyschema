// Elke rol heeft een stabiel id (voor React-keys en add/verwijder) en 3 keuzeplekken
// die een speelster-id bevatten (of null) - gekoppeld aan de echte teamlijst i.p.v. losse tekst.
// Gedeeld tussen App.jsx (nieuwe teams krijgen dit als startpunt) en TeamContext.jsx
// (blanco state bij het aanmaken van een team), zodat ze niet uit elkaar kunnen lopen.
export const DEFAULT_SC = {
  verdedigen: [
    { id: 'v1', role: '1e uitloop', picks: [null, null, null] },
    { id: 'v2', role: '2e uitloop', picks: [null, null, null] },
    { id: 'v3', role: 'Lijnstop links', picks: [null, null, null] },
    { id: 'v4', role: 'Lijnstop rechts', picks: [null, null, null] }
  ],
  aanval: [
    { id: 'a1', role: 'Aangever', picks: [null, null, null] },
    { id: 'a2', role: 'Stopper', picks: [null, null, null] },
    { id: 'a3', role: 'Afmaker', picks: [null, null, null] },
    { id: 'a4', role: 'Tweede stopper', picks: [null, null, null] },
    { id: 'a5', role: 'Lokaas aanvaller', picks: [null, null, null] }
  ]
};
