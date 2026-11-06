// Einstieg: zeigt die Anmeldeseite oder lädt die eigentliche App (app.js) nach. Dieser Teil ist öffentlich und darf
// keine Kursinhalte enthalten; scripts/checkPrivateBundle.js bricht den Build sonst ab. Alles, was an courses.js
// oder den Ansichten hängt, gehört deshalb in app.js.
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './styles.css';

import { currentAccount, sessionLost } from './account.js';
import { useAccountStorage } from './storage.js';
import { applyTheme } from './ui/theme.js';
import { renderLogin, resetTokenFromHash } from './views/loginView.js';

const app = document.getElementById('app');

function showLogin(resetToken) {
  document.body.dataset.view = 'login';
  applyTheme();
  renderLogin(app, resetToken);
}

async function startApp(account) {
  useAccountStorage(account);
  applyTheme();
  app.textContent = 'Lädt …';
  let module;
  try {
    module = await import('./app.js');
  } catch (err) {
    console.error(err);
    if (await sessionLost()) location.reload();
    else app.textContent = 'Die App konnte nicht geladen werden. Prüfe deine Internetverbindung und öffne sie noch einmal.';
    return;
  }
  module.startApp(account);
}

// iOS ignoriert user-scalable=no; ohne das zoomt ein versehentlicher Griff mit zwei Fingern die App
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Der lokale Dev-Server (start.cmd) hat keine Server-Funktionen: Dort läuft die App ohne Konto wie bisher.
const accountsEnabled = import.meta.env.PROD;
const account = accountsEnabled ? currentAccount() : null;
// Der Passwort-Link geht vor: Auf diesem Gerät kann noch eine andere Anmeldung gespeichert sein
const resetToken = accountsEnabled ? resetTokenFromHash() : null;

if (accountsEnabled && (!account || resetToken)) showLogin(resetToken);
else startApp(account);

// Link in einen schon offenen Tab eingefügt: Nur das # ändert sich, die Seite lädt also nicht von selbst neu
if (accountsEnabled) {
  window.addEventListener('hashchange', () => {
    if (resetTokenFromHash()) location.reload();
  });
}

// Offline-Fähigkeit nur im fertigen Build; im Dev-Server würde der Cache alte Module ausliefern
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service Worker nicht registriert:', err));
}
