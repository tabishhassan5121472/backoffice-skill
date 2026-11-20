import type { Express } from 'express';
import { can } from './auth';
import { all, entity, table } from './db';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The Monday (UTC) of the week that holds the given day. */
function monday(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

export function registerCustom(app: Express) {
  // Weekly timesheet: hours per person per day, plus the week's hours per project.
  // ?week=YYYY-MM-DD is any day in the week wanted (defaults to this week).
  app.get('/api/custom/timesheet', (req, res) => {
    const time = entity('time_entries')!;
    const role = req.user.role;
    if (!can(role, time, 'read')) return void res.status(403).json({ error: 'You cannot see time entries.' });
    const asked = typeof req.query.week === 'string' ? req.query.week : iso(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asked) || Number.isNaN(Date.parse(asked))) return void res.status(400).json({ error: 'week must be a date like 2026-01-31.' });

    const start = monday(asked);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setUTCDate(d.getUTCDate() + i); return iso(d); });
    // Money is shown only to roles that may see the amount field.
    const money = !time.fields.find((f) => f.name === 'amount')?.hideFrom?.includes(role);
    const tenant = req.user.tenant_id;

    const rows = all<{ staff_id: number; date: string; hours: number; pending: number }>(
      `SELECT staff_id, date, SUM(hours) AS hours, SUM(status = 'submitted') AS pending
       FROM ${table('time_entries')} WHERE tenant_id = ? AND date BETWEEN ? AND ? AND status != 'rejected'
       GROUP BY staff_id, date`, tenant, days[0], days[6]);
    const staff = all<{ id: number; name: string; discipline: string; weekly_hours: number | null; status: string }>(
      `SELECT id, name, discipline, weekly_hours, status FROM ${table('staff')} WHERE tenant_id = ? ORDER BY name`, tenant);
    const people = staff
      .map((s) => {
        const mine = rows.filter((r) => r.staff_id === s.id);
        const hours = days.map((d) => mine.find((r) => r.date === d)?.hours ?? 0);
        return {
          id: s.id, name: s.name, discipline: s.discipline, weekly_hours: s.weekly_hours, hours,
          total: hours.reduce((a, b) => a + b, 0), pending: mine.reduce((a, r) => a + r.pending, 0), active: s.status === 'active',
        };
      })
      .filter((p) => p.active || p.total > 0);

    const projects = all<{ id: number; name: string; client: string; hours: number; billable_hours: number; amount: number }>(
      `SELECT p.id, p.name, c.name AS client, SUM(t.hours) AS hours,
              SUM(CASE WHEN t.billable THEN t.hours ELSE 0 END) AS billable_hours,
              SUM(CASE WHEN t.billable THEN t.amount ELSE 0 END) AS amount
       FROM ${table('time_entries')} t
       JOIN ${table('projects')} p ON p.id = t.project_id AND p.tenant_id = t.tenant_id
       JOIN ${table('clients')} c ON c.id = p.client_id AND c.tenant_id = t.tenant_id
       WHERE t.tenant_id = ? AND t.date BETWEEN ? AND ? AND t.status != 'rejected'
       GROUP BY p.id ORDER BY hours DESC`, tenant, days[0], days[6])
      .map((p) => (money ? p : { ...p, amount: undefined }));

    const total = people.reduce((a, p) => a + p.total, 0);
    const billable = projects.reduce((a, p) => a + p.billable_hours, 0);
    res.json({
      week_start: days[0], week_end: days[6], days, people, projects, money,
      totals: {
        hours: total, billable_hours: billable, pending: people.reduce((a, p) => a + p.pending, 0),
        capacity: people.filter((p) => p.active).reduce((a, p) => a + (p.weekly_hours ?? 0), 0),
        amount: money ? projects.reduce((a, p) => a + (p.amount ?? 0), 0) : undefined,
      },
    });
  });
}
