// Profil: Name, XP, Level, Streak mit Wochenleiste, Rangliste aller Konten und Kursfortschritt.
import { currentAccount, fetchRanking } from '../account.js';
import { lineStats, loadAllCourses } from '../courses.js';
import { add, fill, h } from '../dom.js';
import { courseProgress, levelInfo, streakInfo, xpLastDays } from '../progress.js';
import { loadProgress, loadSettings, loadState, loadXp, saveSettings } from '../storage.js';
import { avatar, courseIcon } from '../ui/courseIcon.js';
import { icon } from '../ui/icons.js';
import { renderTopbar } from '../ui/layout.js';
import { xpChart } from '../ui/xpChart.js';

function rankingRow(entry) {
  return h(
    'li',
    { class: ['ranking-row', entry.me ? 'current' : ''] },
    h('span', { class: 'ranking-place' }, String(entry.rank)),
    avatar(entry.username, { size: 32 }),
    h('span', { class: 'ranking-name' }, entry.username),
    entry.me ? h('span', { class: 'you' }, 'Du') : null,
    h('span', { class: 'ranking-xp' }, `${entry.xp} XP`),
  );
}

function rankingCard() {
  const message = (text) => h('p', { class: 'muted small' }, text);
  const body = h('div', {}, message(currentAccount() ? 'Rangliste wird geladen …' : 'Die Rangliste gibt es nur mit Konto.'));
  if (currentAccount()) {
    fetchRanking()
      .then(({ players, entries }) => {
        fill(
          body,
          h('p', { class: 'muted small' }, 'Dein Platz: ', h('strong', {}, String(entries.find((e) => e.me).rank)), ` von ${players} · nach allen jemals gesammelten XP`),
          h('ol', { class: 'ranking' }, entries.map(rankingRow)),
        );
      })
      .catch((err) => {
        console.warn('Rangliste nicht geladen:', err);
        fill(body, message('Die Rangliste ist gerade nicht erreichbar. Dafür braucht die App Internet.'));
      });
  }
  return h('section', { class: 'card' }, h('h2', {}, 'Rangliste'), body);
}

export function renderProfile(root) {
  const settings = loadSettings();
  const xp = loadXp();
  const level = levelInfo(xp.total);
  const streak = streakInfo(xp.byDay);
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
        // Mit Konto ist der Name der Benutzername und steht fest
        currentAccount()
          ? h('div', { class: 'profile-name' }, h('span', { class: 'muted small' }, 'Benutzername'), h('strong', { class: 'profile-username' }, settings.name))
          : h('div', { class: 'profile-name' }, h('label', { class: 'muted small' }, 'Dein Name'), nameInput),
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
        rankingCard(),
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
