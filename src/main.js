// Einstieg: Hash-Router für die einzelnen Ansichten.
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './styles.css';

import { currentAccount, startAccountSync } from './account.js';
import { loadAllCourses } from './courses.js';
import { clear } from './dom.js';
import { useAccountStorage } from './storage.js';
import { applyTheme, initLayout, renderTopbar, setSessionHeader } from './ui/layout.js';
import { renderBot } from './views/botView.js';
import { renderCourse } from './views/courseView.js';
import { renderCourses } from './views/coursesView.js';
import { renderDrillShuffle } from './views/drillShuffleView.js';
import { renderHome } from './views/homeView.js';
import { renderImport } from './views/importView.js';
import { renderLogin } from './views/loginView.js';
import { renderProfile } from './views/profileView.js';
import { renderReview } from './views/reviewView.js';
import { renderSettings } from './views/settingsView.js';
import { renderStudyExplorer } from './views/studyExplorerView.js';
import { renderTileSession } from './views/tileView.js';
import { renderVideo } from './views/videoView.js';

const app = document.getElementById('app');
let cleanup = null;

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { parts, params };
}

function resolve(parts, params) {
  const [view, id, sub, subId] = parts;
  if (view === 'course' && id && sub === 'tile' && subId) return ['session', () => renderTileSession(app, { courseId: id, tileId: subId })];
  if (view === 'course' && id && sub === 'study' && subId) return ['explorer', () => renderStudyExplorer(app, { courseId: id, studyId: subId })];
  if (view === 'course' && id && sub === 'video' && subId) return ['video', () => renderVideo(app, { courseId: id, studyId: subId })];
  if (view === 'course' && id) return ['course', () => renderCourse(app, { id, params })];
  if (view === 'courses') return ['courses', () => renderCourses(app, params)];
  if (view === 'review') return ['review', () => renderReview(app, params)];
  if (view === 'drill') return ['drill', () => renderDrillShuffle(app, params)];
  if (view === 'bot') return ['bot', () => renderBot(app, params)];
  if (view === 'profile') return ['profile', () => renderProfile(app)];
  if (view === 'settings') return ['settings', () => renderSettings(app)];
  if (view === 'import') return ['import', () => renderImport(app)];
  return ['home', () => renderHome(app)];
}

function route() {
  if (cleanup) cleanup();
  cleanup = null;
  clear(app);
  setSessionHeader(null);
  const { parts, params } = parseHash();
  const [name, render] = resolve(parts, params);
  document.body.dataset.view = name;
  renderTopbar();

  try {
    cleanup = render() || null;
  } catch (err) {
    console.error(err);
    app.textContent = `Fehler: ${err.message}`;
  }
  window.scrollTo(0, 0);
}

// Der lokale Dev-Server (start.cmd) hat keine Server-Funktionen: Dort läuft die App ohne Konto wie bisher.
const accountsEnabled = import.meta.env.PROD;
const account = accountsEnabled ? currentAccount() : null;

if (accountsEnabled && !account) {
  document.body.dataset.view = 'login';
  applyTheme();
  renderLogin(app);
} else {
  useAccountStorage(account);
  initLayout();
  window.addEventListener('hashchange', route);
  route();
  if (account) {
    startAccountSync(() => {
      loadAllCourses({ refresh: true });
      // Nur Übersichten neu aufbauen: Eine laufende Variante, Bot-Partie oder ein Video darf nicht abbrechen
      if (!['home', 'courses', 'course', 'profile'].includes(document.body.dataset.view)) return;
      applyTheme();
      route();
    });
  }
}

// Offline-Fähigkeit nur im fertigen Build; im Dev-Server würde der Cache alte Module ausliefern
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service Worker nicht registriert:', err));
}
