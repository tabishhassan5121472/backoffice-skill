import type { Express } from 'express';

/**
 * Your own API routes go here. They are mounted under /api after sign-in is checked,
 * so `req.user` (id, tenant_id, name, email, role) is always set.
 *
 * Always filter by req.user.tenant_id. Helpers: `all`, `get`, `run`, `table`, `audit` from './db'
 * and `can`, `requireOwner` from './auth'.
 *
 *   app.get('/api/custom/today', (req, res) => {
 *     res.json(all(`SELECT * FROM ${table('bookings')} WHERE tenant_id = ? AND date = ?`, req.user.tenant_id, today));
 *   });
 */
export function registerCustom(_app: Express) {}
