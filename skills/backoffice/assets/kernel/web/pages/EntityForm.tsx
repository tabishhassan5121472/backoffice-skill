import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import system from '../../system.config';
import type { Field } from '../../shared/types';
import { fieldLabel, titleCase } from '../../shared/types';
import { api, ApiError } from '../api';
import { useCan, useSession } from '../App';
import { PageHeader } from '../components/Shell';

const toLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function EntityForm() {
  const { entity: name, id } = useParams();
  const e = system.entities.find((x) => x.name === name);
  const can = useCan();
  const { session } = useSession();
  const nav = useNavigate();
  const [values, setValues] = useState<Record<string, any>>({});
  const [options, setOptions] = useState<Record<string, { id: number; label: string }[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(!id);
  const fields = e ? e.fields.filter((f) => !f.hideFrom?.includes(session.user.role) && !f.compute && !f.auto) : [];

  useEffect(() => {
    if (!e) return;
    for (const f of fields.filter((x) => x.type === 'ref'))
      api(`/e/${f.ref}/options`).then((o) => setOptions((p) => ({ ...p, [f.name]: o }))).catch(() => {});
    if (id) api(`/e/${e.name}/${id}`).then(({ row }) => {
      const v: Record<string, any> = {};
      for (const f of fields) v[f.name] = f.type === 'datetime' && row[f.name] ? toLocal(row[f.name]) : f.type === 'boolean' ? !!row[f.name] : row[f.name] ?? '';
      setValues(v); setReady(true);
    }).catch((err) => setError(err.message));
  }, [name, id]);

  if (!e || !can(e.name, id ? 'update' : 'create')) return <Navigate to="/" replace />;
  const back = id ? `/e/${e.name}/${id}` : `/e/${e.name}`;

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true); setError(''); setErrors({});
    const body: Record<string, any> = {};
    for (const f of fields) {
      const v = values[f.name];
      body[f.name] = f.type === 'boolean' ? !!v : f.type === 'datetime' && v ? new Date(v).toISOString() : v === undefined ? '' : v;
    }
    try {
      const { row } = await api(id ? `/e/${e!.name}/${id}` : `/e/${e!.name}`, { method: id ? 'PATCH' : 'POST', body });
      nav(`/e/${e!.name}/${row.id}`);
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
    } finally { setBusy(false); }
  }

  const input = (f: Field) => {
    const v = values[f.name] ?? '';
    const on = (x: any) => setValues((p) => ({ ...p, [f.name]: x }));
    const common = { id: f.name, className: 'input mt-1', required: f.required };
    switch (f.type) {
      case 'longtext': return <textarea {...common} rows={3} value={v} onChange={(ev) => on(ev.target.value)} />;
      case 'boolean': return <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={!!v} onChange={(ev) => on(ev.target.checked)} />Yes</label>;
      case 'select': return <select {...common} value={v} onChange={(ev) => on(ev.target.value)}><option value="">Choose…</option>{f.options!.map((o) => <option key={o} value={o}>{titleCase(o)}</option>)}</select>;
      case 'ref': return <select {...common} value={v} onChange={(ev) => on(ev.target.value)}><option value="">Choose…</option>{(options[f.name] ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>;
      case 'number': case 'money': return <input {...common} type="number" step={f.type === 'money' ? '0.01' : 'any'} value={v} onChange={(ev) => on(ev.target.value)} />;
      case 'date': return <input {...common} type="date" value={v} onChange={(ev) => on(ev.target.value)} />;
      case 'datetime': return <input {...common} type="datetime-local" value={v} onChange={(ev) => on(ev.target.value)} />;
      case 'email': return <input {...common} type="email" value={v} onChange={(ev) => on(ev.target.value)} />;
      case 'phone': return <input {...common} type="tel" value={v} onChange={(ev) => on(ev.target.value)} />;
      default: return <input {...common} type="text" value={v} onChange={(ev) => on(ev.target.value)} />;
    }
  };

  return (
    <>
      <Link to={back} className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800"><ArrowLeft className="size-4" />Back</Link>
      <PageHeader title={id ? `Edit ${e.singular.toLowerCase()}` : `New ${e.singular.toLowerCase()}`} />
      {!ready ? <p className="text-sm text-zinc-400">{error || 'Loading…'}</p> : (
        <form onSubmit={save} className="card max-w-3xl p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.name} className={f.type === 'longtext' ? 'sm:col-span-2' : ''}>
                <label htmlFor={f.name} className="text-sm font-medium">{fieldLabel(f)}{f.required && <span className="text-red-500"> *</span>}</label>
                {input(f)}
                {errors[f.name] && <p className="mt-1 text-xs text-red-600">{errors[f.name]}</p>}
              </div>
            ))}
          </div>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex gap-2">
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <Link className="btn" to={back}>Cancel</Link>
          </div>
        </form>
      )}
    </>
  );
}
