import type { Express, NextFunction, Request, Response } from 'express';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import system from '../system.config';
import type { Action, Entity } from '../shared/types';
import { all, audit, get, now, run } from './db';
import { DEMO_PASSWORD } from './seed';

export interface User { id: number; tenant_id: number; name: string; email: string; role: string }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user: User } }
}

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
}
function checkPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(':');
  const a = scryptSync(pw, salt, 32);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const OWNER = () => system.roles[0].name;

export function can(role: string, e: Entity, action: Action) {
  if (role === OWNER() || !e.permissions) return true;
  return (e.permissions[role] ?? []).includes(action);
}

const cookie = (req: Request, name: string) =>
  (req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];

function currentUser(req: Request): User | undefined {
  const sid = cookie(req, 'sid');
  if (!sid) return;
  return get<User>(
    `SELECT u.id, u.tenant_id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`, sid, now());
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Please sign in.' });
  req.user = u;
  next();
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.user.role !== OWNER()) return res.status(403).json({ error: 'Only the owner can do this.' });
  next();
}

const describe = (u: User) => ({
  user: u,
  tenant: get('SELECT id, name, slug FROM tenants WHERE id = ?', u.tenant_id),
  isOwner: u.role === OWNER(),
  permissions: Object.fromEntries(system.entities.map((e) => [
    e.name, (['read', 'create', 'update', 'delete'] as Action[]).filter((a) => can(u.role, e, a)),
  ])),
});

export function authRoutes(app: Express) {
  // Demo accounts for the login page. Only seeded accounts are listed, never ones created later.
  app.get('/api/auth/demo', (_req, res) => {
    const rows = all(`SELECT t.name AS tenant, u.role, u.email FROM users u JOIN tenants t ON t.id = u.tenant_id
      WHERE u.demo = 1 ORDER BY t.id, u.id`);
    res.json({ password: DEMO_PASSWORD, accounts: rows });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    const row = get<User & { password_hash: string }>('SELECT * FROM users WHERE email = ?', String(email ?? '').trim().toLowerCase());
    if (!row || !checkPassword(String(password ?? ''), row.password_hash))
      return res.status(401).json({ error: 'Wrong email or password.' });
    const sid = randomBytes(24).toString('hex');
    run('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', sid, row.id, new Date(Date.now() + 7 * 864e5).toISOString());
    res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 86400}`);
    const u: User = { id: row.id, tenant_id: row.tenant_id, name: row.name, email: row.email, role: row.role };
    audit(u, 'signed in', 'session', null, u.email);
    res.json(describe(u));
  });

  app.post('/api/auth/logout', (req, res) => {
    const sid = cookie(req, 'sid');
    if (sid) run('DELETE FROM sessions WHERE id = ?', sid);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: 'Please sign in.' });
    res.json(describe(u));
  });
}

export function teamRoutes(app: Express) {
  app.get('/api/team', requireOwner, (req, res) => {
    res.json(all('SELECT id, name, email, role, created_at FROM users WHERE tenant_id = ? ORDER BY id', req.user.tenant_id));
  });

  app.post('/api/team', requireOwner, (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const role = String(req.body?.role ?? '');
    const password = String(req.body?.password ?? '');
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a name and a valid email.' });
    if (!system.roles.some((r) => r.name === role)) return res.status(400).json({ error: 'Pick a role.' });
    if (password.length < 8) return res.status(400).json({ error: 'The password needs at least 8 characters.' });
    if (get('SELECT id FROM users WHERE email = ?', email)) return res.status(400).json({ error: 'That email is already in use.' });
    const id = Number(run('INSERT INTO users (tenant_id, name, email, role, password_hash, created_at) VALUES (?,?,?,?,?,?)',
      req.user.tenant_id, name, email, role, hashPassword(password), now()).lastInsertRowid);
    audit(req.user, 'added', 'team', id, `${name} as ${role}`);
    res.status(201).json({ id, name, email, role });
  });

  app.get('/api/audit', requireOwner, (req, res) => {
    res.json(all('SELECT id, user_name, action, entity, record_id, summary, at FROM audit WHERE tenant_id = ? ORDER BY id DESC LIMIT 200', req.user.tenant_id));
  });
}
