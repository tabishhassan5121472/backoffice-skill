import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { Icon, PageHeader } from '../components/Shell';
import { Badge, date } from '../format';
import type { Tone } from '../../shared/types';

type Mark = 'present' | 'absent' | 'late' | 'excused';
interface Row { id: number; name: string; admission_no: string; attendance_id: number | null; mark: Mark | null; note: string | null; history: (Mark | null)[] }
interface Register {
  day: string; days: string[]; canMark: boolean;
  classes: { id: number; name: string; room: string; capacity: number; teacher: string | null }[];
  class: { id: number; name: string; room: string; capacity: number; teacher: string | null } | null;
  students: Row[];
}

const MARKS: { value: Mark; label: string; tone: Tone; dot: string }[] = [
  { value: 'present', label: 'Present', tone: 'green', dot: 'bg-emerald-500' },
  { value: 'late', label: 'Late', tone: 'amber', dot: 'bg-amber-500' },
  { value: 'absent', label: 'Absent', tone: 'red', dot: 'bg-red-500' },
  { value: 'excused', label: 'Excused', tone: 'blue', dot: 'bg-sky-500' },
];
const today = () => new Date().toISOString().slice(0, 10);
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });

export function AttendanceRegister() {
  const [classId, setClassId] = useState<number | null>(null);
  const [day, setDay] = useState(today());
  const [data, setData] = useState<Register | null>(null);
  const [busy, setBusy] = useState<number | 'all' | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api<Register>(`/custom/register?day=${day}${classId ? `&class_id=${classId}` : ''}`));
    } catch (e) { setError(e instanceof ApiError ? e.message : 'The register could not be loaded.'); }
  }, [classId, day]);
  useEffect(() => { load(); }, [load]);

  const save = (s: Row, mark: Mark) =>
    s.attendance_id
      ? api(`/e/attendance/${s.attendance_id}`, { method: 'PATCH', body: { mark } })
      : api('/e/attendance', { body: { student_id: s.id, class_id: data!.class!.id, day: data!.day, mark } });

  async function setMark(s: Row, mark: Mark) {
    if (!data?.canMark || s.mark === mark) return;
    setBusy(s.id); setError('');
    try { await save(s, mark); } catch (e) { setError(e instanceof ApiError ? e.message : 'That mark could not be saved.'); }
    await load(); setBusy(null);
  }
  async function markRestPresent() {
    if (!data) return;
    setBusy('all'); setError('');
    try { for (const s of data.students.filter((x) => !x.mark)) await save(s, 'present'); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Some marks could not be saved.'); }
    await load(); setBusy(null);
  }

  const students = data?.students ?? [];
  const count = (m: Mark) => students.filter((s) => s.mark === m).length;
  const unmarked = students.filter((s) => !s.mark).length;

  return (
    <>
      <PageHeader title="Attendance register" sub={data?.class ? `${data.class.name} · ${data.class.room ?? 'No room'} · ${data.class.teacher ?? 'No class teacher'}` : 'Take the register for a class.'}>
        <select className="input w-auto" value={data?.class?.id ?? ''} onChange={(e) => setClassId(Number(e.target.value))} aria-label="Class">
          {data?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn" onClick={() => setDay(shift(day, -1))} aria-label="Previous day"><Icon name="ChevronLeft" /></button>
        <input className="input w-auto" type="date" value={day} max={today()} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Date" />
        <button className="btn" onClick={() => setDay(shift(day, 1))} disabled={day >= today()} aria-label="Next day"><Icon name="ChevronRight" /></button>
        {data?.canMark && (
          <button className="btn btn-primary" onClick={markRestPresent} disabled={busy !== null || unmarked === 0}>
            <Icon name="CheckCheck" /> Mark the rest present
          </button>
        )}
      </PageHeader>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {!data && !error && <p className="text-sm text-zinc-400">Loading…</p>}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {MARKS.map((m) => (
              <div key={m.value} className="card p-4">
                <div className="text-sm text-zinc-500">{m.label}</div>
                <div className="tnum mt-1 text-2xl font-semibold tracking-tight">{count(m.value)}</div>
              </div>
            ))}
            <div className="card p-4">
              <div className="text-sm text-zinc-500">Not marked yet</div>
              <div className="tnum mt-1 text-2xl font-semibold tracking-tight">{unmarked}</div>
            </div>
          </div>

          <section className="card min-w-0">
            <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
              <h2 className="text-sm font-semibold">{weekday(data.day)}, {date(data.day)}</h2>
              <span className="tnum text-sm text-zinc-500">{students.length} enrolled · {data.class?.capacity ?? 0} places</span>
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="th">Student</th>
                    <th className="th">Admission no.</th>
                    <th className="th">Last 5 school days</th>
                    <th className="th">{data.canMark ? 'Mark' : 'Status'}</th>
                    <th className="th">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {students.map((s) => {
                    const current = MARKS.find((m) => m.value === s.mark);
                    return (
                      <tr key={s.id} className={busy === s.id ? 'opacity-60' : ''}>
                        <td className="td font-medium text-zinc-900">{s.name}</td>
                        <td className="td tnum">{s.admission_no}</td>
                        <td className="td">
                          <div className="flex items-center gap-1">
                            {s.history.map((h, i) => (
                              <span key={data.days[i]} title={`${weekday(data.days[i])} ${date(data.days[i])}: ${h ?? 'not marked'}`}
                                className={`size-2.5 rounded-full ${MARKS.find((m) => m.value === h)?.dot ?? 'bg-zinc-200'}`} />
                            ))}
                          </div>
                        </td>
                        <td className="td">
                          {data.canMark ? (
                            <div className="flex gap-1">
                              {MARKS.map((m) => (
                                <button key={m.value} disabled={busy !== null} onClick={() => setMark(s, m.value)}
                                  className={`btn px-2 py-1 text-xs ${s.mark === m.value ? 'btn-primary' : ''}`}>{m.label}</button>
                              ))}
                            </div>
                          ) : current ? <Badge tone={current.tone}>{current.label}</Badge> : <span className="text-zinc-300">Not marked</span>}
                        </td>
                        <td className="td text-zinc-500">{s.note || <span className="text-zinc-300">—</span>}</td>
                      </tr>
                    );
                  })}
                  {!students.length && <tr><td className="td text-zinc-400" colSpan={5}>No enrolled students in this class yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
