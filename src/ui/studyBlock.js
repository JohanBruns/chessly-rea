// Study im Lernpfad: Kopfleiste „STUDY n Titel“ (öffnet den Linien-Explorer, −/+ klappt ein)
// und darunter der Kachelpfad.
import { h } from '../dom.js';
import { tileStates, XP } from '../progress.js';
import { addXp, isCollapsed, loadState, markVideoWatched, setCollapsed } from '../storage.js';
import { icon } from './icons.js';
import { tilePath } from './tilePath.js';

export function tileHref(course, tile) {
  return `#/course/${encodeURIComponent(course.id)}/tile/${encodeURIComponent(tile.id)}`;
}

export function studyHref(course, study) {
  return `#/course/${encodeURIComponent(course.id)}/study/${encodeURIComponent(study.id)}`;
}

export function studyBlock(course, study, { progress, state, currentTileId, onChange } = {}) {
  const entries = tileStates(study, progress, state);
  const doneCount = entries.filter((e) => e.tile.type !== 'video' && e.status === 'completed').length;
  const total = entries.filter((e) => e.tile.type !== 'video').length;
  let collapsed = isCollapsed(study.id);

  const pathEl = tilePath(entries, {
    current: currentTileId,
    hrefFor: (tile) => (tile.type === 'video' ? study.video : tileHref(course, tile)),
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
      h('span', { class: 'study-badge' }, icon('book', { size: 13 }), `STUDY ${study.index + 1}`),
      h('a', { class: 'study-title', href: studyHref(course, study), title: 'Linien-Explorer öffnen' }, study.title),
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
