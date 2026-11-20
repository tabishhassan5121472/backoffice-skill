import type { Express } from 'express';
import system from '../system.config';
import type { Widget } from '../shared/types';
import { all, entity, get, table } from './db';
import { can, type User } from './auth';
import { listRows, whereSql } from './crud';

function compute(w: Widget, u: User) {
  const e = entity(w.entity)!;
  const wh = whereSql(e, w.where);
  const base = `FROM ${table(e)} WHERE tenant_id = ?${wh.sql}`;
  const p = [u.tenant_id, ...wh.params];
  switch (w.type) {
    case 'stat': {
      const expr = w.agg === 'sum' ? `COALESCE(SUM("${w.field}"), 0)` : 'COUNT(*)';
      return { value: get<{ v: number }>(`SELECT ${expr} AS v ${base}`, ...p)!.v };
    }
    case 'bar': case 'donut': {
      const f = [...e.fields, ...(e.status ? [{ name: e.status.field, type: 'select' as const, ref: undefined }] : [])].find((x) => x.name === w.groupBy)!;
      let rows = all<{ k: any; n: number }>(`SELECT "${w.groupBy}" AS k, COUNT(*) AS n ${base} GROUP BY 1 ORDER BY n DESC LIMIT 8`, ...p);
      if (f.type === 'ref') {
        const t = entity(f.ref!)!;
        rows = rows.map((r) => ({ ...r, k: r.k == null ? null : get<{ t: string }>(`SELECT "${t.title}" AS t FROM ${table(t)} WHERE id = ?`, r.k)?.t }));
      }
      const tone = (k: string) => (w.groupBy === e.status?.field ? e.status.states.find((s) => s.name === k)?.tone : undefined);
      return { points: rows.map((r) => ({ label: r.k == null ? 'None' : String(r.k), value: r.n, tone: tone(String(r.k)) })) };
    }
    case 'line': {
      const days = w.days ?? 30;
      const expr = w.agg === 'sum' ? `COALESCE(SUM("${w.field}"), 0)` : 'COUNT(*)';
      const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
      const rows = all<{ d: string; v: number }>(
        `SELECT substr("${w.dateField}", 1, 10) AS d, ${expr} AS v ${base} AND substr("${w.dateField}", 1, 10) >= ? GROUP BY 1`, ...p, since);
      const map = new Map(rows.map((r) => [r.d, r.v]));
      const points = Array.from({ length: days }, (_, i) => {
        const d = new Date(Date.now() - (days - 1 - i) * 864e5).toISOString().slice(0, 10);
        return { label: d, value: map.get(d) ?? 0 };
      });
      return { points, total: points.reduce((a, b) => a + b.value, 0) };
    }
    case 'list':
      return { rows: listRows(e, u, { where: w.where, sort: w.sort, dir: w.dir, pageSize: w.limit ?? 6 }).rows };
  }
}

export function dashboardRoutes(app: Express) {
  app.get('/api/dashboard', (req, res) => {
    const out = system.dashboard
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => can(req.user.role, entity(w.entity)!, 'read'))
      .filter(({ w }) => {
        // A widget built on a field this role may not see is left out entirely.
        const e = entity(w.entity)!;
        const used = [(w as any).field, (w as any).groupBy].filter(Boolean);
        return !e.fields.some((f) => used.includes(f.name) && f.hideFrom?.includes(req.user.role));
      })
      .map(({ w, i }) => ({ id: i, ...w, data: compute(w, req.user) }));
    res.json(out);
  });
}
