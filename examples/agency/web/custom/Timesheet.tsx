import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Icon, PageHeader } from '../components/Shell';
import { Badge, date, money, num } from '../format';

interface Person { id: number; name: string; discipline: string; weekly_hours: number | null; hours: number[]; total: number; pending: number }
interface Project { id: number; name: string; client: string; hours: number; billable_hours: number; amount?: number }
interface Sheet {
  week_start: string; week_end: string; days: string[]; people: Person[]; projects: Project[]; money: boolean;
  totals: { hours: number; billable_hours: number; pending: number; capacity: number; amount?: number };
}

const shift = (day: string, by: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
const dayNum = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const today = () => new Date().toISOString().slice(0, 10);

/** A cell of hours: empty days are quiet, long days stand out. */
function Hours({ value }: { value: number }) {
  if (!value) return <span className="text-zinc-300">·</span>;
  return <span className={`tnum inline-block min-w-9 rounded-md px-1.5 py-0.5 text-center ${value > 9 ? 'bg-amber-50 text-amber-800' : 'bg-accent/10 text-zinc-900'}`}>{num(value)}</span>;
}

export function Timesheet() {
  const [week, setWeek] = useState(today());
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    api<Sheet>(`/custom/timesheet?week=${week}`).then(setSheet).catch((e) => setError(e.message));
  }, [week]);

  const t = sheet?.totals;
  const used = t && t.capacity ? Math.round((t.hours / t.capacity) * 100) : 0;
  const thisWeek = sheet ? today() >= sheet.week_start && today() <= sheet.week_end : true;

  return (
    <>
      <PageHeader title="Weekly timesheet" sub={sheet ? `${date(sheet.week_start)} to ${date(sheet.week_end)}` : 'Hours logged by everyone, day by day.'}>
        <button className="btn" onClick={() => setWeek(shift(sheet?.week_start ?? week, -7))} aria-label="Previous week"><Icon name="ChevronLeft" /></button>
        <button className="btn" onClick={() => setWeek(today())} disabled={thisWeek}>This week</button>
        <button className="btn" onClick={() => setWeek(shift(sheet?.week_start ?? week, 7))} disabled={thisWeek} aria-label="Next week"><Icon name="ChevronRight" /></button>
        <Link to="/e/time_entries/new" className="btn btn-primary"><Icon name="Plus" /> Log time</Link>
      </PageHeader>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!sheet && !error && <p className="text-sm text-zinc-400">Loading…</p>}

      {sheet && t && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card p-4">
              <div className="text-sm text-zinc-500">Hours logged</div>
              <div className="tnum mt-1 text-2xl font-semibold tracking-tight">{num(t.hours)}</div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-zinc-500">Billable hours</div>
              <div className="tnum mt-1 text-2xl font-semibold tracking-tight">{num(t.billable_hours)}</div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-zinc-500">Of studio capacity</div>
              <div className="tnum mt-1 text-2xl font-semibold tracking-tight">{used}%</div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-zinc-500">{sheet.money ? 'Billable value' : 'Waiting for approval'}</div>
              <div className="tnum mt-1 text-2xl font-semibold tracking-tight">{sheet.money ? money(t.amount) : num(t.pending)}</div>
            </div>
          </div>

          <section className="card mb-4 min-w-0">
            <div className="flex items-baseline justify-between gap-3 p-4 pb-2">
              <h2 className="text-sm font-semibold">Hours by person</h2>
              <Link to="/e/time_entries" className="text-sm text-accent hover:underline">All time entries</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="th">Person</th>
                    {sheet.days.map((d) => (
                      <th key={d} className={`th text-center ${d === today() ? 'text-accent' : ''}`}>
                        {weekday(d)} <span className="font-normal normal-case text-zinc-400">{dayNum(d)}</span>
                      </th>
                    ))}
                    <th className="th text-right">Total</th>
                    <th className="th text-right">Of week</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {sheet.people.map((p) => {
                    const pct = p.weekly_hours ? Math.round((p.total / p.weekly_hours) * 100) : null;
                    return (
                      <tr key={p.id}>
                        <td className="td">
                          <Link className="font-medium text-zinc-900 hover:text-accent" to={`/e/staff/${p.id}`}>{p.name}</Link>
                          {p.pending > 0 && <span className="ml-2"><Badge tone="blue">{p.pending} to approve</Badge></span>}
                        </td>
                        {p.hours.map((h, i) => <td key={i} className="td text-center"><Hours value={h} /></td>)}
                        <td className="td tnum text-right font-medium text-zinc-900">{num(p.total)}</td>
                        <td className="td tnum text-right text-zinc-500">{pct == null ? '—' : `${pct}%`}</td>
                      </tr>
                    );
                  })}
                  {!sheet.people.length && <tr><td className="td text-zinc-400" colSpan={10}>Nobody on the team yet.</td></tr>}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-200">
                    <td className="td font-medium text-zinc-900">Studio</td>
                    {sheet.days.map((_, i) => <td key={i} className="td tnum text-center font-medium text-zinc-900">{num(sheet.people.reduce((a, p) => a + p.hours[i], 0))}</td>)}
                    <td className="td tnum text-right font-semibold text-zinc-900">{num(t.hours)}</td>
                    <td className="td tnum text-right text-zinc-500">{used}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="card min-w-0">
            <div className="p-4 pb-2"><h2 className="text-sm font-semibold">Where the week went</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="th">Project</th><th className="th">Client</th>
                    <th className="th text-right">Hours</th><th className="th text-right">Billable</th>
                    {sheet.money && <th className="th text-right">Value</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {sheet.projects.map((p) => (
                    <tr key={p.id}>
                      <td className="td"><Link className="font-medium text-zinc-900 hover:text-accent" to={`/e/projects/${p.id}`}>{p.name}</Link></td>
                      <td className="td">{p.client}</td>
                      <td className="td tnum text-right">{num(p.hours)}</td>
                      <td className="td tnum text-right">{num(p.billable_hours)}</td>
                      {sheet.money && <td className="td tnum text-right">{money(p.amount)}</td>}
                    </tr>
                  ))}
                  {!sheet.projects.length && <tr><td className="td text-zinc-400" colSpan={5}>No time was logged this week.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
