// Einstieg: Hash-Router für die einzelnen Ansichten.
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './styles.css';

import { clear } from './dom.js';
import { renderCourse } from './views/courseView.js';
import { renderHome } from './views/homeView.js';
import { renderImport } from './views/importView.js';
import { renderSettings } from './views/settingsView.js';
import { renderTrainer } from './views/trainerView.js';

const app = document.getElementById('app');
let cleanup = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { parts, params };
}

function route() {
  if (cleanup) cleanup();
  cleanup = null;
  clear(app);
  const { parts, params } = parseHash();
  const view = parts[0] || '';
  document.body.dataset.view = view || 'home';

  try {
    if (view === 'course' && parts[1]) cleanup = renderCourse(app, { id: parts[1] });
    else if (view === 'train') cleanup = renderTrainer(app, params);
    else if (view === 'import') cleanup = renderImport(app);
    else if (view === 'settings') cleanup = renderSettings(app);
    else cleanup = renderHome(app);
  } catch (err) {
    console.error(err);
    app.textContent = `Fehler: ${err.message}`;
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();
