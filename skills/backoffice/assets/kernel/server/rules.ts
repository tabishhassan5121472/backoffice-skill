// Calculated fields, business rules and the side effects of status changes.
// Used by the API (server/crud.ts) and by the demo data builder (server/seed.ts), so both obey the same rules.
import type { Entity, Field, Rule, Scalar, Transition } from '../shared/types';
import { fieldLabel } from '../shared/types';
import { evalExpr, isoDay } from '../shared/expr';
import { all, entity, get, run, table } from './db';

type Row = Record<string, any>;

/** Resolves `field` and `ref_field.other_field` paths for expressions. `value` reads a field of the row. */
export function lookupFor(e: Entity, tenantId: number, value: (name: string) => unknown) {
  return (path: string[]): unknown => {
    let ent: Entity | undefined = e;
    let read = value;
    for (let i = 0; i < path.length; i++) {
      const v = read(path[i]);
      if (i === path.length - 1) return v ?? null;
      const f: Field | undefined = ent?.fields.find((x) => x.name === path[i]);
      if (!f || f.type !== 'ref' || v == null) return null;
      ent = entity(f.ref!);
      const linked = get<Row>(`SELECT * FROM ${table(ent!)} WHERE tenant_id = ? AND id = ?`, tenantId, v);
      if (!linked) return null;
      read = (k) => linked[k];
    }
    return null;
  };
}

export function computeValue(f: Field, lookup: (path: string[]) => unknown) {
  let v = evalExpr(f.compute!, lookup);
  if (typeof v === 'boolean') v = v ? 1 : 0;
  if (typeof v === 'number' && f.type === 'money') v = Math.round(v * 100) / 100;
  return v ?? null;
}

/** Fills in every calculated field of the row, in field order. */
export function applyComputed(e: Entity, tenantId: number, row: Row) {
  const lookup = lookupFor(e, tenantId, (k) => row[k]);
  for (const f of e.fields) if (f.compute) row[f.name] = computeValue(f, lookup);
  return row;
}

export const fillTemplate = (tpl: string, n: number) =>
  tpl.replace(/\{seq(?::(\d+))?\}/g, (_, w) => String(n).padStart(Number(w ?? 1), '0'));

/** The next free code for an `auto` field, counted per organisation. */
export function nextAuto(e: Entity, f: Field, tenantId: number) {
  let n = get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table(e)} WHERE tenant_id = ?`, tenantId)!.n + 1;
  for (;;) {
    const code = fillTemplate(f.auto!, n);
    if (!get(`SELECT id FROM ${table(e)} WHERE tenant_id = ? AND "${f.name}" = ?`, tenantId, code)) return code;
    n++;
  }
}

const list = (v: Scalar | Scalar[]) => (Array.isArray(v) ? v : [v]);
const exempt = (row: Row, unless?: Record<string, Scalar | Scalar[]>) =>
  Object.entries(unless ?? {}).some(([k, v]) => list(v).includes(row[k]));
function unlessSql(unless: Record<string, Scalar | Scalar[]> | undefined, params: unknown[]) {
  let sql = '';
  for (const [k, v] of Object.entries(unless ?? {})) {
    sql += ` AND ("${k}" IS NULL OR "${k}" NOT IN (${list(v).map(() => '?').join(',')}))`;
    params.push(...list(v));
  }
  return sql;
}

/** Returns the message of the first rule this row breaks, or nothing. `selfId` is the row's own id when it already exists. */
export function violation(e: Entity, tenantId: number, row: Row, selfId = 0): string | undefined {
  const lookup = lookupFor(e, tenantId, (k) => row[k]);
  const label = (name: string) => { const f = e.fields.find((x) => x.name === name); return f ? fieldLabel(f) : name; };
  for (const rule of e.rules ?? []) {
    if ('check' in rule) {
      if (evalExpr(rule.check, lookup) === false) return rule.message;
    } else if ('unique' in rule) {
      if (rule.unique.some((k) => row[k] == null)) continue;
      const hit = get(`SELECT id FROM ${table(e)} WHERE tenant_id = ? AND id != ? AND ${rule.unique.map((k) => `"${k}" = ?`).join(' AND ')}`,
        tenantId, selfId, ...rule.unique.map((k) => row[k]));
      if (hit) return rule.message ?? `Another ${e.singular.toLowerCase()} already has this ${rule.unique.map(label).join(' and ').toLowerCase()}.`;
    } else if ('noOverlap' in rule) {
      const { per, start, end } = rule.noOverlap;
      if (exempt(row, rule.unless) || row[per] == null || row[start] == null) continue;
      const params: unknown[] = [tenantId, selfId, row[per]];
      let sql = `SELECT id FROM ${table(e)} WHERE tenant_id = ? AND id != ? AND "${per}" = ?`;
      if (end) { sql += ` AND "${start}" < ? AND COALESCE("${end}", "${start}") > ?`; params.push(row[end] ?? row[start], row[start]); }
      else { sql += ` AND "${start}" = ?`; params.push(row[start]); }
      sql += unlessSql(rule.unless, params);
      if (get(sql, ...params)) return rule.message ?? `This ${label(per).toLowerCase()} is already taken for that time.`;
    } else if ('capacity' in rule) {
      const { per, max } = rule.capacity;
      if (exempt(row, rule.unless) || row[per] == null) continue;
      const limit = typeof max === 'number' ? max : Number(lookup([per, max]));
      if (!Number.isFinite(limit) || (typeof max !== 'number' && lookup([per, max]) == null)) continue;
      const params: unknown[] = [tenantId, selfId, row[per]];
      const sql = `SELECT COUNT(*) AS n FROM ${table(e)} WHERE tenant_id = ? AND id != ? AND "${per}" = ?${unlessSql(rule.unless, params)}`;
      if (get<{ n: number }>(sql, ...params)!.n >= limit) return rule.message ?? `This ${label(per).toLowerCase()} is full.`;
    }
  }
}

/** Turns the values of a transition's `set` into stored values ('today' and 'now' become dates). */
export function resolveSet(set: Record<string, Scalar> | undefined) {
  const out: Row = {};
  for (const [k, v] of Object.entries(set ?? {}))
    out[k] = v === 'today' ? isoDay() : v === 'now' ? new Date().toISOString() : typeof v === 'boolean' ? (v ? 1 : 0) : v;
  return out;
}

/** Applies a transition's `then` changes to the linked records. Returns what was changed, for the activity log. */
export function applyEffects(e: Entity, t: Transition, tenantId: number, row: Row) {
  const done: { target: Entity; id: number; summary: string }[] = [];
  const lookup = lookupFor(e, tenantId, (k) => row[k]);
  for (const eff of t.then ?? []) {
    // `when` is read before each change, so it sees what earlier changes in the same step did.
    if (eff.when && evalExpr(eff.when, lookup) !== true) continue;
    const f = e.fields.find((x) => x.name === eff.update);
    const id = row[eff.update];
    if (!f?.ref || id == null) continue;
    const target = entity(f.ref)!;
    const set = resolveSet(eff.set);
    const keys = Object.keys(set);
    run(`UPDATE ${table(target)} SET ${keys.map((k) => `"${k}" = ?`).join(', ')}, updated_at = ? WHERE tenant_id = ? AND id = ?`,
      ...keys.map((k) => set[k]), new Date().toISOString(), tenantId, id);
    done.push({ target, id, summary: keys.map((k) => `${k} → ${set[k]}`).join(', ') });
  }
  return done;
}

/**
 * Demo data only: makes linked records agree with the records that point at them. A booking seeded as
 * "active" whose "Pick up" step marks the vehicle as rented leaves that vehicle rented. Finished records
 * are applied first, across all entities, so that records still in progress have the last word. When two
 * in-progress records disagree about one linked record, the entity defined later wins.
 */
export function applySeedEffects(entities: Entity[], tenantId: number) {
  // Finished records first, then records still in progress; within each group the oldest first,
  // so the most recent event has the last word on a linked record.
  for (const pass of [false, true]) {
    const todo: { e: Entity; t: Transition; row: Row; at: string }[] = [];
    for (const e of entities) {
      const st = e.status;
      if (!st || !st.transitions.some((t) => t.then?.length)) continue;
      const live = (s: string) => st.transitions.some((t) => t.from.includes(s));
      const dated = e.fields.filter((f) => f.type === 'date' || f.type === 'datetime').map((f) => f.name);
      for (const row of all<Row>(`SELECT * FROM ${table(e)} WHERE tenant_id = ? ORDER BY id`, tenantId)) {
        if (live(row[st.field]) !== pass) continue;
        const t = st.transitions.find((x) => x.to === row[st.field] && x.then?.length);
        const today = new Date().toISOString();
        const past = dated.map((d) => String(row[d] ?? '')).filter((v) => v && v.slice(0, 10) <= today.slice(0, 10)).sort();
        if (t) todo.push({ e, t, row, at: past.at(-1) ?? String(row.created_at ?? '') });
      }
    }
    todo.sort((a, b) => (a.at.slice(0, 10) < b.at.slice(0, 10) ? -1 : a.at.slice(0, 10) > b.at.slice(0, 10) ? 1 : 0));
    for (const x of todo) applyEffects(x.e, x.t, tenantId, x.row);
  }
}
