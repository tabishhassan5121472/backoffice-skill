import type { Express } from 'express';
import { can } from './auth';
import { all, entity, table } from './db';

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/**
 * The attendance register: one class on one day, every enrolled student with today's mark
 * and the marks of the school days before it. Marks are saved through the generated API
 * (/api/e/attendance), so the "one mark per student per day" rule and the activity log still apply.
 */
export function registerCustom(app: Express) {
  app.get('/api/custom/register', (req, res) => {
    const role = req.user.role;
    const tenant = req.user.tenant_id;
    if (!can(role, entity('attendance')!, 'read') || !can(role, entity('students')!, 'read')) {
      res.status(403).json({ error: 'You do not have access to the attendance register.' });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const day = isDay(req.query.day) && req.query.day <= today ? req.query.day : today;
    const classes = all<{ id: number; name: string; room: string; capacity: number; teacher: string | null }>(
      `SELECT c.id, c.name, c.room, c.capacity, t.name AS teacher
         FROM ${table('classes')} c LEFT JOIN ${table('teachers')} t ON t.id = c.teacher_id AND t.tenant_id = c.tenant_id
        WHERE c.tenant_id = ? ORDER BY c.grade, c.name`, tenant);
    const cls = classes.find((c) => c.id === Number(req.query.class_id)) ?? classes[0] ?? null;
    // The chosen day and the school days (Monday to Friday) before it, five in all, oldest first.
    const days = [day];
    for (let d = shift(day, -1); days.length < 5; d = shift(d, -1)) {
      const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (weekday !== 0 && weekday !== 6) days.unshift(d);
    }
    const students = cls
      ? all<{ id: number; name: string; admission_no: string }>(
          `SELECT id, name, admission_no FROM ${table('students')}
            WHERE tenant_id = ? AND class_id = ? AND status = 'enrolled' ORDER BY name`, tenant, cls.id)
      : [];
    const marks = cls
      ? all<{ id: number; student_id: number; day: string; mark: string; note: string | null }>(
          `SELECT a.id, a.student_id, a.day, a.mark, a.note FROM ${table('attendance')} a
             JOIN ${table('students')} s ON s.id = a.student_id AND s.tenant_id = a.tenant_id
            WHERE a.tenant_id = ? AND s.class_id = ? AND a.day BETWEEN ? AND ?`, tenant, cls.id, days[0], day)
      : [];
    res.json({
      day, days, classes, class: cls,
      canMark: can(role, entity('attendance')!, 'create') && can(role, entity('attendance')!, 'update'),
      students: students.map((s) => {
        const own = marks.filter((m) => m.student_id === s.id);
        const now = own.find((m) => m.day === day);
        return {
          ...s,
          attendance_id: now?.id ?? null, mark: now?.mark ?? null, note: now?.note ?? null,
          history: days.map((d) => own.find((m) => m.day === d)?.mark ?? null),
        };
      }),
    });
  });
}
