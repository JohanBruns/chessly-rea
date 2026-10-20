// Abgeleiteter Fortschritt: Kachel-Status im Lernpfad, Kursfortschritt,
// Level aus XP, Streak und persönliche Wochenliga. Reine Funktionen – ohne Storage.
import { dayKey } from './storage.js';

export const XP = { variation: 5, review: 2, drillTile: 10, video: 2 };

// Eine Variante gilt als abgeschlossen, sobald sie gelernt UND einmal wiederholt wurde.
export function isLineDone(card) {
  return !!card && card.reps >= 1;
}

function tileDone(tile, progress, state) {
  if (tile.type === 'video') return !!state.videos[tile.studyId];
  if (tile.type === 'drill') return !!state.drills[tile.studyId];
  return tile.lines.every((l) => isLineDone(progress[l.id]));
}

/**
 * Status jeder Kachel einer Study: Kacheln werden nacheinander freigeschaltet.
 * Die Video-Kachel ist immer offen und blockiert nichts.
 */
export function tileStates(study, progress, state) {
  let previousDone = true;
  return study.tiles.map((tile) => {
    const done = tileDone(tile, progress, state);
    if (tile.type === 'video') return { tile, status: done ? 'completed' : 'available' };
    const status = done ? 'completed' : previousDone ? 'available' : 'locked';
    previousDone = done;
    return { tile, status };
  });
}

export function courseProgress(course, progress, state) {
  let total = 0;
  let done = 0;
  for (const study of course.studies) {
    for (const { tile, status } of tileStates(study, progress, state)) {
      if (tile.type === 'video') continue;
      total++;
      if (status === 'completed') done++;
    }
  }
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}

// Nächste offene Kachel im Kurs (für „Weiter lernen“)
export function nextTile(course, progress, state) {
  for (const chapter of course.chapters) {
    for (const study of chapter.studies) {
      const entry = tileStates(study, progress, state).find((t) => t.tile.type !== 'video' && t.status === 'available');
      if (entry) return { chapter, study, tile: entry.tile };
    }
  }
  return null;
}

export function findTile(course, tileId) {
  for (const chapter of course.chapters) {
    for (const study of chapter.studies) {
      const tile = study.tiles.find((t) => t.id === tileId);
      if (tile) return { chapter, study, tile };
    }
  }
  return null;
}

// ---------- Level ----------
// Level n beginnt bei 50·n·(n−1) XP: 0, 100, 300, 600, 1000, …
export function levelStart(level) {
  return 50 * level * (level - 1);
}

export function levelInfo(totalXp) {
  let level = 1;
  while (levelStart(level + 1) <= totalXp) level++;
  const start = levelStart(level);
  const next = levelStart(level + 1);
  return { level, intoLevel: totalXp - start, span: next - start, nextAt: next };
}

// ---------- Streak ----------
function shiftDay(time, days) {
  const d = new Date(time);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function streakInfo(byDay, now = Date.now()) {
  const activeToday = (byDay[dayKey(now)] || 0) > 0;
  let current = 0;
  let cursor = activeToday ? now : shiftDay(now, -1);
  while ((byDay[dayKey(cursor)] || 0) > 0) {
    current++;
    cursor = shiftDay(cursor, -1);
  }
  // Woche Montag bis Sonntag
  const today = new Date(now);
  const mondayOffset = (today.getDay() + 6) % 7;
  const labels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const week = labels.map((label, i) => {
    const t = shiftDay(now, i - mondayOffset);
    return { label, key: dayKey(t), active: (byDay[dayKey(t)] || 0) > 0, isToday: i === mondayOffset };
  });
  return { current, activeToday, week };
}

export function xpLastDays(byDay, days = 7, now = Date.now()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const t = shiftDay(now, -i);
    out.push({ key: dayKey(t), label: String(new Date(t).getDate()), xp: byDay[dayKey(t)] || 0 });
  }
  return out;
}

// ---------- Persönliche Wochenliga ----------
export const LEAGUES = [
  { name: 'Holzbauer', min: 0, icon: '♙' },
  { name: 'Bronzespringer', min: 50, icon: '♘' },
  { name: 'Silberläufer', min: 150, icon: '♗' },
  { name: 'Goldturm', min: 300, icon: '♖' },
  { name: 'Platindame', min: 500, icon: '♕' },
  { name: 'Diamantkönig', min: 800, icon: '♔' },
];

export function weeklyLeague(byDay, now = Date.now()) {
  const today = new Date(now);
  const mondayOffset = (today.getDay() + 6) % 7;
  let xp = 0;
  for (let i = 0; i <= mondayOffset; i++) xp += byDay[dayKey(shiftDay(now, -i))] || 0;
  let index = 0;
  while (index + 1 < LEAGUES.length && xp >= LEAGUES[index + 1].min) index++;
  return { xp, index, league: LEAGUES[index], next: LEAGUES[index + 1] || null, daysLeft: 7 - mondayOffset };
}
