import { useEffect, useState } from 'react';
import system from '../../system.config';
import { api } from '../api';
import { PageHeader } from '../components/Shell';
import { Badge, date } from '../format';

export function Team() {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', email: '', role: system.roles[system.roles.length - 1].name, password: '' });
  const [error, setError] = useState('');
  const load = () => api('/team').then(setRows);
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try { await api('/team', { body: form }); setForm({ ...form, name: '', email: '', password: '' }); load(); }
    catch (err) { setError((err as Error).message); }
  }
  const label = (r: string) => system.roles.find((x) => x.name === r)?.label ?? r;

  return (
    <>
      <PageHeader title="Team" sub="People who can sign in to this organisation." />
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card overflow-hidden lg:col-span-2">
          <table className="w-full">
            <thead className="border-b border-zinc-200 bg-zinc-50/60"><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Added</th></tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => <tr key={r.id}><td className="td font-medium text-zinc-900">{r.name}</td><td className="td">{r.email}</td><td className="td"><Badge>{label(r.role)}</Badge></td><td className="td">{date(r.created_at)}</td></tr>)}
            </tbody>
          </table>
        </section>
        <form onSubmit={add} className="card space-y-3 p-5">
          <h2 className="text-sm font-semibold">Add a person</h2>
          <input className="input" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {system.roles.map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}
          </select>
          <p className="text-xs text-zinc-500">{system.roles.find((r) => r.name === form.role)?.description}</p>
          <input className="input" type="password" placeholder="Starting password (8+ characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn btn-primary w-full">Add to team</button>
        </form>
      </div>
    </>
  );
}
