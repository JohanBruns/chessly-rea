// Die eigentliche App: Hash-Router für die einzelnen Ansichten. Liegt mit den Kursinhalten im geschützten Teil
// unter /app/, den der Server nur mit gültiger Anmeldung ausliefert (functions/app/[[path]].js).
import { startAccountSync } from './account.js';
import { loadAllCourses } from './courses.js';
import { clear } from './dom.js';
import { applyTheme, initLayout, renderTopbar, setSessionHeader } from './ui/layout.js';
import { renderBot } from './views/botView.js';
import { renderChessly } from './views/chesslyView.js';
import { renderCourse } from './views/courseView.js';
import { renderCourses } from './views/coursesView.js';
import { renderDrillShuffle } from './views/drillShuffleView.js';
import { renderHome } from './views/homeView.js';
import { renderImport } from './views/importView.js';
import { renderProfile } from './views/profileView.js';
import { renderReview } from './views/reviewView.js';
import { renderSettings } from './views/settingsView.js';
import { renderStudyExplorer } from './views/studyExplorerView.js';
import { renderTileSession } from './views/tileView.js';
import { renderVideo } from './views/videoView.js';
import { checkWatchedCourses } from './watchlist.js';

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
  if (view === 'chessly') return ['chessly', () => renderChessly(app, params)];
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
    checkWatchedCourses(loadAllCourses().courses);
  } catch (err) {
    console.warn('Vorgemerkte Kurse konnten nicht geprüft werden:', err);
  }

  try {
    cleanup = render() || null;
  } catch (err) {
    console.error(err);
    app.textContent = `Fehler: ${err.message}`;
  }
  window.scrollTo(0, 0);
}

export function startApp(account) {
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
