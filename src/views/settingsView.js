// Einstellungen + Sicherung des Lernstands (Export/Import als JSON).
import { loadAllCourses } from '../courses.js';
import { h } from '../dom.js';
import { exportBackup, importBackup, loadSettings, saveSettings } from '../storage.js';

export function renderSettings(root) {
  const settings = loadSettings();
  const update = (key, value) => {
    settings[key] = value;
    saveSettings(settings);
  };

  const numberField = (label, key, min, max, step = 1, hint = '') =>
    h(
      'label',
      { class: 'setting' },
      h('span', {}, label, hint ? h('small', { class: 'muted' }, ` ${hint}`) : null),
      h('input', { type: 'number', class: 'input input-sm', min, max, step, value: settings[key], onchange: (e) => update(key, Math.min(max, Math.max(min, Number(e.target.value) || min))) }),
    );
  const toggle = (label, key) =>
    h('label', { class: 'setting' }, h('span', {}, label), h('input', { type: 'checkbox', checked: settings[key], onchange: (e) => update(key, e.target.checked) }));

  const backupInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    class: 'input',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        importBackup(await file.text());
        loadAllCourses({ refresh: true });
        alert('Sicherung wiederhergestellt.');
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

  root.append(
    h('a', { class: 'link-muted', href: '#/' }, '← Alle Kurse'),
    h(
      'section',
      { class: 'card' },
      h('h1', {}, 'Einstellungen'),
      numberField('Neue Linien pro Lerneinheit', 'newLinesPerSession', 1, 30),
      numberField('Verzögerung der Gegnerzüge', 'opponentDelay', 0, 3000, 50, '(ms)'),
      numberField('Hinweis automatisch nach', 'hintAfterMistakes', 1, 10, 1, '(Fehlern)'),
      toggle('Koordinaten am Brett', 'showCoordinates'),
      toggle('Töne', 'sound'),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Sicherung'),
      h('p', { class: 'muted' }, 'Der Lernstand und importierte Kurse liegen nur in diesem Browser. Exportiere regelmäßig eine Sicherung, um sie zu übertragen oder nicht zu verlieren.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: download }, 'Sicherung herunterladen')),
      h('label', { class: 'setting' }, h('span', {}, 'Sicherung wiederherstellen'), backupInput),
    ),
  );
  return () => {};
}
