import system from '../system.config';
import type { Entity, Field, Tone } from '../shared/types';
import { titleCase } from '../shared/types';

export const money = (v: unknown) =>
  v == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: system.currency, maximumFractionDigits: Number(v) % 1 ? 2 : 0 }).format(Number(v));
export const num = (v: unknown) => (v == null ? '—' : new Intl.NumberFormat().format(Number(v)));
export const date = (v: unknown) =>
  v ? new Date(String(v).length === 10 ? `${v}T00:00:00` : String(v)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const dateTime = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

const TONES: Record<Tone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
};
export const TONE_FILL: Record<Tone, string> = { neutral: '#a1a1aa', green: '#10b981', amber: '#f59e0b', red: '#ef4444', blue: '#0ea5e9' };

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export function StatusBadge({ entity, value }: { entity: Entity; value: string }) {
  const s = entity.status?.states.find((x) => x.name === value);
  return <Badge tone={s?.tone}>{s?.label ?? titleCase(value ?? '')}</Badge>;
}

/** Every column of an entity as the client sees it, with the status column last. */
export function allFields(e: Entity, role: string): Field[] {
  const fs = e.fields.filter((f) => !f.hideFrom?.includes(role));
  return e.status ? [...fs, { name: e.status.field, type: 'select', label: 'Status', options: e.status.states.map((s) => s.name) }] : fs;
}

export function Cell({ entity, field, row }: { entity: Entity; field: Field; row: any }) {
  const v = row[field.name];
  if (entity.status?.field === field.name) return <StatusBadge entity={entity} value={v} />;
  if (v == null || v === '') return <span className="text-zinc-300">—</span>;
  switch (field.type) {
    case 'money': return <span className="tnum">{money(v)}</span>;
    case 'number': return <span className="tnum">{num(v)}</span>;
    case 'date': return <>{date(v)}</>;
    case 'datetime': return <>{dateTime(v)}</>;
    case 'boolean': return <Badge tone={v ? 'green' : 'neutral'}>{v ? 'Yes' : 'No'}</Badge>;
    case 'select': return <Badge>{titleCase(String(v))}</Badge>;
    case 'ref': return <>{row[`${field.name}__label`] ?? `#${v}`}</>;
    default: return <>{String(v)}</>;
  }
}
