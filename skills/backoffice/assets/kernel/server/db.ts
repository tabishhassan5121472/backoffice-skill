import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import system from '../system.config';
import type { Entity, Field } from '../shared/types';
import { seedAll } from './seed';

export let db: DatabaseSync;

type Val = string | number | null;
const clean = (v: unknown): Val =>
  v === undefined || v === null ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v as Val);

export const all = <T = any>(sql: string, ...p: unknown[]) => db.prepare(sql).all(...p.map(clean)) as T[];
export const get = <T = any>(sql: string, ...p: unknown[]) => db.prepare(sql).get(...p.map(clean)) as T | undefined;
export const run = (sql: string, ...p: unknown[]) => db.prepare(sql).run(...p.map(clean));

export const table = (e: Entity | string) => `e_${typeof e === 'string' ? e : e.name}`;
export const entity = (name: string) => system.entities.find((e) => e.name === name);

/** Every stored column of an entity, including the status column. */
export function columns(e: Entity): Field[] {
  const cols = [...e.fields];
  if (e.status) cols.push({ name: e.status.field, type: 'select', label: 'Status', options: e.status.states.map((s) => s.name) });
  return cols;
}

const sqlType = (f: Field) =>
  f.type === 'number' || f.type === 'money' ? 'REAL' : f.type === 'boolean' || f.type === 'ref' ? 'INTEGER' : 'TEXT';

function createSchema() {
  db.exec(`
    CREATE TABLE tenants (id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE);
    CREATE TABLE users (id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL, name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE, role TEXT NOT NULL, password_hash TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE audit (id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL, user_id INTEGER, user_name TEXT,
      action TEXT NOT NULL, entity TEXT NOT NULL, record_id INTEGER, summary TEXT, at TEXT NOT NULL);
    CREATE INDEX audit_tenant ON audit (tenant_id, at);
  `);
  for (const e of system.entities) {
    const cols = columns(e).map((f) => `"${f.name}" ${sqlType(f)}`).join(', ');
    db.exec(`CREATE TABLE ${table(e)} (id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL, ${cols},
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX ${table(e)}_tenant ON ${table(e)} (tenant_id);`);
  }
}

/** Opens the database. If the config changed since it was built, the demo data is rebuilt from scratch. */
export function initDb() {
  const file = process.env.DB_FILE ?? path.join('data', 'app.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)');
  const hash = createHash('sha1').update(JSON.stringify(system)).digest('hex');
  if (get<{ v: string }>('SELECT v FROM meta WHERE k = ?', 'config')?.v === hash) return;

  const old = all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'meta'`);
  for (const t of old) db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
  db.exec('BEGIN');
  createSchema();
  seedAll();
  run('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', 'config', hash);
  db.exec('COMMIT');
  console.log(`Demo data built for ${system.tenants.length} organisation(s).`);
}

export const now = () => new Date().toISOString();

export function audit(u: { tenant_id: number; id: number; name: string }, action: string, ent: string, recordId: number | null, summary: string) {
  run('INSERT INTO audit (tenant_id, user_id, user_name, action, entity, record_id, summary, at) VALUES (?,?,?,?,?,?,?,?)',
    u.tenant_id, u.id, u.name, action, ent, recordId, summary, now());
}
