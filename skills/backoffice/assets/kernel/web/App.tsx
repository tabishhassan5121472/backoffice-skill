import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Action } from '../shared/types';
import { api } from './api';
import { Shell } from './components/Shell';
import { customPages } from './custom';
import { Audit } from './pages/Audit';
import { Dashboard } from './pages/Dashboard';
import { EntityDetail } from './pages/EntityDetail';
import { EntityForm } from './pages/EntityForm';
import { EntityList } from './pages/EntityList';
import { Login } from './pages/Login';
import { Team } from './pages/Team';

export interface Session {
  user: { id: number; name: string; email: string; role: string };
  tenant: { id: number; name: string; slug: string };
  isOwner: boolean;
  permissions: Record<string, Action[]>;
}

const Ctx = createContext<{ session: Session; signOut: () => void } | null>(null);
export const useSession = () => useContext(Ctx)!;
export const useCan = () => {
  const { session } = useSession();
  return (entity: string, action: Action) => session.permissions[entity]?.includes(action) ?? false;
};

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => { api<Session>('/auth/me').then(setSession).catch(() => setSession(null)); }, []);
  const signOut = useCallback(() => { api('/auth/logout', { method: 'POST' }).finally(() => setSession(null)); }, []);

  if (session === undefined) return <div className="grid h-full place-items-center text-sm text-zinc-400">Loading…</div>;
  if (!session) return <Login onSignedIn={setSession} />;

  return (
    <Ctx.Provider value={{ session, signOut }}>
      <Shell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/e/:entity" element={<EntityList />} />
          <Route path="/e/:entity/new" element={<EntityForm />} />
          <Route path="/e/:entity/:id" element={<EntityDetail />} />
          <Route path="/e/:entity/:id/edit" element={<EntityForm />} />
          {customPages.map((p) => <Route key={p.path} path={`/x/${p.path}`} element={<p.component />} />)}
          {session.isOwner && <Route path="/team" element={<Team />} />}
          {session.isOwner && <Route path="/audit" element={<Audit />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </Ctx.Provider>
  );
}
