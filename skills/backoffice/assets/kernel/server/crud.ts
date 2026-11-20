import type { Express, Request, Response } from 'express';
import type { Entity, Field, Where } from '../shared/types';
import { fieldLabel } from '../shared/types';
import { all, audit, columns, entity, get, now, run, table } from './db';
import { can, OWNER, type User } from './auth';
import { evalExpr, isoDay } from '../shared/expr';
import { applyComputed, applyEffects, lookupFor, nextAuto, resolveSet, violation } from './rules';

const visible = (e: Entity, role: string) => columns(e).filter((f) => !f.hideFrom?.includes(role));

/** Adds `<field>__label` for every ref column so the client can show names instead of ids. */
function withLabels(e: Entity, rows: any[], tenantId: number) {
  for (const f of e.fields.filter((x) => x.type === 'ref')) {
    const target = entity(f.ref!)!;
    const ids = [...new Set(rows.map((r) => r[f.name]).filter((v) => v != null))];
    if (!ids.length) continue;
    const found = all<{ id: number; t: string }>(
      `SELECT id, "${target.title}" AS t FROM ${table(target)} WHERE tenant_id = ? AND id IN (${ids.map(() => '?').join(',')})`, tenantId, ...ids);
    const map = new Map(found.map((x) => [x.id, x.t]));
    for (const r of rows) if (r[f.name] != null) r[`${f.name}__label`] = map.get(r[f.name]) ?? `#${r[f.name]}`;
  }
  return rows;
}

function strip(e: Entity, role: string, rows: any[]) {
  const hidden = columns(e).filter((f) => f.hideFrom?.includes(role)).map((f) => f.name);
  if (hidden.length) for (const r of rows) for (const h of hidden) { delete r[h]; delete r[`${h}__label`]; }
  return rows;
}

/** 'today', 'today+7' and 'today-30' become dates. */
const dateToken = (v: unknown) => {
  const m = typeof v === 'string' ? /^today(?:([+-])(\d+))?$/.exec(v) : null;
  return m ? isoDay(m[1] ? Number(m[1] + m[2]) : 0) : null;
};

export function whereSql(e: Entity, where: Where | undefined) {
  const parts: string[] = [];
  const params: unknown[] = [];
  const names = new Set([...columns(e).map((c) => c.name), 'created_at', 'updated_at']);
  const cmp = (k: string, op: string, v: unknown) => {
    const d = dateToken(v);
    const short = d !== null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
    parts.push(`${short ? `substr("${k}", 1, 10)` : `"${k}"`} ${op} ?`);
    params.push(d ?? v);
  };
  for (const [k, v] of Object.entries(where ?? {})) {
    if (!names.has(k)) continue;
    if (Array.isArray(v)) { parts.push(`"${k}" IN (${v.map(() => '?').join(',')})`); params.push(...v); }
    else if (v !== null && typeof v === 'object') {
      if (v.not !== undefined) {
        const xs = Array.isArray(v.not) ? v.not : [v.not];
        parts.push(`("${k}" IS NULL OR "${k}" NOT IN (${xs.map(() => '?').join(',')}))`); params.push(...xs);
      }
      if (v.lt !== undefined) cmp(k, '<', v.lt);
      if (v.lte !== undefined) cmp(k, '<=', v.lte);
      if (v.gt !== undefined) cmp(k, '>', v.gt);
      if (v.gte !== undefined) cmp(k, '>=', v.gte);
      if (v.between) { cmp(k, '>=', v.between[0]); cmp(k, '<=', v.between[1]); }
    } else cmp(k, '=', v);
  }
  return { sql: parts.map((p) => ` AND ${p}`).join(''), params };
}

export interface ListOpts { q?: string; where?: Where; sort?: string; dir?: string; page?: number; pageSize?: number }

export function listRows(e: Entity, u: User, o: ListOpts) {
  const cols = columns(e);
  const names = new Set([...cols.map((c) => c.name), 'id', 'created_at', 'updated_at']);
  const w = whereSql(e, o.where);
  let sql = `FROM ${table(e)} WHERE tenant_id = ?${w.sql}`;
  const params: unknown[] = [u.tenant_id, ...w.params];
  if (o.q?.trim()) {
    const texty = visible(e, u.role).filter((f) => ['text', 'longtext', 'email', 'phone', 'select'].includes(f.type));
    if (texty.length) {
      sql += ` AND (${texty.map((f) => `"${f.name}" LIKE ?`).join(' OR ')})`;
      params.push(...texty.map(() => `%${o.q!.trim()}%`));
    }
  }
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n ${sql}`, ...params)!.n;
  const sort = o.sort && names.has(o.sort) ? o.sort : 'id';
  const dir = o.dir === 'asc' ? 'ASC' : 'DESC';
  const pageSize = Math.min(Math.max(o.pageSize ?? 20, 1), 1000);
  const page = Math.max(o.page ?? 1, 1);
  const rows = all(`SELECT * ${sql} ORDER BY "${sort}" ${dir}, id DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
  return { rows: strip(e, u.role, withLabels(e, rows, u.tenant_id)), total, page, pageSize };
}

/** Checks and converts a request body. Returns the clean values or a list of field errors. */
function parse(e: Entity, u: User, body: any, partial: boolean) {
  const out: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const f of e.fields) {
    if (f.hideFrom?.includes(u.role) || f.compute || f.auto) continue;
    const present = body != null && f.name in body;
    if (!present) { if (!partial && f.required) errors[f.name] = `${fieldLabel(f)} is required.`; continue; }
    let v = body[f.name];
    if (v === '' || v === undefined) v = null;
    if (v === null) { if (f.required) errors[f.name] = `${fieldLabel(f)} is required.`; else out[f.name] = null; continue; }
    const err = check(f, v, u, (x) => { v = x; });
    if (err) errors[f.name] = err; else out[f.name] = v;
  }
  return { values: out, errors };
}

function check(f: Field, v: any, u: User, set: (x: unknown) => void): string | void {
  const label = fieldLabel(f);
  switch (f.type) {
    case 'number': case 'money': {
      const n = Number(v);
      if (!Number.isFinite(n)) return `${label} must be a number.`;
      return set(n);
    }
    case 'boolean': return set(v === true || v === 1 || v === 'true' || v === '1' ? 1 : 0);
    case 'select': if (!f.options!.includes(String(v))) return `${label} must be one of: ${f.options!.join(', ')}.`; return set(String(v));
    case 'email': if (!/^\S+@\S+\.\S+$/.test(String(v))) return `${label} must be a valid email.`; return set(String(v).trim());
    case 'date': if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return `${label} must be a date.`; return set(String(v));
    case 'datetime': {
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) return `${label} must be a date and time.`;
      return set(d.toISOString());
    }
    case 'ref': {
      const id = Number(v);
      if (!get(`SELECT id FROM ${table(f.ref!)} WHERE tenant_id = ? AND id = ?`, u.tenant_id, id)) return `${label} was not found.`;
      return set(id);
    }
    default: return set(String(v));
  }
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function crudRoutes(app: Express) {
  const load = (action: 'read' | 'create' | 'update' | 'delete') => (req: Request, res: Response): Entity | undefined => {
    const e = entity(String(req.params.entity));
    if (!e) { res.status(404).json({ error: 'Unknown section.' }); return; }
    if (!can(req.user.role, e, action)) { res.status(403).json({ error: `Your role cannot ${action} ${e.label.toLowerCase()}.` }); return; }
    return e;
  };
  const one = (e: Entity, u: User, id: unknown) => get(`SELECT * FROM ${table(e)} WHERE tenant_id = ? AND id = ?`, u.tenant_id, Number(id));
  const listOpts = (e: Entity, req: Request): ListOpts => {
    const where: Where = {};
    for (const [k, v] of Object.entries(req.query)) {
      if (v === '' || typeof v !== 'string') continue;
      if (k.startsWith('f_')) where[k.slice(2)] = v;
      // from_<field>=2026-01-01&to_<field>=2026-01-31 (or today, today+7) filters a date range.
      else if (k.startsWith('from_')) where[k.slice(5)] = { ...(where[k.slice(5)] as object), gte: v };
      else if (k.startsWith('to_')) where[k.slice(3)] = { ...(where[k.slice(3)] as object), lte: v };
    }
    return { q: String(req.query.q ?? ''), where, sort: String(req.query.sort ?? ''), dir: String(req.query.dir ?? ''),
      page: Number(req.query.page) || 1, pageSize: Number(req.query.pageSize) || 20 };
  };

  app.get('/api/e/:entity', (req, res) => {
    const e = load('read')(req, res); if (!e) return;
    res.json(listRows(e, req.user, listOpts(e, req)));
  });

  app.get('/api/e/:entity/export.csv', (req, res) => {
    const e = load('read')(req, res); if (!e) return;
    const { rows } = listRows(e, req.user, { ...listOpts(e, req), page: 1, pageSize: 1000 });
    const cols = visible(e, req.user.role);
    const lines = [cols.map((c) => csvCell(fieldLabel(c))).join(',')];
    for (const r of rows) lines.push(cols.map((c) => csvCell(c.type === 'ref' ? r[`${c.name}__label`] : r[c.name])).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${e.name}.csv"`);
    res.send(lines.join('\n'));
  });

  /** Short id + title pairs for dropdowns that link to this entity. */
  app.get('/api/e/:entity/options', (req, res) => {
    const e = load('read')(req, res); if (!e) return;
    res.json(all(`SELECT id, "${e.title}" AS label FROM ${table(e)} WHERE tenant_id = ? ORDER BY "${e.title}" LIMIT 500`, req.user.tenant_id));
  });

  app.get('/api/e/:entity/:id', (req, res) => {
    const e = load('read')(req, res); if (!e) return;
    const row = one(e, req.user, req.params.id);
    if (!row) return res.status(404).json({ error: `${e.singular} not found.` });
    const history = all('SELECT user_name, action, summary, at FROM audit WHERE tenant_id = ? AND entity = ? AND record_id = ? ORDER BY id DESC LIMIT 20',
      req.user.tenant_id, e.name, row.id);
    res.json({ row: strip(e, req.user.role, withLabels(e, [row], req.user.tenant_id))[0], history });
  });

  app.post('/api/e/:entity', (req, res) => {
    const e = load('create')(req, res); if (!e) return;
    const { values, errors } = parse(e, req.user, req.body, false);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
    if (e.status) values[e.status.field] = e.status.initial;
    for (const f of e.fields) if (f.auto) values[f.name] = nextAuto(e, f, req.user.tenant_id);
    applyComputed(e, req.user.tenant_id, values);
    const broken = violation(e, req.user.tenant_id, values);
    if (broken) return res.status(400).json({ error: broken, rule: true });
    const keys = Object.keys(values);
    const t = now();
    const id = Number(run(
      `INSERT INTO ${table(e)} (tenant_id, ${keys.map((k) => `"${k}", `).join('')}created_at, updated_at) VALUES (?, ${keys.map(() => '?, ').join('')}?, ?)`,
      req.user.tenant_id, ...keys.map((k) => values[k]), t, t).lastInsertRowid);
    audit(req.user, 'created', e.name, id, String(values[e.title] ?? `#${id}`));
    res.status(201).json({ row: one(e, req.user, id) });
  });

  app.patch('/api/e/:entity/:id', (req, res) => {
    const e = load('update')(req, res); if (!e) return;
    const row = one(e, req.user, req.params.id);
    if (!row) return res.status(404).json({ error: `${e.singular} not found.` });
    const { values, errors } = parse(e, req.user, req.body, true);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
    if (Object.keys(values).length) {
      const next = applyComputed(e, req.user.tenant_id, { ...row, ...values });
      for (const f of e.fields) if (f.compute) values[f.name] = next[f.name];
      const broken = violation(e, req.user.tenant_id, next, row.id);
      if (broken) return res.status(400).json({ error: broken, rule: true });
    }
    const keys = Object.keys(values);
    if (keys.length) {
      run(`UPDATE ${table(e)} SET ${keys.map((k) => `"${k}" = ?`).join(', ')}, updated_at = ? WHERE tenant_id = ? AND id = ?`,
        ...keys.map((k) => values[k]), now(), req.user.tenant_id, row.id);
      audit(req.user, 'updated', e.name, row.id, keys.join(', '));
    }
    res.json({ row: one(e, req.user, row.id) });
  });

  app.post('/api/e/:entity/:id/transition', (req, res) => {
    const e = load('update')(req, res); if (!e) return;
    if (!e.status) return res.status(400).json({ error: `${e.label} have no status.` });
    const row = one(e, req.user, req.params.id);
    if (!row) return res.status(404).json({ error: `${e.singular} not found.` });
    const to = String(req.body?.to ?? '');
    const cur = row[e.status.field];
    const t = e.status.transitions.find((x) => x.to === to && x.from.includes(cur));
    if (!t) return res.status(400).json({ error: `Cannot move from "${cur}" to "${to}".` });
    if (t.roles && req.user.role !== OWNER() && !t.roles.includes(req.user.role))
      return res.status(403).json({ error: `Your role cannot "${t.label}".` });
    if (t.when && evalExpr(t.when, lookupFor(e, req.user.tenant_id, (k) => row[k])) !== true)
      return res.status(400).json({ error: t.message ?? `"${t.label}" is not possible right now.`, rule: true });
    const change: Record<string, unknown> = { ...resolveSet(t.set), [e.status.field]: to };
    const next = applyComputed(e, req.user.tenant_id, { ...row, ...change });
    for (const f of e.fields) if (f.compute) change[f.name] = next[f.name];
    const broken = violation(e, req.user.tenant_id, next, row.id);
    if (broken) return res.status(400).json({ error: broken, rule: true });
    const keys = Object.keys(change);
    run(`UPDATE ${table(e)} SET ${keys.map((k) => `"${k}" = ?`).join(', ')}, updated_at = ? WHERE tenant_id = ? AND id = ?`,
      ...keys.map((k) => change[k]), now(), req.user.tenant_id, row.id);
    audit(req.user, t.label.toLowerCase(), e.name, row.id, `${cur} → ${to}`);
    for (const d of applyEffects(e, t, req.user.tenant_id, next))
      audit(req.user, 'updated', d.target.name, d.id, `${d.summary} (${t.label.toLowerCase()} on ${String(row[e.title] ?? `#${row.id}`)})`);
    res.json({ row: one(e, req.user, row.id) });
  });

  app.delete('/api/e/:entity/:id', (req, res) => {
    const e = load('delete')(req, res); if (!e) return;
    const row = one(e, req.user, req.params.id);
    if (!row) return res.status(404).json({ error: `${e.singular} not found.` });
    run(`DELETE FROM ${table(e)} WHERE tenant_id = ? AND id = ?`, req.user.tenant_id, row.id);
    audit(req.user, 'deleted', e.name, row.id, String(row[e.title] ?? `#${row.id}`));
    res.json({ ok: true });
  });
}
