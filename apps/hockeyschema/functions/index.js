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

  // Never downgrade an existing admin to coach/manager just because their email got added
  // to a team here - an admin's role is untouchable through this call, everyone else's role
  // is whatever the caller picked (coach or manager), even on an already-linked account.
  const existingSnap = created ? null : await admin.firestore().doc(`users/${userRecord.uid}`).get();
  const existingRole = existingSnap && existingSnap.exists ? existingSnap.data().role : null;
  const role = existingRole === 'admin' ? 'admin' : requestedRole;

  await admin.firestore().doc(`users/${userRecord.uid}`).set({ email, teamId, role }, { merge: true });

  return { uid: userRecord.uid, created };
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
