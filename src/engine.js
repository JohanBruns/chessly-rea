// Stockfish (npm-Paket „stockfish“, Lite-Version ohne Threads) als Web Worker.
// Die Engine-Dateien kopiert scripts/copyStockfish.js nach public/stockfish/.
const ENGINE_URL = `${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`;

export class Engine {
  constructor() {
    this.worker = null;
    this.ready = null;
    this.listeners = new Set();
  }

  start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(ENGINE_URL);
      } catch (err) {
        reject(err);
        return;
      }
      this.worker.onerror = (e) => reject(new Error(e.message || 'Stockfish konnte nicht geladen werden.'));
      this.worker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : '';
        if (line === 'uciok') this.send('isready');
        if (line === 'readyok') resolve();
        for (const fn of this.listeners) fn(line);
      };
      this.send('uci');
    });
    return this.ready;
  }

  send(cmd) {
    this.worker?.postMessage(cmd);
  }

  async setSkill(skill) {
    await this.start();
    this.send(`setoption name Skill Level value ${skill}`);
  }

  /** @returns {Promise<string>} bester Zug als UCI, z. B. "e2e4" */
  async bestMove(fen, { depth = 8, movetime = 500 } = {}) {
    await this.start();
    return new Promise((resolve) => {
      const onLine = (line) => {
        const m = line.match(/^bestmove (\S+)/);
        if (!m) return;
        this.listeners.delete(onLine);
        resolve(m[1] === '(none)' ? null : m[1]);
      };
      this.listeners.add(onLine);
      this.send('ucinewgame');
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth} movetime ${movetime}`);
    });
  }

  stop() {
    this.send('stop');
  }

  destroy() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.listeners.clear();
  }
}
