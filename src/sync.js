// Abgleich des Lernstands mit dem Server, ohne DOM. Die App arbeitet immer auf dem localStorage und bleibt
// so offline nutzbar; geänderte Daten merkt sich das Gerät (dirty) und schickt sie, sobald Netz da ist.

const MAX_ROUNDS = 5;

const newer = (a, b) => ((b?.lastReviewed || 0) > (a?.lastReviewed || 0) ? b : a);

function mergeTimes(local = {}, remote = {}) {
  const merged = { ...remote };
  for (const [id, time] of Object.entries(local)) merged[id] = Math.max(time, merged[id] || 0);
  return merged;
}

// Zwei Geräte haben unabhängig geändert: beide Stände zusammenführen, ohne Gelerntes zu verlieren.
export function mergeData(name, local, remote) {
  if (local === undefined) return remote;
  if (remote === undefined) return local;
  switch (name) {
    case 'progress': {
      const merged = { ...remote };
      for (const [id, card] of Object.entries(local)) merged[id] = id in merged ? newer(card, merged[id]) : card;
      return merged;
    }
    case 'state':
      return {
        ...remote,
        ...local,
        drills: mergeTimes(local.drills, remote.drills),
        videos: mergeTimes(local.videos, remote.videos),
        started: mergeTimes(local.started, remote.started),
        lastCourse: local.lastCourse ?? remote.lastCourse ?? null,
      };
    case 'xp': {
      const byDay = mergeTimes(local.byDay, remote.byDay);
      const sum = Object.values(byDay).reduce((total, amount) => total + amount, 0);
      return { ...remote, ...local, byDay, total: Math.max(local.total || 0, remote.total || 0, sum) };
    }
    case 'imported': {
      const localIds = new Set(local.map((course) => course.id));
      return [...remote.filter((course) => !localIds.has(course.id)), ...local];
    }
    default:
      return { ...remote, ...local };
  }
}

/**
 * @param store { read(name), write(name, value), loadMeta(), saveMeta(meta) }
 * @param post  schickt { base, changes } an den Server und liefert { accepted, updates, tooLarge }
 */
export function createSync({ store, post }) {
  let running = null;

  function markDirty(name) {
    const meta = store.loadMeta();
    meta.seq += 1;
    meta.dirty[name] = meta.seq;
    store.saveMeta(meta);
  }

  async function round() {
    const before = store.loadMeta();
    const sent = { ...before.dirty };
    const changes = {};
    for (const name of Object.keys(sent)) changes[name] = store.read(name);

    const { accepted = {}, updates = {}, tooLarge = [] } = await post({ base: before.versions, changes });

    // Erst jetzt neu lesen: Während der Anfrage kann die App weitergespeichert haben
    const meta = store.loadMeta();
    const settled = (name) => {
      if (meta.dirty[name] === sent[name]) delete meta.dirty[name];
    };
    for (const [name, version] of Object.entries(accepted)) {
      meta.versions[name] = version;
      settled(name);
    }
    for (const name of tooLarge) {
      console.warn(`„${name}“ ist zu groß für den Abgleich und bleibt nur auf diesem Gerät.`);
      settled(name);
    }
    const changed = [];
    for (const [name, { version, value }] of Object.entries(updates)) {
      store.write(name, name in meta.dirty ? mergeData(name, store.read(name), value) : value);
      meta.versions[name] = version;
      changed.push(name);
    }
    store.saveMeta(meta);
    return { changed, pending: Object.keys(meta.dirty).length > 0 };
  }

  // Abgleichen, bis nichts mehr offen ist. Liefert die Namen der Daten, die sich lokal geändert haben.
  // Fehler (kein Netz, abgemeldet) gehen an den Aufrufer; offene Änderungen bleiben gespeichert.
  function sync() {
    if (running) return running;
    running = (async () => {
      const changed = new Set();
      for (let i = 0; i < MAX_ROUNDS; i += 1) {
        const result = await round();
        result.changed.forEach((name) => changed.add(name));
        if (!result.pending) break;
      }
      return [...changed];
    })().finally(() => {
      running = null;
    });
    return running;
  }

  return { markDirty, sync };
}
