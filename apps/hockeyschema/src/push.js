import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from './firebase.js';

// Belangrijke beperking: op iPhone/iPad staat Apple Web Push alleen toe vanuit een site die via
// "Zet op beginscherm" als app is geïnstalleerd (sinds iOS 16.4) - gewoon in Safari geopend werkt
// dit niet. subscribeToPush hieronder faalt dan stil (isSupported()/getToken() geven geen
// bruikbaar resultaat); de aanroepende UI-knop legt deze beperking aan de gebruiker uit.
let messagingPromise = null;
function getMessagingInstance() {
  if (!messagingPromise) {
    messagingPromise = isSupported().then(ok => (ok ? getMessaging() : null));
  }
  return messagingPromise;
}

// Vraagt meldingstoestemming, registreert de achtergrond-service-worker (met de Firebase-config
// als query string, zie firebase-messaging-sw.js) en slaat het resulterende apparaat-token op
// onder teams/{teamId}/pushTokens/{token} - de Cloud Function onGoalScored (functions/index.js)
// stuurt daar bij elk eigen doelpunt een pushmelding naartoe. Geeft 'granted', 'denied' of
// 'unsupported' terug zodat de aanroepende knop een passende melding kan tonen.
export async function subscribeToPush(teamId) {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }
  const messaging = await getMessagingInstance();
  if (!messaging) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;

  try {
    const qs = new URLSearchParams(firebaseConfig).toString();
    const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs}`);
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return 'unsupported';
    await setDoc(doc(db, 'teams', teamId, 'pushTokens', token), { token, createdAt: new Date().toISOString() });
    return 'granted';
  } catch {
    return 'unsupported';
  }
}
