import { useEffect, useState } from 'react';
import system from '../../system.config';
import { titleCase } from '../../shared/types';
import { api } from '../api';
import type { Session } from '../App';

interface Demo { password: string; accounts: { tenant: string; role: string; email: string }[] }

export function Login({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<Demo | null>(null);
  useEffect(() => { api<Demo>('/auth/demo').then(setDemo).catch(() => {}); }, []);

  async function signIn(e: string, p: string) {
    setBusy(true); setError('');
    try { onSignedIn(await api<Session>('/auth/login', { body: { email: e, password: p } })); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  const tenants = [...new Set(demo?.accounts.map((a) => a.tenant) ?? [])];
  const roleLabel = (r: string) => system.roles.find((x) => x.name === r)?.label ?? titleCase(r);

  return (
    <div className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-accent text-lg font-semibold text-white">{system.name[0]}</div>
          <h1 className="text-xl font-semibold tracking-tight">{system.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">{system.tagline}</p>
        </div>
        <form className="card space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); signIn(email, password); }}>
          <label className="block text-sm font-medium">Email
            <input className="input mt-1" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block text-sm font-medium">Password
            <input className="input mt-1" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn btn-primary w-full py-2" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        {demo && demo.accounts.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-center text-xs text-zinc-500">Demo accounts. Click one to sign in.</p>
            <div className="space-y-3">
              {tenants.map((t) => (
                <div key={t} className="card p-3">
                  <div className="mb-2 text-xs font-medium text-zinc-500">{t}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {demo.accounts.filter((a) => a.tenant === t).map((a) => (
                      <button key={a.email} className="btn px-2.5 py-1 text-xs" disabled={busy} onClick={() => signIn(a.email, demo.password)}>{roleLabel(a.role)}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
