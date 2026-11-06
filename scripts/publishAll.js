// Ein Befehl für alles nach dem Kurs-Download, auch über Nacht:   npm run publish-all
//   1. Vorprüfung: Fehlt ein Video, auf das eine PGN verweist, startet gar nichts (kein halb fertiger Kurs online).
//   2. Videos nach R2 hochladen – bei Netzfehlern bis zu 3 Versuche, Fertiges wird übersprungen.
//   3. App bauen und auf Cloudflare Pages veröffentlichen (bis zu 2 Versuche).
//   4. Den Worker der E-Mail-Warnung mit der aktuellen Sperre neu deployen (Fehler hier ist nur eine Warnung).
//   5. Verbrauch und Kosten anzeigen.
// Alles, was auf dem Bildschirm steht, landet auch in publish.log. Unter Windows hält das Skript den PC wach.
// Optionen:  --check     nur die Vorprüfung, nichts hochladen
//            --shutdown  nach Erfolg den PC in 2 Minuten herunterfahren (abbrechen mit: shutdown /a)
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { referencedVideos } from './uploadVideos.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_FILE = join(root, 'publish.log');
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const RETRY_PAUSE_MS = 30_000;

// Videos, auf die PGN-Dateien in openings/ verweisen, die lokal aber fehlen (→ erst mit dem Downloader laden)
export function missingVideos(projectRoot) {
  const openings = join(projectRoot, 'openings');
  const pgns = readdirSync(openings).filter((f) => f.endsWith('.pgn')).map((f) => readFileSync(join(openings, f), 'utf8'));
  const keys = referencedVideos(pgns);
  return { total: keys.length, missing: keys.filter((key) => !existsSync(join(projectRoot, 'downloader', 'downloads', key))) };
}

// Ein neuer Versuch lohnt sich bei Netz-, Server- und Anmeldeproblemen (ein neuer wrangler-Aufruf erneuert ein
// abgelaufenes Token selbst), aber nicht bei der Upload-Sperre oder wenn Videos lokal fehlen.
export function shouldRetry(output) {
  return !/Abbruch:|Nicht gefunden \(erst/i.test(output);
}

function createLog() {
  writeFileSync(LOG_FILE, `publish-all gestartet: ${new Date().toLocaleString('de-DE')}\n`);
  return {
    print(text = '') {
      console.log(text);
      appendFileSync(LOG_FILE, `${text}\n`);
    },
    raw(chunk) {
      const text = String(chunk).replace(ANSI, '');
      process.stdout.write(text);
      appendFileSync(LOG_FILE, text);
    },
  };
}

function spawnNpm(args) {
  const cli = process.env.npm_execpath;
  const viaNode = cli && basename(cli).startsWith('npm');
  const [command, commandArgs, options] = viaNode
    ? [process.execPath, [cli, ...args], {}]
    : process.platform === 'win32'
      ? ['npm.cmd', args, { shell: true }]
      : ['npm', args, {}];
  return spawn(command, commandArgs, { cwd: root, env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

function runOnce(args, log) {
  return new Promise((resolveRun) => {
    let output = '';
    const child = spawnNpm(args);
    const take = (chunk) => {
      output += chunk;
      log.raw(chunk);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', (error) => resolveRun({ code: 1, output: `${output}\n${error.message}` }));
    child.on('close', (code) => resolveRun({ code: code ?? 1, output }));
  });
}

async function runStep(step, log) {
  log.print('');
  log.print(`=== ${step.name} (npm ${step.args.join(' ')}) ===`);
  for (let attempt = 1; attempt <= step.attempts; attempt++) {
    if (attempt > 1) log.print(`--- Versuch ${attempt} von ${step.attempts} ---`);
    const { code, output } = await runOnce(step.args, log);
    if (code === 0) return true;
    log.print(`FEHLER: Schritt „${step.name}“ ist mit Code ${code} beendet worden.`);
    if (attempt === step.attempts || !shouldRetry(output)) break;
    log.print(`Neuer Versuch in ${RETRY_PAUSE_MS / 1000} Sekunden ...`);
    await new Promise((r) => setTimeout(r, RETRY_PAUSE_MS));
  }
  return false;
}

// Windows: Der PC soll während des Laufs nicht in den Ruhezustand gehen (hört auf, sobald dieses Skript endet).
function keepAwake() {
  if (process.platform !== 'win32') return () => {};
  const script = [
    "Add-Type -Namespace Win -Name Power -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint flags);'",
    '[void][Win.Power]::SetThreadExecutionState([uint32]2147483649)', // ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    'while ($true) { Start-Sleep -Seconds 30 }',
  ].join('; ');
  try {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    return () => child.kill();
  } catch {
    return () => {};
  }
}

const STEPS = [
  { name: 'Videos nach R2 hochladen', args: ['run', 'upload-videos'], attempts: 3, required: true },
  { name: 'App bauen und veröffentlichen', args: ['run', 'deploy'], attempts: 2, required: true },
  { name: 'E-Mail-Warnung aktualisieren', args: ['run', 'deploy-alert'], attempts: 2, required: false },
  { name: 'Verbrauch und Kosten', args: ['run', 'usage'], attempts: 1, required: false },
];

async function main() {
  const options = process.argv.slice(2);
  const log = createLog();

  const { total, missing } = missingVideos(root);
  if (missing.length) {
    log.print(`ABBRUCH: ${missing.length} von ${total} Videos fehlen lokal. Nichts wurde hochgeladen oder veröffentlicht.`);
    for (const key of missing) log.print(`  fehlt: ${key}`);
    log.print('Erst mit dem Downloader laden (fertige Videos werden übersprungen), dann diesen Befehl noch einmal starten.');
    process.exitCode = 1;
    return;
  }
  log.print(`Vorprüfung ok: alle ${total} Videos der PGN-Dateien liegen lokal vor.`);
  if (options.includes('--check')) {
    log.print('Nur geprüft (--check). Ohne diese Option würde jetzt hochgeladen und veröffentlicht.');
    return;
  }

  const stopAwake = keepAwake();
  const results = [];
  try {
    for (const step of STEPS) {
      const ok = await runStep(step, log);
      results.push({ step, ok });
      if (!ok && step.required) break; // ohne Upload nicht deployen, ohne Deploy nichts weiter
    }
  } finally {
    stopAwake();
  }

  log.print('');
  log.print('=== Zusammenfassung ===');
  for (const step of STEPS) {
    const result = results.find((r) => r.step === step);
    const state = !result ? 'nicht gelaufen' : result.ok ? 'ok' : step.required ? 'FEHLGESCHLAGEN' : 'Warnung (nicht kritisch)';
    log.print(`  ${step.name}: ${state}`);
  }
  const success = results.filter((r) => r.step.required).every((r) => r.ok) && results.filter((r) => r.step.required).length === 2;
  log.print(success ? 'Fertig: Alles ist veröffentlicht.' : 'NICHT fertig. Oben im Log steht, woran es lag; der Befehl lässt sich einfach noch einmal starten.');
  log.print(`Log: ${LOG_FILE}`);
  process.exitCode = success ? 0 : 1;

  if (success && options.includes('--shutdown') && process.platform === 'win32') {
    log.print('PC fährt in 2 Minuten herunter. Abbrechen mit: shutdown /a');
    spawn('shutdown', ['/s', '/t', '120'], { stdio: 'ignore' });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
