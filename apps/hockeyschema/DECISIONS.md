# Beslissingenlog — Hockeyschema

Overzicht van functionele beslissingen die tijdens deze sessie zijn gemaakt, per pagina/sectie van de app. Technische locatie: `apps/hockeyschema/src/App.jsx` (en `src/index.css`, `src/ds/styles.css`) tenzij anders vermeld.

## Wedstrijdschema — Speeltijdverdeling

- **Max. 1 speelblok verschil.** Bij een volledige wedstrijd (geen uitvaller) mogen twee veldspeelsters nooit meer dan 1 speelblok van elkaar verschillen. Dit wordt na het genereren van het schema afgedwongen (`enforceFairness`), met behoud van de garantie dat wie de 1e helft van een kwart op de bank zit, gegarandeerd de 2e helft speelt, en zonder iemand een heel kwart te laten zitten.
  - Aanleiding: bij "Zwakke tegenstander" kreeg een speelster met een hoger sterktegewicht toch minder speelblokken dan sterkere teamgenoten, doordat de correctieronde op voorkeurspositie (zie hieronder) haar er meermaals uit ruilde.
- **Sterk/zwak/standaard-keuze blijft ongewijzigd** als losse instelling naast de nieuwe toggles hieronder (niet vervangen).

## Wedstrijdschema — Positietoewijzing (nieuw)

Drie afzonderlijke aan/uit-schuifjes (groen = aan, rood = uit), elk met een hover-only info-icoon (i) en een dynamische toelichtingstekst die met "Meer kans op …" begint als de schuif aan staat:

- **Zone-sterkte** — de as krijgt bij voorkeur de sterkste speelsters, gevolgd door rechts, dan links. Uit: sterkte speelt geen rol meer bij positietoewijzing.
- **Continuïteit** — voorkeur om op dezelfde positie te blijven staan als het vorige blok. Tekst: "Meer/Minder kans op dezelfde positie als vorig blok" (bewust zo geformuleerd i.p.v. "wisselingen", zodat alle drie de toggles dezelfde "meer = aan"-richting hebben).
- **Correctieronde op voorkeur** — ruilt iemand zonder voorkeur voor haar positie met een bankspeelster die daar wél voorkeur voor heeft, ook als dat ten koste gaat van eerlijke speeltijd voor dat blok. Dit is de instelling die de max-1-verschil-regel hierboven kan overrulen als hij aan staat.

Alle drie staan standaard **aan** (bestaand gedrag blijft ongewijzigd tenzij bewust uitgezet).

## Wedstrijdschema — Selectie & Stap 2

- **"Iedereen selecteren" gesplitst** in twee knoppen: **"Vaste spelers selecteren"** (alleen het vaste team) en **"Ook invallers selecteren"** (vaste spelers + invallers).
- **Vaste keeper wordt automatisch ingevuld** bij Stap 2 zodra zij in de selectie zit en er nog geen keeper gekozen is. Een handmatig gekozen keeper wordt nooit overschreven.
- **Melding bij verouderd schema.** Wijzig je de selectie (Stap 1) nadat het schema al is gemaakt, dan verschijnt een melding dat het schema opnieuw gemaakt moet worden om de wijziging mee te nemen. Het bestaande schema wordt niet automatisch gewist. Knoptekst blijft **"Schema opnieuw maken"** (bewust niet hernoemd naar "opnieuw laden").

## Wedstrijdschema — Strafcorner (onder het schema)

- **Bewerkbaar in plaats van alleen-lezen.** Elke rol (1e/2e/3e keus) is nu een dropdown i.p.v. platte tekst.
- **Automatisch gevuld vanuit de seizoensvolgorde** (Strafcorner-pagina), maar alleen met spelers die voor déze wedstrijd geselecteerd én niet uitgevallen zijn.
- **Automatisch opschuiven.** Een wegvallende speler (niet geselecteerd, of tijdens de wedstrijd geblesseerd) wordt uit de rij gefilterd i.p.v. alleen leeggemaakt — de 2e keus wordt dan vanzelf de 1e, enz.
- **Geen dubbele speler binnen één rol.** Een speler die al bij een andere keuze van dezelfde rol is gekozen, verdwijnt uit de opties van de overige keuzes (zowel hier als in de seizoens-Strafcorner-pagina).
- **Per-wedstrijd override, seizoen blijft intact.** Handmatige aanpassingen (`scOverrides`) gelden alleen voor deze wedstrijd; de volgende wedstrijd begint weer bij de seizoensvolgorde.
- **"Haal standaard op"**-link per groep (Verdedigen/Aanval) om eigen aanpassingen voor die groep te wissen en terug te vallen op de (gefilterde) seizoensvolgorde.
- **Visuele stijl** gelijk aan de seizoens-Strafcorner-tabel (rol in grijs vak, kolommen 1e/2e/3e keus), met als enige verschil dat de rolnaam hier niet bewerkbaar is.

## Wedstrijdschema — Strafcornerschema (nieuw)

- Toont per speelblok (8 rijen, 1e/2e helft per kwart) wie een rol daadwerkelijk kan uitvoeren, namelijk de hoogste keus die op dat moment ook echt in het veld staat.
- **Rollen worden in volgorde toegekend** (bijv. 1e uitloop vóór 2e uitloop) zodat één speler nooit voor twee rollen tegelijk in hetzelfde blok wordt ingezet — wie al aan een eerdere rol is toegewezen, valt af bij de volgende rol.

## Programma — Importeer wedstrijden (LISA)

- **Bugfix.** Een al bestaande wedstrijd (zelfde datum + tegenstander) werd bij een hernieuwde import genegeerd, ook als de tijd (of thuis/uit) inmiddels gewijzigd was — vandaar dat alleen "verwijderen en opnieuw importeren" werkte. Nu wordt de bestaande rij bijgewerkt met de nieuwe tijd/thuis-uit, met behoud van zijn eigen `id` (en dus van gekoppelde schema's).

## Print

- **Nieuwe printoptie "Wedstrijdschema"** naast Strafcorner en Speeltijd, standaard aangevinkt (bestaand gedrag blijft hetzelfde tenzij je hem uitzet).
- **Geen app-header meer op de afdruk.** Het bovenste blok (logo, "Wedstrijdschema — HCRB MO18-2", "TEGEN … · 4 × 17.5 MIN") print niet meer; alleen de wedstrijdtitel blijft over, nu verplaatst naar de nieuwe kop-per-pagina hieronder.
- **Wedstrijdschema en Strafcornerschema splitsen elk in 2 afdrukpagina's**: kwart 1+2 op de eerste, kwart 3+4 op de tweede. Elke pagina krijgt een eigen kop: HCRB-logo + titel (bv. "Wedstrijdschema kwart 1 en 2") met daaronder klein de wedstrijddetails (tegenstander/team + datum + tijd).
- **Geen onbedoelde lege eerste pagina.** Een paginabreuk vóór een blok wordt alleen ingezet als er al content aan vooraf gaat op die afdruk (anders levert een breuk vóór het allereerste element een lege pagina op).
- **Strafcorner verdedigen/aanval (de bewerk-tabellen) printen nooit meer** — ook niet met de Strafcorner-printoptie aan. Alleen het Strafcornerschema (per-blok overzicht) print nog.
- **Watermerk (HCRB-logo op de achtergrond) print niet meer**, blijft wel op het scherm zichtbaar.

---
*Gegenereerd op basis van de sessie van 2026-09-02 met Claude Code (Sonnet 5).*
