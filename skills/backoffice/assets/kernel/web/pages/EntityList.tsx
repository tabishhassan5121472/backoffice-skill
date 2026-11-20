import { ChevronDown, ChevronUp, Download, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import system from '../../system.config';
import { fieldLabel, titleCase } from '../../shared/types';
import { api } from '../api';
import { useCan, useSession } from '../App';
import { PageHeader } from '../components/Shell';
import { allFields, Cell } from '../format';

export function EntityList() {
  const { entity: name } = useParams();
  const e = system.entities.find((x) => x.name === name);
  const can = useCan();
  const { session } = useSession();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState({ by: 'id', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: any[]; total: number; pageSize: number } | null>(null);
  const [options, setOptions] = useState<Record<string, { id: number; label: string }[]>>({});

  const fields = e ? allFields(e, session.user.role) : [];
  const filterFields = fields.filter((f) => f.filter && f.name !== e?.status?.field);
  const query = new URLSearchParams({ q, page: String(page), sort: sort.by, dir: sort.dir, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v).map(([k, v]) => [`f_${k}`, v])) }).toString();

  useEffect(() => {
    if (!e || !can(e.name, 'read')) return;
    const t = setTimeout(() => api(`/e/${e.name}?${query}`).then(setData).catch(() => setData({ rows: [], total: 0, pageSize: 20 })), q ? 200 : 0);
    return () => clearTimeout(t);
  }, [e?.name, query]);
  useEffect(() => {
    for (const f of filterFields.filter((x) => x.type === 'ref'))
      api(`/e/${f.ref}/options`).then((o) => setOptions((p) => ({ ...p, [f.name]: o }))).catch(() => {});
  }, [e?.name]);

  if (!e || !can(e.name, 'read')) return <Navigate to="/" replace />;
  const cols = fields.filter((f, i) => f.list ?? (i < 5 || f.name === e.status?.field)).slice(0, 7);
  const set = (k: string, v: string) => { setFilters((p) => ({ ...p, [k]: v })); setPage(1); };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const st = e.status;

  return (
    <>
      <PageHeader title={e.label} sub={data ? `${data.total} ${data.total === 1 ? e.singular.toLowerCase() : e.label.toLowerCase()}` : undefined}>
        <a className="btn" href={`/api/e/${e.name}/export.csv?${query}`}><Download className="size-4" />Export</a>
        {can(e.name, 'create') && <Link className="btn btn-primary" to={`/e/${e.name}/new`}><Plus className="size-4" />New {e.singular.toLowerCase()}</Link>}
      </PageHeader>

      {st && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[{ name: '', label: 'All' }, ...st.states].map((s) => (
            <button key={s.name} onClick={() => set(st.field, s.name)}
              className={`rounded-full px-3 py-1 text-sm ${(filters[st.field] ?? '') === s.name ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50'}`}>
              {s.label ?? titleCase(s.name)}
            </button>
          ))}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-3">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-zinc-400" />
            <input className="input pl-9" placeholder={`Search ${e.label.toLowerCase()}`} value={q} onChange={(ev) => { setQ(ev.target.value); setPage(1); }} />
          </div>
          {filterFields.map((f) => (
            <select key={f.name} className="input w-auto" value={filters[f.name] ?? ''} onChange={(ev) => set(f.name, ev.target.value)}>
              <option value="">{fieldLabel(f)}: all</option>
              {f.type === 'boolean' && <><option value="1">Yes</option><option value="0">No</option></>}
              {f.type === 'select' && f.options!.map((o) => <option key={o} value={o}>{titleCase(o)}</option>)}
              {f.type === 'ref' && (options[f.name] ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-zinc-200 bg-zinc-50/60">
              <tr>
                {cols.map((f) => (
                  <th key={f.name} className="th">
                    <button className="inline-flex items-center gap-1 uppercase" onClick={() => setSort((s) => ({ by: f.name, dir: s.by === f.name && s.dir === 'asc' ? 'desc' : 'asc' }))}>
                      {fieldLabel(f)}
                      {sort.by === f.name && (sort.dir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data?.rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-zinc-50" onClick={() => nav(`/e/${e.name}/${r.id}`)}>
                  {cols.map((f, i) => <td key={f.name} className={`td ${i === 0 ? 'font-medium text-zinc-900' : ''}`}><Cell entity={e} field={f} row={r} /></td>)}
                </tr>
              ))}
              {data && !data.rows.length && <tr><td colSpan={cols.length} className="px-4 py-10 text-center text-sm text-zinc-400">No {e.label.toLowerCase()} match.</td></tr>}
              {!data && <tr><td colSpan={cols.length} className="px-4 py-10 text-center text-sm text-zinc-400">Loading…</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-2.5 text-sm text-zinc-500">
            <span>Page {page} of {pages}</span>
            <div className="flex gap-2">
              <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
