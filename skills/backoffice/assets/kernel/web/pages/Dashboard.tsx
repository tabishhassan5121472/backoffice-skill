import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import system from '../../system.config';
import type { Widget } from '../../shared/types';
import { api } from '../api';
import { useSession } from '../App';
import { Bars, Donut, Line } from '../components/Charts';
import { PageHeader } from '../components/Shell';
import { allFields, Cell, money, num } from '../format';

type Loaded = Widget & { id: number; data: any };

export function Dashboard() {
  const { session } = useSession();
  const [widgets, setWidgets] = useState<Loaded[] | null>(null);
  useEffect(() => { api<Loaded[]>('/dashboard').then(setWidgets); }, []);
  const stats = widgets?.filter((w) => w.type === 'stat') ?? [];
  const rest = widgets?.filter((w) => w.type !== 'stat') ?? [];
  const fmt = (w: any, v: number) => (w.format === 'money' ? money(v) : num(v));

  return (
    <>
      <PageHeader title={`Good to see you, ${session.user.name.split(' ')[0]}`} sub={`Here is how ${session.tenant.name} looks right now.`} />
      {!widgets && <p className="text-sm text-zinc-400">Loading…</p>}
      {stats.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((w) => (
            <Link key={w.id} to={`/e/${w.entity}`} className="card p-4 transition hover:border-zinc-300">
              <div className="text-sm text-zinc-500">{w.label}</div>
              <div className="tnum mt-1 text-2xl font-semibold tracking-tight">{fmt(w, w.data.value)}</div>
            </Link>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rest.map((w) => {
          const e = system.entities.find((x) => x.name === w.entity)!;
          return (
            <section key={w.id} className={`card min-w-0 p-4 ${w.type === 'line' || w.type === 'list' ? 'lg:col-span-2' : ''}`}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold">{w.label}</h2>
                {w.type === 'line' && <span className="tnum text-sm text-zinc-500">{fmt(w, w.data.total)} in {w.days ?? 30} days</span>}
                {w.type === 'list' && <Link to={`/e/${w.entity}`} className="text-sm text-accent hover:underline">View all</Link>}
              </div>
              {w.type === 'bar' && <Bars points={w.data.points} />}
              {w.type === 'donut' && <Donut points={w.data.points} />}
              {w.type === 'line' && <Line points={w.data.points} />}
              {w.type === 'list' && (
                <div className="-mx-4 -mb-2 overflow-x-auto">
                  <table className="w-full">
                    <tbody className="divide-y divide-zinc-100">
                      {w.data.rows.map((r: any) => (
                        <tr key={r.id}>
                          {allFields(e, session.user.role).filter((f, i) => f.list ?? (i < 4 || f.name === e.status?.field)).slice(0, 5).map((f, i) => (
                            <td key={f.name} className="td">
                              {i === 0 ? <Link className="font-medium text-zinc-900 hover:text-accent" to={`/e/${e.name}/${r.id}`}><Cell entity={e} field={f} row={r} /></Link> : <Cell entity={e} field={f} row={r} />}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {!w.data.rows.length && <tr><td className="td text-zinc-400">Nothing to show yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
