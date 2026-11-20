import type { Express } from 'express';
import { all, entity, table } from './db';
import { can } from './auth';

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

/** Your own API routes. Mounted under /api after sign-in is checked, so `req.user` is always set. */
export function registerCustom(app: Express) {
  // Fleet board: every vehicle with its bookings from 3 days ago to 17 days ahead.
  app.get('/api/custom/fleet-board', (req, res) => {
    const u = (req as any).user;
    if (!can(u.role, entity('vehicles')!, 'read') || !can(u.role, entity('bookings')!, 'read'))
      return res.status(403).json({ error: 'You do not have access to the fleet board.' });
    const from = day(-3), to = day(17);
    const showCustomer = can(u.role, entity('customers')!, 'read');
    const vehicles = all(
      `SELECT v.id, v.name, v.plate, v.status, c.name AS class_name
         FROM ${table('vehicles')} v LEFT JOIN ${table('vehicle_classes')} c ON c.id = v.class_id AND c.tenant_id = v.tenant_id
        WHERE v.tenant_id = ? AND v.status != 'retired' ORDER BY c.daily_rate, v.name`, u.tenant_id);
    const bookings = all(
      `SELECT b.id, b.reference, b.vehicle_id, b.pickup_on, b.return_on, b.status${showCustomer ? ', cu.name AS customer' : ''}
         FROM ${table('bookings')} b LEFT JOIN ${table('customers')} cu ON cu.id = b.customer_id AND cu.tenant_id = b.tenant_id
        WHERE b.tenant_id = ? AND b.status IN ('reserved', 'on_rent', 'returned') AND b.return_on >= ? AND b.pickup_on <= ?
        ORDER BY b.pickup_on`, u.tenant_id, from, to);
    res.json({ from, to, today: day(0), vehicles, bookings });
  });
}
