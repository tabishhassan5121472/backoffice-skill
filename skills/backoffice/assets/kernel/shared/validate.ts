import type { Entity, Field, Seed, System } from './types';
import { exprPaths, parseExpr } from './expr';

const SNAKE = /^[a-z][a-z0-9_]*$/;
const RESERVED = new Set(['id', 'tenant_id', 'created_at', 'updated_at']);
const TYPES = new Set(['text', 'longtext', 'number', 'money', 'date', 'datetime', 'boolean', 'select', 'email', 'phone', 'ref']);

/** Returns a list of plain-language problems with the config. Empty means it is usable. */
export function validateSystem(s: System): string[] {
  const out: string[] = [];
  const bad = (m: string) => out.push(m);
  if (!s.name) bad('system.name is empty');
  if (!/^#[0-9a-fA-F]{6}$/.test(s.accent ?? '')) bad(`system.accent must be a 6-digit hex colour, got "${s.accent}"`);
  if (!s.roles?.length) bad('system.roles needs at least one role (the first is the owner)');
  if (!s.tenants?.length) bad('system.tenants needs at least one demo organisation');
  const roles = new Set((s.roles ?? []).map((r) => r.name));
  for (const r of s.roles ?? []) if (!SNAKE.test(r.name)) bad(`role "${r.name}" must be snake_case`);
  for (const t of s.tenants ?? []) if (!/^[a-z0-9-]+$/.test(t.slug)) bad(`tenant slug "${t.slug}" must be lowercase letters, digits and dashes`);

  const seen = new Set<string>();
  const fieldsOf = new Map<string, Set<string>>();
  const byName = new Map<string, Entity>();
  const cols = (e: Entity) => new Set([...e.fields.map((f) => f.name), ...(e.status ? [e.status.field] : []), 'created_at', 'updated_at']);
  /** Checks that an expression parses and only reads fields that exist (following refs to linked records). */
  const expr = (e: Entity, src: string, at: string) => {
    let paths: string[][];
    try { paths = exprPaths(parseExpr(src)); } catch (err) { return bad(`${at}: "${src}" is not a valid expression (${(err as Error).message})`); }
    for (const path of paths) {
      let ent: Entity | undefined = e;
      for (let i = 0; i < path.length && ent; i++) {
        if (!cols(ent).has(path[i])) { bad(`${at}: "${path.join('.')}" in "${src}": ${ent.name} has no field "${path[i]}"`); break; }
        if (i < path.length - 1) {
          const f: Field | undefined = ent.fields.find((x) => x.name === path[i]);
          if (f?.type !== 'ref') { bad(`${at}: "${path.join('.')}" in "${src}": "${path[i]}" is not a ref field`); break; }
          ent = byName.get(f.ref!) ?? (f.ref === e.name ? e : undefined);
        }
      }
    }
  };
  const seedExprs = (e: Entity, sd: Seed | undefined, at: string, f0?: Field) => {
    if (!sd || typeof sd !== 'object') return;
    if ('calc' in sd) expr(e, sd.calc, at);
    if ('after' in sd) expr(e, sd.after, at);
    if ('ref' in sd && f0 && f0.type !== 'ref') bad(`${at}: { ref: ... } only works on ref fields`);
    if ('when' in sd) { expr(e, sd.when, at); seedExprs(e, sd.then, at, f0); seedExprs(e, sd.else, at, f0); }
  };
  for (const e of s.entities ?? []) {
    const at = `entity "${e.name}"`;
    if (!SNAKE.test(e.name)) bad(`${at}: name must be snake_case`);
    if (seen.has(e.name)) bad(`${at}: defined twice`);
    const names = new Set<string>();
    for (const f of e.fields) {
      const fat = `${at} field "${f.name}"`;
      if (!SNAKE.test(f.name)) bad(`${fat}: name must be snake_case`);
      if (RESERVED.has(f.name)) bad(`${fat}: "${f.name}" is added automatically, remove it`);
      if (names.has(f.name)) bad(`${fat}: defined twice`);
      names.add(f.name);
      if (!TYPES.has(f.type)) bad(`${fat}: unknown type "${f.type}"`);
      if (f.type === 'select' && !f.options?.length) bad(`${fat}: a select needs options`);
      if (f.type === 'ref') {
        if (!f.ref) bad(`${fat}: a ref needs "ref" (the entity it points to)`);
        else if (f.ref !== e.name && !seen.has(f.ref))
          bad(`${fat}: references "${f.ref}", which must be defined earlier in system.entities`);
      }
      for (const r of f.hideFrom ?? []) if (!roles.has(r)) bad(`${fat}: hideFrom has unknown role "${r}"`);
      const sd = f.seed as any;
      if (sd && typeof sd === 'object' && sd.pick && f.type === 'select')
        for (const v of sd.pick) if (!f.options!.includes(v)) bad(`${fat}: seed picks "${v}", which is not in options`);
    }
    if (!names.has(e.title)) bad(`${at}: title "${e.title}" is not one of its fields`);
    if (e.status) {
      const st = e.status;
      if (names.has(st.field)) bad(`${at}: status field "${st.field}" must not also be listed in fields`);
      if (RESERVED.has(st.field) || !SNAKE.test(st.field)) bad(`${at}: bad status field name "${st.field}"`);
      const states = new Set(st.states.map((x) => x.name));
      if (!states.has(st.initial)) bad(`${at}: status.initial "${st.initial}" is not a state`);
      for (const t of st.transitions) {
        if (!states.has(t.to)) bad(`${at}: transition "${t.label}" goes to unknown state "${t.to}"`);
        for (const f of t.from) if (!states.has(f)) bad(`${at}: transition "${t.label}" starts from unknown state "${f}"`);
        for (const r of t.roles ?? []) if (!roles.has(r)) bad(`${at}: transition "${t.label}" has unknown role "${r}"`);
      }
      names.add(st.field);
    }
    for (const r of Object.keys(e.permissions ?? {})) if (!roles.has(r)) bad(`${at}: permissions has unknown role "${r}"`);
    if (Array.isArray(e.seed)) {
      e.seed.forEach((row, i) => {
        for (const k of Object.keys(row)) if (!names.has(k)) bad(`${at}: seed row ${i + 1} has unknown field "${k}"`);
      });
    } else if (typeof e.seed !== 'number' || e.seed < 0) bad(`${at}: seed must be a row count or a list of rows`);
    for (const f of e.fields) {
      const fat = `${at} field "${f.name}"`;
      if (f.compute) expr(e, f.compute, `${fat} compute`);
      if (f.compute && f.auto) bad(`${fat}: use either compute or auto, not both`);
      if (f.auto && f.type !== 'text') bad(`${fat}: auto only works on text fields`);
      seedExprs(e, f.seed, `${fat} seed`, f);
    }
    if (e.status) {
      const states = new Set(e.status.states.map((x) => x.name));
      for (const t of e.status.transitions) {
        const tat = `${at} transition "${t.label}"`;
        for (const k of Object.keys(t.set ?? {})) if (!e.fields.some((f) => f.name === k)) bad(`${tat}: set has unknown field "${k}"`);
        if (t.when) expr(e, t.when, `${tat} when`);
        for (const eff of t.then ?? []) {
          if (eff.when) expr(e, eff.when, `${tat} then.when`);
          const f = e.fields.find((x) => x.name === eff.update);
          const target = f?.type === 'ref' ? byName.get(f.ref!) ?? (f.ref === e.name ? e : undefined) : undefined;
          if (!target) { bad(`${tat}: then.update "${eff.update}" must be a ref field of ${e.name}`); continue; }
          for (const [k, v] of Object.entries(eff.set)) {
            if (!cols(target).has(k)) bad(`${tat}: then sets "${k}", which is not a field of ${target.name}`);
            else if (k === target.status?.field && !target.status.states.some((x) => x.name === v)) bad(`${tat}: then sets ${target.name}.${k} to unknown state "${v}"`);
          }
        }
      }
      for (const r of e.status.seed ?? []) {
        expr(e, r.when, `${at} status.seed`);
        for (const k of Object.keys(r.weights)) if (!states.has(k)) bad(`${at}: status.seed uses unknown state "${k}"`);
      }
    }
    for (const rule of e.rules ?? []) {
      const rat = `${at} rule`;
      const has = (k: string, what: string) => { if (!names.has(k)) bad(`${rat}: ${what} "${k}" is not a field of ${e.name}`); };
      if ('check' in rule) { expr(e, rule.check, rat); if (!rule.message) bad(`${rat} "${rule.check}": needs a message`); }
      else if ('unique' in rule) rule.unique.forEach((k) => has(k, 'unique'));
      else if ('noOverlap' in rule) { has(rule.noOverlap.per, 'noOverlap.per'); has(rule.noOverlap.start, 'noOverlap.start'); if (rule.noOverlap.end) has(rule.noOverlap.end, 'noOverlap.end'); }
      else if ('capacity' in rule) {
        has(rule.capacity.per, 'capacity.per');
        const f = e.fields.find((x) => x.name === rule.capacity.per);
        if (f && f.type !== 'ref') bad(`${rat}: capacity.per "${f.name}" must be a ref field`);
        else if (f && typeof rule.capacity.max === 'string' && !byName.get(f.ref!)?.fields.some((x) => x.name === rule.capacity.max))
          bad(`${rat}: capacity.max "${rule.capacity.max}" is not a field of ${f.ref}`);
      } else bad(`${rat}: unknown rule ${JSON.stringify(rule)}`);
      if ('unless' in rule) for (const k of Object.keys(rule.unless ?? {})) has(k, 'unless');
    }
    seen.add(e.name);
    byName.set(e.name, e);
    fieldsOf.set(e.name, names);
  }

  (s.dashboard ?? []).forEach((w, i) => {
    const at = `dashboard widget ${i + 1} ("${w.label}")`;
    const fs = fieldsOf.get(w.entity);
    if (!fs) return bad(`${at}: unknown entity "${w.entity}"`);
    const need = (f: string | undefined, what: string) => {
      if (!f) bad(`${at}: needs ${what}`);
      else if (!fs.has(f) && f !== 'created_at' && f !== 'updated_at') bad(`${at}: ${what} "${f}" is not a field of ${w.entity}`);
    };
    if (w.type === 'stat' && w.agg === 'sum') need(w.field, 'field');
    if (w.type === 'bar' || w.type === 'donut') need(w.groupBy, 'groupBy');
    if (w.type === 'line') { need(w.dateField, 'dateField'); if (w.agg === 'sum') need(w.field, 'field'); }
    if (w.type === 'list' && w.sort) need(w.sort, 'sort');
    for (const k of Object.keys((w as any).where ?? {})) need(k, 'where key');
  });
  return out;
}
