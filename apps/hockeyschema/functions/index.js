const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ maxInstances: 5 });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Creating another user's Firebase Auth account (or looking one up by email) needs the
// Admin SDK - the client SDK can only ever affect the currently signed-in user, and
// signing up as someone else would sign the admin themselves out of their own session.
// This function only creates the account (no password) and links it to a team; the app
// sends the actual "set your password" email client-side right after, via the ordinary
// public sendPasswordResetEmail() call - no email-sending infrastructure needed here.
exports.addCoachToTeam = onCall(async (request) => {
  const callerUid = request.auth && request.auth.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Je moet ingelogd zijn.');

  const callerDoc = await admin.firestore().doc(`users/${callerUid}`).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Alleen een beheerder mag gebruikers toevoegen.');
  }

  const email = String((request.data || {}).email || '').trim().toLowerCase();
  const teamId = String((request.data || {}).teamId || '').trim();
  const requestedRole = String((request.data || {}).role || 'coach').trim();
  if (!EMAIL_RE.test(email)) throw new HttpsError('invalid-argument', 'Ongeldig e-mailadres.');
  if (!teamId) throw new HttpsError('invalid-argument', 'Team is verplicht.');
  if (!['coach', 'manager'].includes(requestedRole)) throw new HttpsError('invalid-argument', 'Ongeldige rol.');

  const teamDoc = await admin.firestore().doc(`teams/${teamId}`).get();
  if (!teamDoc.exists) throw new HttpsError('invalid-argument', 'Onbekend team.');

  let userRecord;
  let created = false;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw new HttpsError('internal', 'Kon gebruiker niet opzoeken.');
    userRecord = await admin.auth().createUser({ email });
    created = true;
  }

  // A coach/manager can belong to several teams at once, each with its own role, so this
  // merges the new team+role into the existing `teams` map rather than overwriting a single
  // teamId/role pair (which used to "move" someone to the newly-added team instead of also
  // linking them there). `role` at the top level stays reserved for the global 'admin' flag -
  // never downgrade an existing admin just because their email got added to a team here, and
  // never write coach/manager into that field (their role lives in `teams` instead).
  const existingSnap = created ? null : await admin.firestore().doc(`users/${userRecord.uid}`).get();
  const existingData = existingSnap && existingSnap.exists ? existingSnap.data() : {};
  const isExistingAdmin = existingData.role === 'admin';

  let teams = { ...(existingData.teams || {}) };
  // Backward compat: fold a legacy single teamId/role pair into the map before adding the
  // new one, so a not-yet-migrated account ends up with both its old and new team linked
  // instead of losing the old one.
  if (!Object.keys(teams).length && existingData.teamId && existingData.role && existingData.role !== 'admin') {
    teams[existingData.teamId] = existingData.role;
  }
  teams[teamId] = requestedRole;

  const FieldValue = admin.firestore.FieldValue;
  await admin.firestore().doc(`users/${userRecord.uid}`).set({
    email, teams,
    teamId: FieldValue.delete(),
    role: isExistingAdmin ? 'admin' : FieldValue.delete(),
  }, { merge: true });

  // Naast "created" ook teruggeven of dit account al een wachtwoord heeft: een eerdere poging
  // kan het account wél hebben aangemaakt maar de wachtwoord-mail (client-side, zie hierboven)
  // toen niet succesvol verstuurd - zonder deze vlag zou een latere poging "created: false"
  // teruggeven en de mail dan stilzwijgend overslaan, terwijl er nog steeds geen wachtwoord
  // op het account staat.
  const hasPassword = userRecord.providerData.some(p => p.providerId === 'password');
  return { uid: userRecord.uid, created, hasPassword };
});

// Anyone (including logged-out visitors) may refresh a team's standings - it's public,
// read-only data. The LISA credential it needs (teams/{teamId}/config/lisa) is only
// Firestore-readable by that team's own members though, so this has to fetch server-side
// with the Admin SDK rather than the client doing the LISA call itself. Writes only the
// two standings fields via update() (not the full state/public doc), so this can never
// clobber players/fixtures/match/etc. even under a race with someone else editing them.
exports.refreshTeamStandings = onCall(async (request) => {
  const teamId = String((request.data || {}).teamId || '').trim();
  if (!teamId) throw new HttpsError('invalid-argument', 'Team is verplicht.');

  const lisaSnap = await admin.firestore().doc(`teams/${teamId}/config/lisa`).get();
  if (!lisaSnap.exists) throw new HttpsError('failed-precondition', 'Geen koppeling met de clubwebsite voor dit team.');
  const { clubDudaId, teamId: lisaTeamId, authHeader } = lisaSnap.data();

  let res;
  try {
    const url = `https://api.lisahockey.nl/v1/duda/${clubDudaId}/teams/${lisaTeamId}/poules`;
    res = await fetch(url, { headers: { authorization: authHeader, accept: '*/*' } });
  } catch (err) {
    throw new HttpsError('internal', 'Stand ophalen mislukt.');
  }
  if (!res.ok) throw new HttpsError('internal', 'Stand ophalen mislukt (http ' + res.status + ').');
  const data = await res.json();
  const standings = data.teams || [];
  if (!standings.length) throw new HttpsError('not-found', 'Geen stand gevonden.');

  const standingsUpdatedAt = new Date().toISOString();
  await admin.firestore().doc(`teams/${teamId}/state/public`).update({ standings, standingsUpdatedAt });

  return { standings, standingsUpdatedAt };
});

// Mirrors roleFor()/isTeamMember() in firestore.rules - duplicated here because Admin SDK
// calls bypass security rules, so this function has to enforce the same "coach or admin of
// this team, not manager" check itself before touching per-player attendance data.
async function isTeamMemberServerSide(uid, teamId) {
  if (!uid) return false;
  const userSnap = await admin.firestore().doc(`users/${uid}`).get();
  if (!userSnap.exists) return false;
  const u = userSnap.data() || {};
  if (u.role === 'admin') return true;
  const teams = u.teams || {};
  const role = Object.keys(teams).length ? teams[teamId] : (u.teamId === teamId ? u.role : null);
  return role != null && role !== 'manager';
}

// Local YYYY-MM-DD in Europe/Amsterdam, not a naive UTC slice - a late-evening UTC timestamp
// can fall on the next local day (and CET/CEST means the offset isn't a fixed +1/+2 to just
// hardcode), so this needs real timezone-aware formatting.
function amsterdamDateKey(isoString) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date(isoString));
}

// Personal aanwezigheid (mijn.lisahockey.nl) - a different, "my"-scoped LISA API from the
// club-website one above (api.lisahockey.nl/api/v1/my/... vs .../v1/duda/...), reached only
// via a personally-logged-in coach's session, not the club's public auth-header. Unlike
// standings this is restricted to team members: it's per-player presence data about minors,
// not public information, so both the fetch (needs the personal token, never exposed to the
// client - see teams/{teamId}/config/lisa) and the resulting cache
// (teams/{teamId}/state/attendance) stay server-side/team-only.
exports.refreshTeamAttendance = onCall(async (request) => {
  const teamId = String((request.data || {}).teamId || '').trim();
  if (!teamId) throw new HttpsError('invalid-argument', 'Team is verplicht.');

  const callerUid = request.auth && request.auth.uid;
  if (!(await isTeamMemberServerSide(callerUid, teamId))) {
    throw new HttpsError('permission-denied', 'Alleen een coach of beheerder van dit team mag dit ophalen.');
  }

  // lisaTeamId (which LISA team to filter matches on) comes from the ordinary, coach-readable
  // config/lisa doc, which also gives us clubDudaId - the same LISA club-guid mijn.lisahockey.nl
  // itself uses (confirmed 2026-09-04: identical to myClubId captured from a live "my" request),
  // so it doubles as the lookup key for the club-wide mijn.lisahockey.nl credential below.
  const lisaSnap = await admin.firestore().doc(`teams/${teamId}/config/lisa`).get();
  if (!lisaSnap.exists) throw new HttpsError('failed-precondition', 'Geen koppeling met de clubwebsite voor dit team.');
  const { clubDudaId, teamId: lisaTeamId } = lisaSnap.data();
  if (!clubDudaId) throw new HttpsError('failed-precondition', 'Geen koppeling met de clubwebsite voor dit team.');

  // The personal mijn.lisahockey.nl token lives in lisaClubs/{clubDudaId}/config/lisaMy - one
  // doc per club (not per team, unlike config/lisa above), since the token itself is already
  // club-wide (it can see every team of the club, confirmed 2026-09-05 via "Alle teams") and
  // only admin can read/write it (see firestore.rules) - it must never end up somewhere a coach
  // could read it back out.
  const lisaMySnap = await admin.firestore().doc(`lisaClubs/${clubDudaId}/config/lisaMy`).get();
  if (!lisaMySnap.exists) throw new HttpsError('failed-precondition', 'Geen mijn.lisahockey.nl-koppeling voor deze club.');
  const { myFederationId, myAuthBasic, myAuthToken } = lisaMySnap.data();
  if (!myFederationId || !myAuthBasic || !myAuthToken) {
    throw new HttpsError('failed-precondition', 'Geen mijn.lisahockey.nl-koppeling voor deze club.');
  }
  // origin/referer/user-agent: the captured request (2026-09-05) showed
  // Access-Control-Allow-Origin locked to https://mijn.lisahockey.nl - a Cloud Function isn't
  // a browser so nothing sets these automatically, and a bare authorization/token pair alone
  // got a 401, so the backend likely checks origin/referer server-side too, not just via CORS.
  const headers = {
    authorization: myAuthBasic,
    'x-lisa-auth-token': myAuthToken,
    accept: 'application/json',
    origin: 'https://mijn.lisahockey.nl',
    referer: 'https://mijn.lisahockey.nl/',
    'user-agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36',
  };

  let programRes;
  try {
    programRes = await fetch(`https://api.lisahockey.nl/api/v1/my/federations/${myFederationId}/program`, { headers });
  } catch (err) {
    throw new HttpsError('internal', 'Programma ophalen mislukt.');
  }
  if (!programRes.ok) {
    // Tijdelijk: LISA's eigen foutmelding meesturen (i.p.v. alleen de statuscode) om te
    // onderscheiden tussen een echte auth-fout en bv. een Cloudflare-blok op het IP van deze
    // Cloud Function (dezelfde credentials werkten wél vanaf een gewoon IP, getest 2026-09-05).
    const bodyText = await programRes.text().catch(() => '');
    throw new HttpsError('internal', 'Programma ophalen mislukt (http ' + programRes.status + '): ' + bodyText.slice(0, 300));
  }
  const program = await programRes.json();

  // The feed repeats every match once per family/personal relation the logged-in coach has to
  // it (see the raw sample captured 2026-09-05) - dedupe by match id before doing anything else.
  const matchTiles = [];
  const seenMatchIds = new Set();
  for (const tile of program.tiles || []) {
    if (tile.type !== 'match' || !tile.match) continue;
    const m = tile.match;
    // `team_id` on a match tile is always the HOME team's id, not necessarily ours (see
    // 2026-09-05 sample: an away match's team_id was the opponent's id) - check both sides
    // instead, otherwise every away match silently gets filtered out.
    if (m.home_team_id !== lisaTeamId && m.away_team_id !== lisaTeamId) continue;
    if (seenMatchIds.has(m.id)) continue;
    seenMatchIds.add(m.id);
    matchTiles.push(m);
  }

  // Only fetch full per-player detail (the aggregate on /program has no per-player breakdown)
  // for matches whose result isn't in yet - a played match's roster/attendance is no longer
  // actionable for team selection. `result` shows up as either null or {} depending on which
  // duplicate tile it came from (see 2026-09-05 sample) - neither means "played".
  const upcoming = matchTiles.filter(m => !m.result || Object.keys(m.result).length === 0);

  const byKey = {};
  for (const m of upcoming) {
    let tileRes;
    try {
      tileRes = await fetch(`https://api.lisahockey.nl/api/v1/my/clubs/${clubDudaId}/matches/${m.id}/tile`, { headers });
    } catch (err) { continue; }
    if (!tileRes.ok) continue;
    const detail = await tileRes.json();

    // Same date+opponent join key importLisaMatches() already uses for fixtures, so the
    // client can match this cache against teams/{teamId}/state/public.fixtures without a
    // separate id-mapping step. "opponent" here means: from OUR team's side, same convention
    // as importLisaMatches (m.home_team_is_current ? away : home).
    const opponent = m.is_home ? m.away_team_name : m.home_team_name;
    const dateKey = amsterdamDateKey(m.starts_at);
    const key = dateKey + '|' + opponent;

    // "Hooftman Volvo veld 1 " -> "1": pitch/field names carry a sponsor prefix the coach
    // doesn't want repeated in every table (see 2026-09-04 conversation) - keep only the
    // trailing field number, same trim for match and (future) training pitches.
    const fieldMatch = /(\d+)\s*$/.exec((detail.field || '').trim());

    byKey[key] = {
      field: fieldMatch ? fieldMatch[1] : (detail.field || ''),
      meetingTime: (detail.meeting_time || '').slice(0, 5),
      persons: (detail.persons || []).map(p => ({ name: p.member_name, status: p.status })),
    };
  }

  const updatedAt = new Date().toISOString();
  await admin.firestore().doc(`teams/${teamId}/state/attendance`).set({ byFixtureKey: byKey, updatedAt });

  return { byFixtureKey: byKey, updatedAt };
});
