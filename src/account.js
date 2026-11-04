// Konto auf diesem Gerät: Anmelden, Registrieren, Abmelden und der laufende Abgleich mit dem Server.
// Das Konto steht auch im localStorage, damit die App offline ohne Anfrage an den Server startet.
import { clearLegacyData, legacyData, loadSyncMeta, onSyncedWrite, readData, saveSyncMeta, SYNCED_DATA, useAccountStorage, writeDataSilently } from './storage.js';
import { createSync, mergeData } from './sync.js';

const ACCOUNT_KEY = 'chesslyRea.account.v1';
const SYNC_DELAY_MS = 3000;
// fetch mit keepalive (nötig beim Schließen der App) nimmt nur kleine Bodies an
const KEEPALIVE_LIMIT = 60000;

export class SessionLostError extends Error {}

export function currentAccount() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_KEY));
  } catch {
    return null;
  }
}

function rememberAccount(account) {
  try {
    if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // Ohne Storage gilt die Anmeldung nur bis zum Neuladen
  }
}

async function postJson(path, body, { keepalive = false } = {}) {
  const text = JSON.stringify(body);
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: text,
    keepalive: keepalive && text.length < KEEPALIVE_LIMIT,
  });
  const isJson = (response.headers.get('Content-Type') || '').includes('application/json');
  const data = isJson ? await response.json() : null;
  if (response.ok && data) return data;
  if (response.status === 401 && path === '/api/sync') throw new SessionLostError('Nicht mehr angemeldet');
  throw new Error(data?.error || 'Der Server ist gerade nicht erreichbar. Versuche es gleich noch einmal.');
}

let keepaliveNext = false;
const sync = createSync({
  store: { read: readData, write: writeDataSilently, loadMeta: loadSyncMeta, saveMeta: saveSyncMeta },
  post: (body) => postJson('/api/sync', body, { keepalive: keepaliveNext }),
});

// Lernstand von vor den Konten ins Konto übernehmen; der nächste Abgleich schickt ihn zum Server
function adoptLegacyData(legacy) {
  for (const [name, value] of Object.entries(legacy)) {
    writeDataSilently(name, mergeData(name, value, readData(name)));
    if (SYNCED_DATA.includes(name)) sync.markDirty(name);
  }
  clearLegacyData();
}

// Nach erfolgreicher Anmeldung; askAdopt(): Soll der Lernstand ohne Konto zu diesem Konto wandern?
async function signedIn(user, askAdopt) {
  rememberAccount(user);
  useAccountStorage(user);
  const legacy = legacyData();
  if (Object.keys(legacy).length && askAdopt()) adoptLegacyData(legacy);
  try {
    await sync.sync();
  } catch (err) {
    // Lernstand kommt beim nächsten Abgleich; die Anmeldung selbst hat geklappt
    console.warn('Erster Abgleich fehlgeschlagen:', err);
  }
}

export async function login(username, password, askAdopt) {
  const { user } = await postJson('/api/login', { username, password });
  await signedIn(user, askAdopt);
}

export async function register(username, password, askAdopt) {
  const { user } = await postJson('/api/register', { username, password });
  await signedIn(user, askAdopt);
}

export async function logout() {
  try {
    await sync.sync();
  } catch {
    // Offene Änderungen bleiben im Konto-Speicher und gehen bei der nächsten Anmeldung raus
  }
  try {
    await postJson('/api/logout', {});
  } catch {
    // Offline: Das Cookie bleibt, die nächste Anmeldung ersetzt es
  }
  rememberAccount(null);
  location.hash = '#/';
  location.reload();
}

// Rangliste vom Server. Vorher abgleichen, damit gerade gesammelte XP schon mitzählen.
export async function fetchRanking() {
  try {
    await sync.sync();
  } catch {
    // Die Rangliste zeigt dann den letzten abgeglichenen Stand
  }
  const response = await fetch('/api/ranking', { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Rangliste nicht ladbar (${response.status})`);
  return response.json();
}

// Hintergrund-Abgleich: nach Änderungen, beim Start, beim Zurückkehren in die App und wenn wieder Netz da ist.
// onChanged() läuft, wenn neue Daten von einem anderen Gerät angekommen sind.
export function startAccountSync(onChanged) {
  let timer = null;

  const run = async () => {
    clearTimeout(timer);
    timer = null;
    try {
      const changed = await sync.sync();
      if (changed.length) onChanged();
    } catch (err) {
      if (err instanceof SessionLostError) {
        // Anmeldung abgelaufen: Lernstand bleibt auf dem Gerät, die Anmeldeseite fragt neu
        rememberAccount(null);
        location.reload();
      }
    }
  };

  onSyncedWrite((name) => {
    sync.markDirty(name);
    clearTimeout(timer);
    timer = setTimeout(run, SYNC_DELAY_MS);
  });

  document.addEventListener('visibilitychange', () => {
    // Beim Schließen muss die Anfrage die App überleben
    keepaliveNext = document.visibilityState === 'hidden';
    run().finally(() => {
      keepaliveNext = false;
    });
  });
  window.addEventListener('online', run);
  run();
}
