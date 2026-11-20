import system from '../system.config';
import type { Entity, Field, Seed } from '../shared/types';
import { all, columns, entity, run, table } from './db';
import { hashPassword } from './auth';
import { whereSql } from './crud';
import { addDays, evalExpr, isoDay } from '../shared/expr';
import { applySeedEffects, computeValue, fillTemplate, lookupFor, violation } from './rules';

export const DEMO_PASSWORD = 'demo1234';

const FIRST = ['Amara', 'Liam', 'Sofia', 'Noah', 'Aisha', 'Mateo', 'Yuki', 'Omar', 'Elena', 'Kofi', 'Priya', 'Lucas', 'Fatima', 'Ethan', 'Mei', 'Daniel', 'Zara', 'Hugo', 'Ines', 'Tariq', 'Clara', 'Ravi', 'Nora', 'Samuel', 'Leila', 'Jonas', 'Maya', 'Andre', 'Hana', 'Felix', 'Chloe', 'Ibrahim', 'Greta', 'Diego', 'Sana', 'Oscar'];
const LAST = ['Okafor', 'Nguyen', 'Rossi', 'Khan', 'Silva', 'Tanaka', 'Haddad', 'Novak', 'Mensah', 'Patel', 'Martin', 'Ali', 'Brooks', 'Chen', 'Costa', 'Lindqvist', 'Moreau', 'Reyes', 'Sharma', 'Becker', 'Yilmaz', 'Santos', 'Fischer', 'Ahmed', 'Walsh', 'Kim', 'Dubois', 'Ortiz', 'Hussain', 'Larsen'];
const COMPANY_A = ['Northwind', 'Harbor', 'Cedar', 'Bright', 'Summit', 'Juniper', 'Atlas', 'Lumen', 'Orchard', 'Granite', 'Willow', 'Pioneer', 'Sterling', 'Meridian', 'Cobalt'];
const COMPANY_B = ['Supply', 'Partners', 'Trading', 'Works', 'Logistics', 'Studio', 'Group', 'Foods', 'Systems', 'Health', 'Labs', 'Goods'];
const STREET = ['Maple St', 'Oak Ave', 'King Rd', 'Mill Lane', 'Station Rd', 'Park Ave', 'Canal St', 'Hill Rd', 'Garden Way', 'Market St'];
const CITY = ['Austin', 'Leeds', 'Toronto', 'Melbourne', 'Dublin', 'Denver', 'Bristol', 'Auckland', 'Portland', 'Glasgow'];
const NOTES = [
  'Prefers contact by phone in the afternoon.', 'Follow up next week.', 'Asked for a written quote.',
  'Paid in full, no issues.', 'Rescheduled once, confirmed for the new date.', 'Referred by an existing customer.',
  'Needs approval from a manager first.', 'Left a message, waiting to hear back.', 'Happy with the service so far.',
  'Requested an invoice copy by email.', 'Has a standing weekly slot.', 'First visit went well.',
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type R = () => number;
const int = (r: R, a: number, b: number) => Math.floor(r() * (b - a + 1)) + a;
const pick = <T,>(r: R, xs: T[]): T => xs[Math.floor(r() * xs.length)];
function weighted<T>(r: R, xs: T[], ws: number[]): T {
  let x = r() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < xs.length; i++) if ((x -= ws[i]) < 0) return xs[i];
  return xs[xs.length - 1];
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

function dateFrom(r: R, min: number, max: number, withTime: boolean) {
  const d = new Date();
  d.setDate(d.getDate() + int(r, min, max));
  if (!withTime) return d.toISOString().slice(0, 10);
  d.setHours(int(r, 8, 19), pick(r, [0, 15, 30, 45]), 0, 0);
  return d.toISOString();
}

type Ctx = { tenantId: number; row: Record<string, any>; val: (name: string) => any; lookup: (path: string[]) => unknown };

function gen(r: R, f: Field, seed: Seed | undefined, c: Ctx, n: number, refIds: Map<string, number[]>): any {
  const s = seed;
  if (typeof s === 'object') {
    if ('pick' in s) return s.weights ? weighted(r, s.pick, s.weights) : pick(r, s.pick);
    if ('int' in s) return int(r, s.int[0], s.int[1]);
    if ('money' in s) return Math.round((s.money[0] + r() * (s.money[1] - s.money[0])) * 100) / 100;
    if ('days' in s && !('after' in s)) return dateFrom(r, s.days[0], s.days[1], f.type === 'datetime');
    if ('template' in s) return fillTemplate(s.template, n);
    if ('digits' in s) return Array.from({ length: s.digits }, () => int(r, 0, 9)).join('');
    if ('calc' in s) {
      let v = evalExpr(s.calc, c.lookup);
      if (typeof v === 'boolean') v = v ? 1 : 0;
      return typeof v === 'number' && f.type === 'money' ? Math.round(v * 100) / 100 : v;
    }
    if ('after' in s) {
      const base = c.lookup(s.after.split('.'));
      if (base == null) return null;
      let d = addDays(base, int(r, s.days[0], s.days[1]));
      if (s.notAfter === 'today' && d.slice(0, 10) > isoDay()) d = String(base).slice(0, 10) > isoDay() ? d : isoDay() + d.slice(10);
      if (f.type !== 'datetime') return d.slice(0, 10);
      const t = new Date(d.length <= 10 ? `${d}T00:00:00` : d);
      if (String(base).length <= 10) t.setHours(int(r, 8, 19), pick(r, [0, 15, 30, 45]), 0, 0);
      return s.notAfter === 'today' && t.getTime() > Date.now() ? new Date(Date.now() - int(r, 5, 240) * 60000).toISOString() : t.toISOString();
    }
    if ('ref' in s) {
      const target = entity(f.ref!)!;
      const w = whereSql(target, s.ref);
      const ids = all<{ id: number }>(`SELECT id FROM ${table(target)} WHERE tenant_id = ?${w.sql}`, c.tenantId, ...w.params).map((x) => x.id);
      return ids.length ? pick(r, ids) : null;
    }
    if ('when' in s) {
      const yes = evalExpr(s.when, c.lookup) === true;
      return yes ? gen(r, f, s.then, c, n, refIds) : s.else === undefined ? null : gen(r, f, s.else, c, n, refIds);
    }
  }
  const person = () => `${pick(r, FIRST)} ${pick(r, LAST)}`;
  switch (s) {
    case 'name': return person();
    case 'firstName': return pick(r, FIRST);
    case 'lastName': return pick(r, LAST);
    case 'company': return `${pick(r, COMPANY_A)} ${pick(r, COMPANY_B)}`;
    case 'email': {
      const base = Object.values(c.row).find((v) => typeof v === 'string' && v.includes(' ') && !/\d/.test(v)) as string | undefined;
      return `${slug(base ?? person())}${n}@example.com`;
    }
    case 'phone': return `+1 555 ${int(r, 100, 999)} ${int(r, 1000, 9999)}`;
    case 'address': return `${int(r, 1, 240)} ${pick(r, STREET)}, ${CITY.includes(c.val('city')) ? c.val('city') : pick(r, CITY)}`;
    case 'city': return pick(r, CITY);
    case 'sentence': return pick(r, NOTES);
    case 'paragraph': return `${pick(r, NOTES)} ${pick(r, NOTES)}`;
  }
  switch (f.type) {
    case 'ref': {
      const ids = refIds.get(f.ref!) ?? [];
      return ids.length && (f.required || r() < 0.9) ? pick(r, ids) : null;
    }
    case 'select': return pick(r, f.options!);
    case 'boolean': return r() < 0.7 ? 1 : 0;
    case 'number': return int(r, 1, 100);
    case 'money': return int(r, 10, 500);
    case 'date': return dateFrom(r, -90, 0, false);
    case 'datetime': return dateFrom(r, -30, 14, true);
    case 'email': return gen(r, f, 'email', c, n, refIds);
    case 'phone': return gen(r, f, 'phone', c, n, refIds);
    case 'longtext': return pick(r, NOTES);
    default: return `${f.label ?? f.name} ${n}`;
  }
}

/** Builds one demo row. Fields are worked out on demand, so a field may depend on any other field of the row. */
function buildRow(e: Entity, tenantId: number, r: R, refIds: Map<string, number[]>, given: Record<string, any>, n: number) {
  const row: Record<string, any> = {};
  const busy = new Set<string>();
  const st = e.status;
  const c: Ctx = { tenantId, row, val: () => null, lookup: () => null };
  c.val = (name: string) => {
    if (name in row) return row[name];
    const f = e.fields.find((x) => x.name === name);
    const isStatus = st && name === st.field;
    if (!f && !isStatus) return null;
    if (busy.has(name)) throw new Error(`Demo data for ${e.name}: "${name}" depends on itself. Check its seed, compute and status.seed.`);
    busy.add(name);
    let v: any;
    if (isStatus) {
      const rule = st!.seed?.find((x) => evalExpr(x.when, c.lookup) === true);
      v = given[name] ?? (rule
        ? weighted(r, Object.keys(rule.weights), Object.values(rule.weights))
        : weighted(r, st!.states.map((x) => x.name), st!.states.map((x) => x.weight ?? 1)));
    } else if (name in given) {
      v = given[name];
      if (f!.type === 'ref' && typeof v === 'string') {
        const target = entity(f!.ref!)!;
        const hit = all<{ id: number }>(`SELECT id FROM ${table(target)} WHERE tenant_id = ? AND "${target.title}" = ?`, tenantId, v)[0];
        if (!hit) throw new Error(`Seed for ${e.name} row ${n}: no ${f!.ref} titled "${v}"`);
        v = hit.id;
      }
    } else if (f!.compute) v = computeValue(f!, c.lookup);
    else if (f!.auto) v = fillTemplate(f!.auto, n);
    else v = gen(r, f!, f!.seed, c, n, refIds);
    busy.delete(name);
    row[name] = v ?? null;
    return row[name];
  };
  c.lookup = lookupFor(e, tenantId, c.val);
  for (const f of e.fields) c.val(f.name);
  if (st) c.val(st.field);
  return row;
}

function seedEntity(e: Entity, tenantId: number, r: R, refIds: Map<string, number[]>) {
  const cols = columns(e);
  const sql = `INSERT INTO ${table(e)} (tenant_id, ${cols.map((c) => `"${c.name}"`).join(', ')}, created_at, updated_at)
    VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`;
  const ids: number[] = [];
  const exact = Array.isArray(e.seed);
  const count = Array.isArray(e.seed) ? e.seed.length : e.seed;
  for (let n = 1; n <= count; n++) {
    const given = Array.isArray(e.seed) ? e.seed[n - 1] : {};
    // A generated row that breaks a business rule (a double booking, a full class) is thrown away and
    // tried again. If no valid row turns up, the row is skipped, so busy entities may get slightly fewer rows.
    let row: Record<string, any> | undefined;
    for (let attempt = 0; attempt < (exact ? 1 : 30) && !row; attempt++) {
      const candidate = buildRow(e, tenantId, r, refIds, given, n);
      // A required field left empty (its value came through an optional link that is empty) also means: try again.
      const empty = e.fields.some((f) => f.required && candidate[f.name] == null);
      if (exact || (!empty && !violation(e, tenantId, candidate))) row = candidate;
    }
    if (!row) continue;
    // The record's own timestamp agrees with its dates: it was created on its earliest recent date,
    // or before today when everything in it lies ahead.
    const nowIso = new Date().toISOString();
    const yearAgo = addDays(nowIso, -365);
    const dates = e.fields.filter((f) => f.type === 'date' || f.type === 'datetime').map((f) => row![f.name]).filter(Boolean).map(String);
    const recent = dates.filter((d) => d > yearAgo && d.slice(0, 10) <= nowIso.slice(0, 10)).sort()[0];
    const created = recent ? (recent.length > 10 ? (recent < nowIso ? recent : nowIso) : new Date(Math.min(Date.parse(`${recent}T${String(int(r, 8, 17)).padStart(2, '0')}:${pick(r, ['05', '20', '40'])}:00Z`), Date.now())).toISOString())
      : dateFrom(r, dates.length ? -30 : -120, 0, true);
    const res = run(sql, tenantId, ...cols.map((c) => row![c.name]), created, created);
    ids.push(Number(res.lastInsertRowid));
  }
  refIds.set(e.name, ids);
}

export function seedAll() {
  const hash = hashPassword(DEMO_PASSWORD);
  system.tenants.forEach((t, ti) => {
    const tenantId = Number(run('INSERT INTO tenants (name, slug) VALUES (?, ?)', t.name, t.slug).lastInsertRowid);
    const r = rng(1000 + ti * 7919);
    for (const role of system.roles) {
      run('INSERT INTO users (tenant_id, name, email, role, password_hash, demo, created_at) VALUES (?,?,?,?,?,1,?)',
        tenantId, `${pick(r, FIRST)} ${pick(r, LAST)}`, `${role.name.replace(/_/g, '.')}@${t.slug}.demo`, role.name, hash, new Date().toISOString());
    }
    const refIds = new Map<string, number[]>();
    for (const e of system.entities) seedEntity(e, tenantId, r, refIds);
    applySeedEffects(system.entities, tenantId);
  });
}
