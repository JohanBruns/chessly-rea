// Profil: Name, XP, Level, Streak mit Wochenleiste, persönliche Wochenliga und Kursfortschritt.
import { lineStats, loadAllCourses } from '../courses.js';
import { add, h } from '../dom.js';
import { courseProgress, LEAGUES, levelInfo, streakInfo, weeklyLeague, xpLastDays } from '../progress.js';
import { loadProgress, loadSettings, loadState, loadXp, saveSettings } from '../storage.js';
import { avatar, courseIcon } from '../ui/courseIcon.js';
import { icon } from '../ui/icons.js';
import { renderTopbar } from '../ui/layout.js';
import { xpChart } from '../ui/xpChart.js';

export function renderProfile(root) {
  const settings = loadSettings();
  const xp = loadXp();
  const level = levelInfo(xp.total);
  const streak = streakInfo(xp.byDay);
  const league = weeklyLeague(xp.byDay);
  const { courses } = loadAllCourses();
  const progress = loadProgress();
  const state = loadState();
  const all = lineStats(
    courses.flatMap((c) => c.lines),
    progress,
  );
  const bestDay = Math.max(0, ...Object.values(xp.byDay));

  const nameInput = h('input', {
    class: 'input name-input',
    value: settings.name,
    maxlength: 30,
    'aria-label': 'Name',
    onchange: (e) => {
      const name = e.target.value.trim() || 'Schachfreund';
      saveSettings({ ...loadSettings(), name });
      renderTopbar();
      root.querySelector('.profile-avatar').replaceChildren(avatar(name, { size: 72 }));
    },
  });

  const stat = (iconName, value, label) => h('div', { class: 'stat' }, icon(iconName, { size: 20 }), h('strong', {}, value), h('span', { class: 'muted small' }, label));

  add(
    root,
    h(
      'div',
      { class: 'page profile' },
      h(
        'section',
        { class: 'card profile-head' },
        h('div', { class: 'profile-avatar' }, avatar(settings.name, { size: 72 })),
        h('div', { class: 'profile-name' }, h('label', { class: 'muted small' }, 'Dein Name'), nameInput),
        h(
          'div',
          { class: 'level-block' },
          h('div', { class: 'level-line' }, h('strong', {}, `Level ${level.level}`), h('span', { class: 'muted small' }, `${level.intoLevel} / ${level.span} XP`)),
          h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: { width: `${Math.round((level.intoLevel / level.span) * 100)}%` } })),
          h('span', { class: 'muted small' }, `Noch ${level.nextAt - xp.total} XP bis Level ${level.level + 1}`),
        ),
      ),
      h(
        'div',
        { class: 'stat-row' },
        stat('star', String(xp.total), 'XP gesamt'),
        stat('flame', String(streak.current), 'Tage Streak'),
        stat('book', String(all.learned), 'Varianten gelernt'),
        stat('trophy', String(bestDay), 'XP bester Tag'),
      ),
      h(
        'div',
        { class: 'profile-grid' },
        h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Wochenliga'),
          h('p', { class: 'muted small' }, `Deine XP seit Montag: `, h('strong', {}, String(league.xp)), ` · noch ${league.daysLeft} Tag${league.daysLeft === 1 ? '' : 'e'} bis zum Wochenwechsel`),
          h(
            'ol',
            { class: 'league-ladder' },
            [...LEAGUES].reverse().map((l) => {
              const i = LEAGUES.indexOf(l);
              return h(
                'li',
                { class: ['league', i === league.index ? 'current' : '', i < league.index ? 'passed' : ''] },
                h('span', { class: 'league-icon' }, l.icon),
                h('span', { class: 'league-name' }, l.name),
                h('span', { class: 'muted small' }, `ab ${l.min} XP`),
                i === league.index ? h('span', { class: 'you' }, 'Du') : null,
              );
            }),
          ),
          league.next ? h('p', { class: 'small' }, `Noch ${league.next.min - league.xp} XP bis zur Liga „${league.next.name}“.`) : h('p', { class: 'small' }, 'Höchste Liga erreicht – Respekt!'),
        ),
        h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Streak'),
          h(
            'div',
            { class: 'week-bar big' },
            streak.week.map((d) =>
              h(
                'div',
                { class: ['week-day', d.active ? 'active' : '', d.isToday ? 'today' : ''] },
                h('span', { class: 'week-dot' }, d.active ? icon('flame', { size: 18 }) : null),
                h('span', { class: 'week-label' }, d.label),
              ),
            ),
          ),
          h('div', { class: 'chart-card' }, h('div', { class: 'chart-head' }, h('span', {}, 'XP der letzten 7 Tage')), xpChart(xpLastDays(xp.byDay))),
        ),
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Deine Kurse'),
        h(
          'div',
          { class: 'profile-courses' },
          courses.map((course) => {
            const pct = courseProgress(course, progress, state).percent;
            return h(
              'a',
              { class: 'profile-course', href: `#/course/${encodeURIComponent(course.id)}` },
              courseIcon(course, { size: 40 }),
              h(
                'div',
                {},
                h('strong', {}, course.name),
                h(
                  'div',
                  { class: 'mini-progress' },
                  h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: { width: `${pct}%` } })),
                  h('span', { class: 'small muted' }, `${pct}%`),
                ),
              ),
            );
          }),
        ),
      ),
    ),
  );
  return null;
}
