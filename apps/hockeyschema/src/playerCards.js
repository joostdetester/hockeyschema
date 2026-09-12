// Losse, met de hand aangemaakte "spelerskaartjes" (leuke FIFA-kaart-stijl met verzonnen
// cijfers - geen echte spelerdata) die de coach zelf per speelster aanlevert. Nieuw kaartje
// toevoegen: zet de afbeelding in public/cards/<bestandsnaam>.png en voeg hieronder een regel
// toe met de sleutel (voornaam via cardKey - kleine letters, geen accenten, geen spaties).
export const PLAYER_CARDS = {
  mirre: '/cards/mirre.png',
};

export function cardKey(name) {
  return (name || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export function cardFor(name) {
  return PLAYER_CARDS[cardKey(name)] || null;
}
