import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import system from '../../system.config';
import type { Entity } from '../../shared/types';
import { fieldLabel } from '../../shared/types';
import { api } from '../api';
import { useCan, useSession } from '../App';
import { PageHeader } from '../components/Shell';
import { allFields, Cell, dateTime, StatusBadge } from '../format';

export function EntityDetail() {
  const { entity: name, id } = useParams();
  const e = system.entities.find((x) => x.name === name);
  const can = useCan();
  const { session } = useSession();
  const nav = useNavigate();
  const [data, setData] = useState<{ row: any; history: any[] } | null>(null);
  const [error, setError] = useState('');
  const load = () => api(`/e/${name}/${id}`).then(setData).catch((err) => setError(err.message));
  useEffect(() => { if (e) load(); }, [name, id]);

  if (!e || !can(e.name, 'read')) return <Navigate to="/" replace />;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-zinc-400">Loading…</p>;
  const { row } = data;
  const st = e.status;
  const moves = st && can(e.name, 'update')
    ? st.transitions.filter((t) => t.from.includes(row[st.field]) && (!t.roles || session.isOwner || t.roles.includes(session.user.role)))
    : [];

  async function move(to: string) {
    setError('');
    try { await api(`/e/${e!.name}/${id}/transition`, { body: { to } }); await load(); } catch (err) { alertError(err); }
  }
  async function remove() {
    if (!window.confirm(`Delete this ${e!.singular.toLowerCase()}? This cannot be undone.`)) return;
    try { await api(`/e/${e!.name}/${id}`, { method: 'DELETE' }); nav(`/e/${e!.name}`); } catch (err) { alertError(err); }
  }
  const alertError = (err: unknown) => window.alert((err as Error).message);
  const related = system.entities.filter((x) => can(x.name, 'read') && x.fields.some((f) => f.type === 'ref' && f.ref === e.name));

  return (
    <>
      <Link to={`/e/${e.name}`} className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800"><ArrowLeft className="size-4" />{e.label}</Link>
      <PageHeader title={String(row[e.title] ?? `${e.singular} #${row.id}`)} sub={`${e.singular} · added ${dateTime(row.created_at)}`}>
        {st && <StatusBadge entity={e} value={row[st.field]} />}
        {moves.map((t) => <button key={t.to} className="btn" onClick={() => move(t.to)}>{t.label}</button>)}
        {can(e.name, 'update') && <Link className="btn" to={`/e/${e.name}/${id}/edit`}><Pencil className="size-4" />Edit</Link>}
        {can(e.name, 'delete') && <button className="btn btn-danger" onClick={remove}><Trash2 className="size-4" />Delete</button>}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {allFields(e, session.user.role).filter((f) => f.name !== st?.field).map((f) => (
              <div key={f.name} className={f.type === 'longtext' ? 'sm:col-span-2' : ''}>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{fieldLabel(f)}</dt>
                <dd className="mt-1 text-sm whitespace-pre-wrap">
                  {f.type === 'ref' && row[f.name] != null && can(f.ref!, 'read')
                    ? <Link className="text-accent hover:underline" to={`/e/${f.ref}/${row[f.name]}`}>{row[`${f.name}__label`]}</Link>
                    : <Cell entity={e} field={f} row={row} />}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">Activity</h2>
          <ol className="space-y-3">
            {data.history.map((h, i) => (
              <li key={i} className="text-sm">
                <div><span className="font-medium">{h.user_name}</span> {h.action}{h.summary && h.action !== 'created' ? <span className="text-zinc-500"> · {h.summary}</span> : null}</div>
                <div className="text-xs text-zinc-400">{dateTime(h.at)}</div>
              </li>
            ))}
            {!data.history.length && <li className="text-sm text-zinc-400">No changes recorded yet.</li>}
          </ol>
        </section>
      </div>

      {related.map((r) => <Related key={r.name} parent={e} child={r} id={Number(id)} />)}
    </>
  );
}

function Related({ parent, child, id }: { parent: Entity; child: Entity; id: number }) {
  const { session } = useSession();
  const link = child.fields.find((f) => f.type === 'ref' && f.ref === parent.name)!;
  const [data, setData] = useState<{ rows: any[]; total: number } | null>(null);
  useEffect(() => { api(`/e/${child.name}?f_${link.name}=${id}&pageSize=8`).then(setData).catch(() => {}); }, [child.name, id]);
  if (!data?.total) return null;
  const cols = allFields(child, session.user.role).filter((f) => f.name !== link.name).filter((f, i) => f.list ?? (i < 4 || f.name === child.status?.field)).slice(0, 5);
  return (
    <section className="card mt-4 overflow-hidden">
      <div className="flex items-baseline justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">{child.label} <span className="font-normal text-zinc-400">{data.total}</span></h2>
        <Link className="text-sm text-accent hover:underline" to={`/e/${child.name}`}>View all</Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-y border-zinc-200 bg-zinc-50/60"><tr>{cols.map((f) => <th key={f.name} className="th">{fieldLabel(f)}</th>)}</tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {data.rows.map((r) => (
              <tr key={r.id}>
                {cols.map((f, i) => (
                  <td key={f.name} className="td">
                    {i === 0 ? <Link className="font-medium text-zinc-900 hover:text-accent" to={`/e/${child.name}/${r.id}`}><Cell entity={child} field={f} row={r} /></Link> : <Cell entity={child} field={f} row={r} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
