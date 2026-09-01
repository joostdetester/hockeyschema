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
  if (!EMAIL_RE.test(email)) throw new HttpsError('invalid-argument', 'Ongeldig e-mailadres.');
  if (!teamId) throw new HttpsError('invalid-argument', 'Team is verplicht.');

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

  // Never downgrade an existing admin to coach just because their email got added to a
  // team here - only the role of a brand-new account is actually decided by this call.
  const existingSnap = created ? null : await admin.firestore().doc(`users/${userRecord.uid}`).get();
  const existingRole = existingSnap && existingSnap.exists ? existingSnap.data().role : null;
  const role = existingRole === 'admin' ? 'admin' : 'coach';

  await admin.firestore().doc(`users/${userRecord.uid}`).set({ email, teamId, role }, { merge: true });

  return { uid: userRecord.uid, created };
});
