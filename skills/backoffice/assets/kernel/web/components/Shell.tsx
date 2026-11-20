import * as lucide from 'lucide-react';
import { LogOut, Menu, X } from 'lucide-react';

// Both the current names and lucide's older aliases (AlertTriangle, TriangleAlert) are accepted.
const icons = { ...(lucide as any), ...lucide.icons } as Record<string, any>;
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import system from '../../system.config';
import { titleCase } from '../../shared/types';
import { useCan, useSession } from '../App';
import { customPages } from '../custom';

export function Icon({ name, className = 'size-4' }: { name?: string; className?: string }) {
  const C = (name && (icons as Record<string, any>)[name]) || icons.Circle;
  if (name && !(icons as Record<string, any>)[name] && import.meta.env.DEV) console.warn(`Unknown icon "${name}". Use a lucide icon name in PascalCase.`);
  return <C className={className} strokeWidth={1.75} />;
}

interface Item { to: string; label: string; icon?: string; group: string; end?: boolean }

export function Shell({ children }: { children: React.ReactNode }) {
  const { session, signOut } = useSession();
  const can = useCan();
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  const items: Item[] = [{ to: '/', label: 'Overview', icon: 'LayoutDashboard', group: '', end: true }];
  for (const e of system.entities) if (can(e.name, 'read')) items.push({ to: `/e/${e.name}`, label: e.label, icon: e.icon, group: e.group ?? 'Records' });
  for (const p of customPages) if (!p.roles || p.roles.includes(session.user.role)) items.push({ to: `/x/${p.path}`, label: p.label, icon: p.icon, group: p.group ?? 'Records' });
  if (session.isOwner) items.push({ to: '/team', label: 'Team', icon: 'UserCog', group: 'Admin' }, { to: '/audit', label: 'Activity log', icon: 'History', group: 'Admin' });
  const groups = [...new Set(items.map((i) => i.group))];
  const role = system.roles.find((r) => r.name === session.user.role);

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
        <div className="grid size-8 place-items-center rounded-lg bg-accent text-sm font-semibold text-white">{system.name[0]}</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{system.name}</div>
          <div className="truncate text-xs text-zinc-500">{session.tenant.name}</div>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {groups.map((g) => (
          <div key={g}>
            {g && <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">{g}</div>}
            {items.filter((i) => i.group === g).map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setOpen(false)}
                className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${isActive ? 'bg-accent-soft font-medium text-accent-strong' : 'text-zinc-600 hover:bg-zinc-100'}`}>
                <Icon name={i.icon} />{i.label}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2.5 border-t border-zinc-200 p-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-600">
          {session.user.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{session.user.name}</div>
          <div className="truncate text-xs text-zinc-500">{role?.label ?? titleCase(session.user.role)}</div>
        </div>
        <button onClick={signOut} title="Sign out" className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><LogOut className="size-4" /></button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 border-r border-zinc-200 bg-white lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-zinc-900/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">{nav}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 lg:hidden">
          <button onClick={() => setOpen(!open)} className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100">{open ? <X className="size-5" /> : <Menu className="size-5" />}</button>
          <span className="text-sm font-semibold">{system.name}</span>
        </header>
        <main key={loc.pathname} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-zinc-500">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
