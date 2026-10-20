// Import neuer Eröffnungen: Lichess-Studie per Link, PGN-Datei oder eingefügter Text.
import { buildCourse, slugify } from '../courseLoader.js';
import { loadAllCourses } from '../courses.js';
import { h, clear, colorLabel } from '../dom.js';
import { saveImportedCourse } from '../storage.js';

// https://lichess.org/study/AbCdEfGh oder .../study/AbCdEfGh/ChapterId
export function lichessStudyUrl(input) {
  const m = input.trim().match(/lichess\.org\/study\/([A-Za-z0-9]{8})(?:\/([A-Za-z0-9]{8}))?/);
  if (!m) return null;
  return m[2] ? `https://lichess.org/api/study/${m[1]}/${m[2]}.pgn` : `https://lichess.org/api/study/${m[1]}.pgn`;
}

export function renderImport(root) {
  let pgnText = '';
  let parsed = null;

  const urlInput = h('input', { type: 'url', class: 'input', placeholder: 'https://lichess.org/study/…' });
  const fileInput = h('input', { type: 'file', accept: '.pgn,text/plain', class: 'input' });
  const textArea = h('textarea', { class: 'input pgn-input', rows: 10, placeholder: '[Event "Meine Eröffnung"]\n[Orientation "white"]\n\n1. d4 {Erklärung} d5 2. Bf4 (2. c4) *' });
  const nameInput = h('input', { type: 'text', class: 'input', placeholder: 'Kursname' });
  const colorSelect = h(
    'select',
    { class: 'input' },
    h('option', { value: '' }, 'Automatisch (aus PGN)'),
    h('option', { value: 'w' }, 'Ich spiele Weiß'),
    h('option', { value: 'b' }, 'Ich spiele Schwarz'),
  );
  const statusEl = h('div', { class: 'import-status' });
  const importBtn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => doImport() }, 'Kurs importieren');

  function setStatus(type, ...content) {
    clear(statusEl).append(h('div', { class: ['feedback-msg', type] }, ...content));
  }

  function analyse() {
    importBtn.disabled = true;
    parsed = null;
    if (!pgnText.trim()) {
      clear(statusEl);
      return;
    }
    try {
      const course = buildCourse({ pgn: pgnText, name: nameInput.value.trim() || undefined, color: colorSelect.value || undefined, source: 'imported' });
      if (!nameInput.value.trim()) nameInput.value = course.name;
      parsed = course;
      const exists = loadAllCourses().courses.find((c) => c.id === course.id);
      setStatus(
        exists && exists.source === 'builtin' ? 'warn' : 'good',
        `✓ ${course.chapters.length} Kapitel, ${course.lines.length} Linien erkannt – du spielst ${colorLabel(course.color)}.`,
        exists ? h('div', {}, exists.source === 'builtin' ? '⚠ Ein mitgelieferter Kurs heißt genauso – bitte einen anderen Namen wählen.' : 'Ein importierter Kurs mit diesem Namen wird ersetzt (Lernstand bleibt).') : null,
      );
      importBtn.disabled = !course.lines.length || (exists && exists.source === 'builtin');
    } catch (err) {
      setStatus('bad', `✗ ${err.message}`);
    }
  }

  async function loadFromLichess() {
    const url = lichessStudyUrl(urlInput.value);
    if (!url) {
      setStatus('bad', 'Das ist kein gültiger Link zu einer Lichess-Studie.');
      return;
    }
    setStatus('info', 'Lade Studie von Lichess …');
    try {
      const res = await fetch(url, { headers: { Accept: 'application/x-chess-pgn' } });
      if (!res.ok) throw new Error(res.status === 404 ? 'Studie nicht gefunden oder privat.' : `HTTP ${res.status}`);
      pgnText = await res.text();
      textArea.value = pgnText;
      nameInput.value = '';
      analyse();
    } catch (err) {
      setStatus('bad', `Laden fehlgeschlagen: ${err.message} – Alternative: Auf Lichess in der Studie „Teilen → PGN herunterladen“ und die Datei hier hochladen.`);
    }
  }

  function doImport() {
    if (!parsed) return;
    const name = nameInput.value.trim() || parsed.name;
    const ok = saveImportedCourse({ id: slugify(name), name, color: colorSelect.value || null, pgn: pgnText, addedAt: Date.now() });
    if (!ok) {
      setStatus('bad', 'Speichern fehlgeschlagen – der Browser-Speicher ist voll oder gesperrt. Lege die PGN stattdessen in den Ordner openings/.');
      return;
    }
    loadAllCourses({ refresh: true });
    location.hash = `#/course/${encodeURIComponent(slugify(name))}`;
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    pgnText = await file.text();
    textArea.value = pgnText;
    nameInput.value = '';
    analyse();
  });
  textArea.addEventListener('input', () => {
    pgnText = textArea.value;
    analyse();
  });
  nameInput.addEventListener('change', analyse);
  colorSelect.addEventListener('change', analyse);

  root.append(
    h('a', { class: 'link-muted', href: '#/' }, '← Alle Kurse'),
    h(
      'section',
      { class: 'card' },
      h('h1', {}, 'Eröffnung hinzufügen'),
      h(
        'p',
        { class: 'muted' },
        'Jede PGN-Partie wird ein Kapitel, jede Variante darin eine eigene Linie. Kommentare in {geschweiften Klammern} werden im Lernmodus als Erklärung angezeigt, Lichess-Pfeile ([%cal …]) als Pfeile auf dem Brett.',
      ),
      h('h3', {}, '1. Lichess-Studie'),
      h('div', { class: 'row' }, urlInput, h('button', { class: 'btn', onclick: loadFromLichess }, 'Laden')),
      h('h3', {}, '2. oder PGN-Datei'),
      fileInput,
      h('h3', {}, '3. oder PGN einfügen'),
      textArea,
      h('div', { class: 'form-grid' }, h('label', {}, 'Kursname', nameInput), h('label', {}, 'Meine Farbe', colorSelect)),
      statusEl,
      h('div', { class: 'row' }, importBtn),
    ),
    h(
      'section',
      { class: 'card muted small' },
      h('strong', {}, 'Dauerhaft & für alle Browser: '),
      'Lege die .pgn-Datei in den Projektordner ',
      h('code', {}, 'openings/'),
      ' – sie wird beim nächsten Neuladen automatisch als Kurs erkannt. Kursname und Farbe kommen aus den Headern ',
      h('code', {}, '[Course "…"]'),
      ' und ',
      h('code', {}, '[Orientation "white|black"]'),
      '.',
    ),
  );
  return () => {};
}
