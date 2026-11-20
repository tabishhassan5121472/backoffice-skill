#!/usr/bin/env node
// Proves the generated system works: types compile, the web app builds, the server boots,
// every role can sign in, every section answers correctly for every role, records can be
// created, changed, moved through their statuses and deleted, and organisations are isolated.
//
//   npm run verify            exit code 0 = everything passed
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); if (!pass) console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`); };
const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });
const tail = (s, n = 25) => s.trim().split('\n').slice(-n).join('\n');

const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`Node 22.13 or newer is needed (found ${process.versions.node}).`);
  process.exit(1);
}

console.log('1/4 Checking types');
const tsc = sh('npx', ['tsc', '--noEmit']);
ok('types compile', tsc.status === 0, tsc.status === 0 ? '' : `\n${tail(tsc.stdout + tsc.stderr)}`);

console.log('2/4 Building the web app');
const outDir = path.join('node_modules', '.verify-dist');
const build = sh('npx', ['vite', 'build', '--outDir', outDir, '--logLevel', 'error']);
ok('web app builds', build.status === 0, build.status === 0 ? '' : `\n${tail(build.stdout + build.stderr)}`);
fs.rmSync(outDir, { recursive: true, force: true });

console.log('3/4 Starting the server');
const icons = await import('lucide-react').then((m) => ({ ...m, ...m.icons })).catch(() => null);
const cfg = sh('npx', ['tsx', '-e', "import('./system.config.ts').then(m => console.log('@@' + JSON.stringify(m.default)))"]);
const line = cfg.stdout.split('\n').find((l) => l.startsWith('@@'));
if (!line) { console.error(`Could not read system.config.ts:\n${tail(cfg.stdout + cfg.stderr)}`); process.exit(1); }
const system = JSON.parse(line.slice(2));
if (icons) {
  const unknown = system.entities.filter((e) => e.icon && !icons[e.icon]).map((e) => `${e.name}: "${e.icon}"`);
  ok('every icon exists', unknown.length === 0, `not lucide icon names: ${unknown.join(', ')}`);
}

const port = Number(process.env.VERIFY_PORT) || 20000 + Math.floor(Math.random() * 20000);
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'backoffice-')), 'verify.db');
const server = spawn('npx', ['tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(port), DB_FILE: dbFile, API_ONLY: '1', VERIFY: '1' }, shell: process.platform === 'win32',
});
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));
const base = `http://localhost:${port}`;
const started = await new Promise((resolve) => {
  const t = setTimeout(() => resolve(false), 30000);
  server.on('exit', () => { clearTimeout(t); resolve(false); });
  const poll = setInterval(() => { if (log.includes('is running at')) { clearInterval(poll); clearTimeout(t); resolve(true); } }, 100);
});
if (!started) {
  console.error(`The server did not start:\n${tail(log, 40)}`);
  server.kill();
  process.exit(1);
}

async function call(cookie, method, url, body) {
  const res = await fetch(base + url, {
    method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

const owner = system.roles[0].name;
const can = (role, e, action) => role === owner || !e.permissions || (e.permissions[role] ?? []).includes(action);
const columns = (e) => [...e.fields, ...(e.status ? [{ name: e.status.field, type: 'select' }] : [])];

try {
  console.log('4/4 Exercising the system');
  ok('signed-out requests are refused', (await call(null, 'GET', '/api/dashboard')).status === 401);

  const demo = (await call(null, 'GET', '/api/auth/demo')).json;
  const sessions = {};
  for (const a of demo.accounts) {
    const r = await call(null, 'POST', '/api/auth/login', { email: a.email, password: demo.password });
    ok(`sign in: ${a.tenant} / ${a.role}`, r.status === 200 && !!r.cookie, `status ${r.status}`);
    (sessions[a.tenant] ??= {})[a.role] = r.cookie;
  }
  const tenants = Object.keys(sessions);
  const A = sessions[tenants[0]];

  for (const role of system.roles.map((r) => r.name)) {
    const c = A[role];
    const dash = await call(c, 'GET', '/api/dashboard');
    ok(`dashboard loads for ${role}`, dash.status === 200 && Array.isArray(dash.json), `status ${dash.status}`);
    const team = await call(c, 'GET', '/api/team');
    ok(`team page is owner-only (${role})`, team.status === (role === owner ? 200 : 403), `status ${team.status}`);
    for (const e of system.entities) {
      const r = await call(c, 'GET', `/api/e/${e.name}?pageSize=5`);
      const expected = can(role, e, 'read') ? 200 : 403;
      ok(`${e.name}: list as ${role} is ${expected}`, r.status === expected, `status ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
      if (r.status !== 200) continue;
      const want = Array.isArray(e.seed) ? e.seed.length : e.seed;
      // Rows that would break a business rule are skipped when demo data is built, so rules allow fewer rows.
      const enough = e.rules?.length && !Array.isArray(e.seed) ? r.json.total >= Math.min(want, 3) && r.json.total <= want : r.json.total === want;
      ok(`${e.name}: has demo rows`, want === 0 || enough, `expected ${want}, got ${r.json.total}`);
      const hidden = columns(e).filter((f) => f.hideFrom?.includes(role)).map((f) => f.name);
      const leaked = hidden.filter((h) => r.json.rows.some((row) => h in row));
      ok(`${e.name}: hidden fields stay hidden from ${role}`, leaked.length === 0, leaked.join(', '));
      if (hidden.length && can(role, e, 'update') && r.json.rows[0]) {
        const w = await call(c, 'PATCH', `/api/e/${e.name}/${r.json.rows[0].id}`, {});
        const back = w.status === 200 && w.json?.row ? hidden.filter((h) => h in w.json.row) : [];
        ok(`${e.name}: saving does not reveal hidden fields to ${role}`, back.length === 0, back.join(', '));
      }
      const csv = await call(c, 'GET', `/api/e/${e.name}/export.csv`);
      ok(`${e.name}: export works for ${role}`, csv.status === 200, `status ${csv.status}`);
    }
  }

  const dayAt = (n) => new Date(Date.now() + n * 864e5);
  // Different ways to fill in dates, tried in turn until the entity's business rules accept the record.
  const DATE_PLANS = [() => 0, (i) => i, (i) => 400 + i, (i) => -400 + i];
  const input = (e) => e.fields.filter((f) => !f.compute && !f.auto);
  for (const e of system.entities) {
    const c = A[owner];
    const options = {};
    for (const f of input(e).filter((x) => x.type === 'ref')) {
      const opts = (await call(c, 'GET', `/api/e/${f.ref}/options`)).json;
      options[f.name] = Array.isArray(opts) ? opts : [];
    }
    const build = (plan, shift, num = 12) => {
      const body = {};
      let dates = 0;
      for (const f of input(e)) {
        switch (f.type) {
          case 'number': case 'money': body[f.name] = num; break;
          case 'boolean': body[f.name] = true; break;
          case 'select': body[f.name] = f.options[0]; break;
          case 'email': body[f.name] = 'verify@example.com'; break;
          case 'date': body[f.name] = dayAt(DATE_PLANS[plan](dates++)).toISOString().slice(0, 10); break;
          case 'datetime': body[f.name] = dayAt(DATE_PLANS[plan](dates++)).toISOString(); break;
          case 'ref': if (options[f.name].length) body[f.name] = options[f.name][shift % options[f.name].length].id; break;
          default: body[f.name] = 'Verify check';
        }
      }
      return body;
    };
    const stuck = input(e).find((f) => f.type === 'ref' && f.required && !options[f.name].length);
    if (stuck) { ok(`${e.name}: create`, false, `no ${stuck.ref} to link to`); continue; }
    let body, created;
    // Rules may depend on the linked record (only a returned booking can be invoiced), so every option gets a turn.
    const shifts = Math.min(Math.max(1, ...Object.values(options).map((o) => o.length)), 80);
    // Numbers start at 12 and fall back to 1, for rules with an upper limit (guests <= sleeps).
    attempts: for (const num of [12, 1])
     for (let shift = 0; shift < shifts; shift++)
      for (let plan = 0; plan < DATE_PLANS.length; plan++) {
        body = build(plan, shift, num);
        created = await call(c, 'POST', `/api/e/${e.name}`, body);
        if (created.status === 201 || !created.json?.rule) break attempts;
      }
    ok(`${e.name}: create`, created.status === 201, created.json?.rule
      ? `no test record satisfied the business rules; the last refusal was "${created.json.error}"`
      : `status ${created.status} ${JSON.stringify(created.json).slice(0, 300)}`);
    if (created.status !== 201) continue;
    const id = created.json.row.id;
    const made = created.json.row;

    for (const f of e.fields.filter((x) => x.compute || x.auto))
      if (f.auto) ok(`${e.name}: "${f.name}" is filled in automatically`, !!made[f.name], 'it was left empty');
    for (const rule of e.rules ?? []) {
      const exempt = Object.entries(rule.unless ?? {}).some(([k, v]) => [].concat(v).includes(made[k]));
      let what = '';
      if (rule.unique && rule.unique.every((k) => made[k] != null && input(e).some((f) => f.name === k))) what = `a second ${e.singular.toLowerCase()} with the same ${rule.unique.join(' and ')}`;
      if (rule.noOverlap && !exempt && (!rule.noOverlap.end || made[rule.noOverlap.end] > made[rule.noOverlap.start])) what = `a clashing ${e.singular.toLowerCase()} for the same ${rule.noOverlap.per}`;
      if (!what) continue;
      const again = await call(c, 'POST', `/api/e/${e.name}`, body);
      ok(`${e.name}: ${what} is refused`, again.status === 400 && again.json?.rule === true, `status ${again.status}`);
      if (again.status === 201) await call(c, 'DELETE', `/api/e/${e.name}/${again.json.row.id}`);
    }

    const missing = input(e).find((f) => f.required);
    if (missing) {
      const bad = await call(c, 'POST', `/api/e/${e.name}`, { ...body, [missing.name]: '' });
      ok(`${e.name}: a missing required field is refused`, bad.status === 400, `status ${bad.status}`);
    }
    const textField = input(e).find((f) => f.type === 'text' || f.type === 'longtext');
    if (textField) {
      const up = await call(c, 'PATCH', `/api/e/${e.name}/${id}`, { [textField.name]: 'Verify changed' });
      ok(`${e.name}: update`, up.status === 200 && up.json.row[textField.name] === 'Verify changed', `status ${up.status}`);
    }
    if (e.status) {
      ok(`${e.name}: new records start as "${e.status.initial}"`, created.json.row[e.status.field] === e.status.initial);
      let cur = e.status.initial;
      const seen = new Set([cur]);
      for (let step = 0; step < 8; step++) {
        const t = e.status.transitions.find((x) => x.from.includes(cur) && !seen.has(x.to));
        if (!t) break;
        const mv = await call(c, 'POST', `/api/e/${e.name}/${id}/transition`, { to: t.to });
        // A step with a `when` condition may rightly be refused for this test record; that ends the walk.
        if (t.when && mv.status === 400 && mv.json?.rule) { ok(`${e.name}: "${t.label}" is guarded by its condition`, true); break; }
        ok(`${e.name}: "${t.label}" moves ${cur} to ${t.to}`, mv.status === 200 && mv.json.row[e.status.field] === t.to, `status ${mv.status} ${JSON.stringify(mv.json).slice(0, 200)}`);
        for (const eff of mv.status === 200 ? t.then ?? [] : []) {
          const field = e.fields.find((f) => f.name === eff.update);
          const linkedId = mv.json.row[eff.update];
          if (!field || linkedId == null || eff.when) continue;
          const linked = (await call(c, 'GET', `/api/e/${field.ref}/${linkedId}`)).json.row ?? {};
          const wrong = Object.entries(eff.set).filter(([k, v]) => v !== 'today' && v !== 'now' && String(linked[k]) !== String(v === true ? 1 : v === false ? 0 : v));
          ok(`${e.name}: "${t.label}" also updates the linked ${field.ref}`, wrong.length === 0, wrong.map(([k, v]) => `${k} should be ${v}, is ${linked[k]}`).join('; '));
        }
        cur = t.to; seen.add(cur);
      }
      const unreachable = e.status.states.map((s) => s.name).filter((s) => s !== e.status.initial && !e.status.transitions.some((t) => t.to === s));
      ok(`${e.name}: every status can be reached`, unreachable.length === 0, `no transition leads to: ${unreachable.join(', ')}`);
      const illegal = await call(c, 'POST', `/api/e/${e.name}/${id}/transition`, { to: '__nope__' });
      ok(`${e.name}: an invalid status change is refused`, illegal.status === 400, `status ${illegal.status}`);
    }
    if (tenants[1]) {
      const other = await call(sessions[tenants[1]][owner], 'GET', `/api/e/${e.name}/${id}`);
      ok(`${e.name}: another organisation cannot open the record`, other.status === 404, `status ${other.status}`);
    }
    const blockedRole = system.roles.map((r) => r.name).find((r) => !can(r, e, 'delete'));
    if (blockedRole) {
      const no = await call(A[blockedRole], 'DELETE', `/api/e/${e.name}/${id}`);
      ok(`${e.name}: ${blockedRole} cannot delete`, no.status === 403, `status ${no.status}`);
    }
    const del = await call(c, 'DELETE', `/api/e/${e.name}/${id}`);
    const gone = await call(c, 'GET', `/api/e/${e.name}/${id}`);
    ok(`${e.name}: delete`, del.status === 200 && gone.status === 404, `status ${del.status}/${gone.status}`);
  }

  // Custom routes: every role gets an answer (never a crash), and two organisations never get the same data.
  const custom = (await call(A[owner], 'GET', '/api/__custom')).json;
  for (const route of Array.isArray(custom) ? custom.filter((p) => !p.includes(':') && !p.includes('*')) : []) {
    for (const role of system.roles.map((r) => r.name)) {
      const r = await call(A[role], 'GET', route);
      // 400 is fine: the route may need query parameters. A crash (5xx) or a lost session (401) is not.
      ok(`custom route ${route} answers ${role}`, r.status < 500 && r.status !== 401 && (role !== owner || r.status !== 403), `status ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
    }
    if (tenants[1]) {
      const ra = await call(A[owner], 'GET', route);
      const a = JSON.stringify(ra.json);
      const b = JSON.stringify((await call(sessions[tenants[1]][owner], 'GET', route)).json);
      ok(`custom route ${route} keeps organisations apart`, ra.status !== 200 || a.length < 200 || a !== b, 'two organisations received identical data; filter by req.user.tenant_id');
    }
  }

  const audit = await call(A[owner], 'GET', '/api/audit');
  ok('activity log recorded the changes', audit.status === 200 && audit.json.length > 0);
} catch (err) {
  ok('verify script ran to the end', false, String(err?.stack ?? err));
} finally {
  server.kill();
  fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (failed.length) {
  console.log('\nFailed checks:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
  if (/Error|error/.test(log)) console.log(`\nServer log (last lines):\n${tail(log, 20)}`);
}
process.exit(failed.length ? 1 : 0);
