// Schickt eine Probe-Mail über den veröffentlichten Warn-Worker, mit dem bei Cloudflare hinterlegten
// Resend-Schlüssel (er muss also nirgends lokal liegen). Dafür läuft der Worker kurz jede Minute mit
// SEND_TEST_MAIL=true; nach dem ersten Lauf wird er wieder normal veröffentlicht.  Aufruf: npm run test-alert
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrangler } from './r2Usage.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = 'chessly-rea-usage-alert';
const CONFIG = ['--config', 'usageAlert/wrangler.toml'];
// Geänderte Cron-Zeitpläne brauchen bei Cloudflare bis zu 15 Minuten, bis sie greifen
const TIMEOUT_MS = 16 * 60 * 1000;

const wranglerBin = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const tail = spawn(process.execPath, [wranglerBin, 'tail', WORKER, '--format', 'json', ...CONFIG], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });

let output = '';
let tailLog = '';
tail.stderr.on('data', (chunk) => (tailLog += chunk));
const run = new Promise((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error(`Kein Lauf des Workers innerhalb von 16 Minuten gesehen.\n${(tailLog + output).slice(-600)}`)),
    TIMEOUT_MS,
  );
  tail.stdout.on('data', (chunk) => {
    output += chunk;
    const outcome = /"outcome":\s*"([^"]+)"/.exec(output);
    if (!outcome || !/"cron"/.test(output)) return;
    clearTimeout(timer);
    const exception = /"exceptions":\s*\[\s*\{[\s\S]*?"message":\s*"([^"]*)"/.exec(output);
    if (outcome[1] === 'ok' && !exception) resolve();
    else reject(new Error(`Worker meldet: ${exception ? exception[1] : outcome[1]}`));
  });
});

try {
  // Kurz warten, bis die Log-Verbindung steht, dann im Testmodus veröffentlichen
  await new Promise((r) => setTimeout(r, 5000));
  console.log('Worker läuft jetzt jede Minute im Testmodus – warte auf den ersten Lauf (Cloudflare braucht dafür bis zu 15 Minuten) …');
  wrangler(['deploy', ...CONFIG, '--triggers', '* * * * *', '--var', 'SEND_TEST_MAIL:true'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  await run;
  console.log('Probe-Mail verschickt – schau in dein Postfach (auch im Spam-Ordner).');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  tail.kill();
  // Immer zurück zum Normalbetrieb: täglicher Cron aus wrangler.toml, ohne SEND_TEST_MAIL
  wrangler(['deploy', ...CONFIG], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  console.log('Worker wieder im Normalbetrieb (täglich 07:00 UTC).');
}
