// Achtergrond-handler voor doelpuntmeldingen via Firebase Cloud Messaging - vangt pushes op
// terwijl deze pagina niet open/actief is (vergrendeld scherm, andere app op de voorgrond, tab
// dicht), en toont ze als systeemmelding. Een voorgrondmelding (pagina wél open) gaat niet via
// dit bestand, maar via de gewone in-pagina banner/geluid in App.jsx.
//
// Dit is een los, statisch bestand onder public/ - het kan dus niet bij import.meta.env (dat
// bestaat alleen in de gebundelde app-code). push.js registreert deze worker daarom met de
// Firebase-config als query string (?apiKey=...&projectId=...), zodat één bestand voor
// test/acceptatie/productie werkt zonder dat er per omgeving een aparte versie gebouwd hoeft te
// worden.
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js');

const params = new URL(location.href).searchParams;
firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'HCRB', {
    body: body || '',
    icon: '/hcrb.png',
    badge: '/hcrb.png',
    tag: 'hcrb-goal',
    data: payload.data || {},
  });
});

// Bij een klik op de melding: naar Live als de wedstrijd nog bezig was, anders naar het
// bijbehorende wedstrijdverslag (indien al opgeslagen), anders naar de algemene
// Wedstrijdverslagen-pagina - zie de data die onGoalScored (functions/index.js) meestuurt, en de
// diep-link-afhandeling (?team=&tab=&report=) in App.jsx. Navigeert een al open tab i.p.v. steeds
// een nieuwe te openen, zodat iemand die de site al open heeft staan niet met twee tabbladen
// eindigt.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const params = new URLSearchParams();
  if (data.teamId) params.set('team', data.teamId);
  if (data.tab) params.set('tab', data.tab);
  if (data.report) params.set('report', data.report);
  const qs = params.toString();
  const url = self.registration.scope + (qs ? '?' + qs : '');
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
