// Einstellungen: Brettfarben, Design, Training, Fortschritt pro Kurs zurücksetzen, Sicherung.
import { loadAllCourses } from '../courses.js';
import { add, clear, fill, h } from '../dom.js';
import { courseProgress } from '../progress.js';
import { exportBackup, importBackup, loadProgress, loadSettings, loadState, resetCourseProgress, saveSettings } from '../storage.js';
import { courseIcon } from '../ui/courseIcon.js';
import { icon } from '../ui/icons.js';
import { applyTheme, renderTopbar } from '../ui/layout.js';
import { toast } from '../ui/toast.js';

const BOARD_THEMES = [
  { id: 'brown', label: 'Braun', light: '#f0d9b5', dark: '#b58863' },
  { id: 'blue', label: 'Blau', light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'green', label: 'Grün', light: '#ffffdd', dark: '#86a666' },
];

export function renderSettings(root) {
  const settings = loadSettings();
  const update = (key, value) => {
    settings[key] = value;
    saveSettings(settings);
    applyTheme(settings);
  };

  const boardEl = h('div', { class: 'swatches' });
  const renderBoards = () =>
    fill(
      boardEl,
      ...BOARD_THEMES.map((t) =>
        h(
          'button',
          { class: ['swatch', settings.boardTheme === t.id ? 'active' : ''], 'aria-pressed': String(settings.boardTheme === t.id), onclick: () => (update('boardTheme', t.id), renderBoards()) },
          h('span', { class: 'swatch-board', style: { '--l': t.light, '--d': t.dark } }),
          h('span', {}, t.label),
        ),
      ),
    );
  renderBoards();

  const themeEl = h('div', { class: 'segmented' });
  const renderTheme = () =>
    fill(
      themeEl,
      ...[
        ['dark', 'moon', 'Dunkel'],
        ['light', 'sun', 'Hell'],
      ].map(([id, iconName, label]) =>
        h('button', { class: settings.theme === id ? 'active' : '', onclick: () => (update('theme', id), renderTheme(), renderTopbar()) }, icon(iconName, { size: 18 }), label),
      ),
    );
  renderTheme();

  const numberField = (label, key, min, max, step = 1, hint = '') =>
    h(
      'label',
      { class: 'setting' },
      h('span', {}, label, hint ? h('small', { class: 'muted' }, ` ${hint}`) : null),
      h('input', { type: 'number', class: 'input input-sm', min, max, step, value: settings[key], onchange: (e) => update(key, Math.min(max, Math.max(min, Number(e.target.value) || min))) }),
    );
  const toggle = (label, key) =>
    h(
      'label',
      { class: 'setting switch-row' },
      h('span', {}, label),
      h('input', { type: 'checkbox', checked: settings[key], onchange: (e) => update(key, e.target.checked) }),
      h('span', { class: 'switch' }, h('span', { class: 'switch-knob' })),
    );

  const coursesEl = h('div', { class: 'reset-list' });
  const renderCourses = () => {
    const progress = loadProgress();
    const state = loadState();
    fill(
      coursesEl,
      ...loadAllCourses().courses.map((course) => {
        const pct = courseProgress(course, progress, state).percent;
        return h(
          'div',
          { class: 'reset-row' },
          courseIcon(course, { size: 36 }),
          h('div', { class: 'reset-info' }, h('strong', {}, course.name), h('span', { class: 'muted small' }, `${pct}% abgeschlossen`)),
          h(
            'button',
            {
              class: 'btn btn-ghost btn-sm',
              disabled: pct === 0 && !state.started[course.id],
              onclick: () => {
                if (!confirm(`Fortschritt für „${course.name}“ wirklich zurücksetzen? Gelernte Varianten und abgeschlossene Kacheln gehen verloren (XP bleiben).`)) return;
                resetCourseProgress(course.id);
                toast(`Fortschritt für „${course.name}“ zurückgesetzt.`);
                renderCourses();
              },
            },
            'Zurücksetzen',
          ),
        );
      }),
    );
  };
  renderCourses();

  const backupInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    class: 'visually-hidden',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        importBackup(await file.text());
        loadAllCourses({ refresh: true });
        applyTheme();
        toast('Sicherung wiederhergestellt.', { type: 'good' });
        location.hash = '#/';
      } catch (err) {
        alert(`Wiederherstellen fehlgeschlagen: ${err.message}`);
      }
    },
  });

  function download() {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `chessly-rea-backup-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  add(
    root,
    h(
      'div',
      { class: 'page narrow' },
      h('div', { class: 'page-head' }, h('div', { class: 'page-icon' }, icon('gear', { size: 26 })), h('div', {}, h('h1', {}, 'Einstellungen'))),
      h('section', { class: 'card' }, h('h2', {}, 'Brett'), boardEl, toggle('Koordinaten am Brett', 'showCoordinates')),
      h('section', { class: 'card' }, h('h2', {}, 'Design'), themeEl),
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Training'),
        numberField('Verzögerung der Gegnerzüge', 'opponentDelay', 0, 3000, 50, '(ms)'),
        numberField('Lösung automatisch nach', 'hintAfterMistakes', 1, 10, 1, '(Fehlern)'),
        numberField('Stockfish-Stärke', 'engineSkill', 0, 20, 1, '(0–20)'),
        toggle('Töne', 'sound'),
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Fortschritt pro Kurs'),
        h('p', { class: 'muted small' }, 'Setzt Lernpfad und Wiederholungen eines Kurses zurück. XP und Streak bleiben erhalten.'),
        coursesEl,
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Sicherung'),
        h('p', { class: 'muted small' }, 'Lernstand, XP und importierte Kurse liegen nur in diesem Browser. Exportiere regelmäßig eine Sicherung, um sie zu übertragen oder nicht zu verlieren.'),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn btn-primary', onclick: download }, icon('download', { size: 18 }), 'Sicherung herunterladen'),
          h('label', { class: 'btn btn-ghost' }, icon('upload', { size: 18 }), 'Sicherung wiederherstellen', backupInput),
        ),
      ),
    ),
  );
  return null;
}
