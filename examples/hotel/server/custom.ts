import type { Express } from 'express';
import { can } from './auth';
import { all, entity, table } from './db';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Room board: every room with the stays that touch a window of days.
 * GET /api/custom/room-board?start=YYYY-MM-DD&days=14   (start defaults to two days ago)
 */
export function registerCustom(app: Express) {
  app.get('/api/custom/room-board', (req, res) => {
    const role = req.user.role;
    const tenant = req.user.tenant_id;
    if (!can(role, entity('rooms')!, 'read') || !can(role, entity('reservations')!, 'read')) {
      res.status(403).json({ error: 'You do not have access to the room board.' });
      return;
    }
    const q = String(req.query.start ?? '');
    const start = /^\d{4}-\d{2}-\d{2}$/.test(q) && !Number.isNaN(Date.parse(q)) ? q : iso(new Date(Date.now() - 2 * DAY));
    const days = Math.min(31, Math.max(7, Number(req.query.days) || 14));
    const end = iso(new Date(Date.parse(start) + days * DAY));
    const today = iso(new Date());

    const rooms = all(
      `SELECT r.id, r.number, r.floor, r.status, t.name AS type
       FROM ${table('rooms')} r LEFT JOIN ${table('room_types')} t ON t.id = r.room_type_id AND t.tenant_id = r.tenant_id
       WHERE r.tenant_id = ? ORDER BY r.number`, tenant);

    // Guest names only for roles that may open the guest list (housekeeping sees the stay, not who it is).
    const showGuest = can(role, entity('guests')!, 'read');
    const stays = all(
      `SELECT v.id, v.code, v.room_id, v.check_in, v.check_out, v.adults, v.status${showGuest ? ', g.name AS guest, g.vip AS vip' : ''}
       FROM ${table('reservations')} v LEFT JOIN ${table('guests')} g ON g.id = v.guest_id AND g.tenant_id = v.tenant_id
       WHERE v.tenant_id = ? AND v.status NOT IN ('cancelled', 'no_show') AND v.check_in <= ? AND v.check_out >= ?
       ORDER BY v.check_in`, tenant, end, start);

    const one = (sql: string, ...p: unknown[]) => (all<{ n: number }>(sql, ...p)[0]?.n ?? 0);
    const R = table('reservations');
    const summary = {
      in_house: one(`SELECT COUNT(*) n FROM ${R} WHERE tenant_id = ? AND status = 'checked_in'`, tenant),
      arrivals: one(`SELECT COUNT(*) n FROM ${R} WHERE tenant_id = ? AND status = 'reserved' AND check_in = ?`, tenant, today),
      departures: one(`SELECT COUNT(*) n FROM ${R} WHERE tenant_id = ? AND status = 'checked_in' AND check_out = ?`, tenant, today),
      to_clean: one(`SELECT COUNT(*) n FROM ${table('rooms')} WHERE tenant_id = ? AND status = 'needs_cleaning'`, tenant),
    };
    res.json({ start, days, today, rooms, stays, summary });
  });
}
