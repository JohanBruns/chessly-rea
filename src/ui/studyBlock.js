// Study im Lernpfad: Kopfleiste „STUDY n Titel“ (öffnet den Linien-Explorer, −/+ klappt ein)
// und darunter der Kachelpfad.
import { h } from '../dom.js';
import { countsTile, tileStates, XP } from '../progress.js';
import { addXp, isCollapsed, loadState, markVideoWatched, setCollapsed } from '../storage.js';
import { icon } from './icons.js';
import { tilePath } from './tilePath.js';

// Video-Kacheln öffnen das Video (in Video-Kursen ist das die „nächste Kachel“), alle anderen die Übung.
export function tileHref(course, tile) {
  if (tile.type === 'video') {
    const study = course.studies.find((s) => s.id === tile.studyId);
    if (study?.video) return studyVideoHref(course, study);
  }
  return `#/course/${encodeURIComponent(course.id)}/tile/${encodeURIComponent(tile.id)}`;
}

// Lokale Videos (z. B. "/downloader/downloads/Kurs/01-01 Name.mp4") enthalten Leerzeichen, & usw.
// und werden deshalb codiert; vollständige URLs bleiben unverändert.
export function videoHref(video) {
  return /^[a-z]+:\/\//i.test(video) ? video : encodeURI(video).replace(/#/g, '%23');
}

// Videodateien spielt die App in einer eigenen Ansicht ab, andere Links (z. B. YouTube) öffnen extern.
export function isVideoFile(video) {
  return !/^[a-z]+:\/\//i.test(video) || /\.(mp4|m4v|mov|webm)([?#]|$)/i.test(video);
}

export function studyVideoHref(course, study) {
  if (!isVideoFile(study.video)) return videoHref(study.video);
  return `#/course/${encodeURIComponent(course.id)}/video/${encodeURIComponent(study.id)}`;
}

export function studyHref(course, study) {
  return `#/course/${encodeURIComponent(course.id)}/study/${encodeURIComponent(study.id)}`;
}

export function studyBlock(course, study, { progress, state, currentTileId, onChange } = {}) {
  const entries = tileStates(study, progress, state);
  const doneCount = entries.filter((e) => countsTile(course, e.tile) && e.status === 'completed').length;
  const total = entries.filter((e) => countsTile(course, e.tile)).length;
  let collapsed = isCollapsed(study.id);

  const pathEl = tilePath(entries, {
    current: currentTileId,
    hrefFor: (tile) => (tile.type === 'video' ? studyVideoHref(course, study) : tileHref(course, tile)),
  });
  pathEl.addEventListener('click', (e) => {
    const link = e.target.closest('[data-tile]');
    if (!link) return;
    const tile = study.tiles.find((t) => t.id === link.dataset.tile);
    if (tile?.type === 'video') {
      if (!loadState().videos[study.id]) addXp(XP.video);
      markVideoWatched(study.id);
      onChange?.();
    }
  });

  const toggleBtn = h('button', { class: 'icon-btn study-toggle', 'aria-label': 'Study ein- oder ausklappen' });
  const body = h('div', { class: 'study-body' }, pathEl);
  const block = h(
    'section',
    { class: ['study-block', collapsed ? 'collapsed' : ''], 'data-study': study.id },
    h(
      'header',
      { class: 'study-head' },
      h('span', { class: 'study-badge' }, icon(course.videoOnly ? 'play' : 'book', { size: 13 }), `${course.videoOnly ? 'VIDEO' : 'STUDY'} ${study.index + 1}`),
      // Im Video-Kurs gibt es keine Linien zu erkunden – der Titel öffnet das Video.
      course.videoOnly
        ? h('a', { class: 'study-title', href: studyVideoHref(course, study), title: 'Video ansehen' }, study.title)
        : h('a', { class: 'study-title', href: studyHref(course, study), title: 'Linien-Explorer öffnen' }, study.title),
      h('span', { class: ['study-count', doneCount === total ? 'done' : ''] }, `${doneCount}/${total}`),
      toggleBtn,
    ),
    body,
  );
  const renderToggle = () => {
    toggleBtn.replaceChildren(icon(collapsed ? 'plus' : 'minus', { size: 14, strokeWidth: 3 }));
    block.classList.toggle('collapsed', collapsed);
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
  };
  toggleBtn.addEventListener('click', () => {
    collapsed = !collapsed;
    setCollapsed(study.id, collapsed);
    renderToggle();
  });
  renderToggle();
  return block;
}
