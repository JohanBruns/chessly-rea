// D1 für Tests: echtes SQLite im Speicher mit den echten Migrationen, nur die D1-Aufrufe sind nachgebaut.
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(MIGRATIONS).sort()) db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));

  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).all(...params)[0] ?? null,
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...params).changes) } }),
  });
  return {
    prepare: (sql) => statement(sql),
    batch: async (statements) => Promise.all(statements.map((s) => s.run())),
  };
}
