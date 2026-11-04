// Theme und Brettfarben. Eigene Datei, weil auch die öffentliche Anmeldeseite sie braucht.
import { loadSettings } from '../storage.js';

export function applyTheme(settings = loadSettings()) {
  document.documentElement.dataset.theme = settings.theme === 'light' ? 'light' : 'dark';
  document.body.dataset.board = settings.boardTheme || 'brown';
}
