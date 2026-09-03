// Groepen liggen vast in code (net als de standaard strafcorner-rollen in scDefaults.js) - alleen
// de categorieën per groep zijn in de app zelf te beheren (Verbeterpunten-tab). Gedeeld tussen
// App.jsx en TeamContext.jsx (blanco state bij het aanmaken van een team).
export const NOTE_GROUPS = [
  { key: 'aanvallend', label: 'Aanvallend' },
  { key: 'verdedigend', label: 'Verdedigend' },
  { key: 'techniek', label: 'Techniek' },
  { key: 'mentaliteit', label: 'Mentaliteit' }
];

export const DEFAULT_NOTE_CATEGORIES = {
  aanvallend: [
    { id: 'na1', label: 'Breed staan' },
    { id: 'na2', label: 'Diepte geven' },
    { id: 'na3', label: 'Achterhoede mee naar voren' },
    { id: 'na4', label: 'Aanspeelbaar zijn / vrijlopen' },
    { id: 'na5', label: 'Tempo maken' }
  ],
  verdedigend: [
    { id: 'nv1', label: 'Compact staan' },
    { id: 'nv2', label: 'Voorhoede mee terug' },
    { id: 'nv3', label: 'Druk zetten op de bal' },
    { id: 'nv4', label: 'Juiste man dekken' },
    { id: 'nv5', label: 'Restverdediging op orde' }
  ],
  techniek: [
    { id: 'nt1', label: 'Passing nauwkeurigheid' },
    { id: 'nt2', label: 'Aanname / bal onder controle' },
    { id: 'nt3', label: '1v1 / dribbelen' },
    { id: 'nt4', label: 'Afwerken' }
  ],
  mentaliteit: [
    { id: 'nm1', label: 'Communiceren op het veld' },
    { id: 'nm2', label: 'Positie houden / niet wegzakken' }
  ]
};
