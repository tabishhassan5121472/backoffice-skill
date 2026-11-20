import type { Tone } from '../../shared/types';
import { titleCase } from '../../shared/types';
import { TONE_FILL } from '../format';

export interface Point { label: string; value: number; tone?: Tone }
const SHADES = [1, 0.78, 0.6, 0.45, 0.33, 0.24, 0.17, 0.12];

export function Bars({ points }: { points: Point[] }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  if (!points.length) return <Empty />;
  return (
    <div className="space-y-2.5">
      {points.map((p) => (
        <div key={p.label} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-zinc-600">{titleCase(p.label)}</span>
          <div className="h-2 rounded-full bg-zinc-100">
            <div className="h-2 rounded-full" style={{ width: `${(p.value / max) * 100}%`, background: p.tone ? TONE_FILL[p.tone] : 'var(--accent)' }} />
          </div>
          <span className="tnum w-8 text-right font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Donut({ points }: { points: Point[] }) {
  const total = points.reduce((a, p) => a + p.value, 0);
  if (!total) return <Empty />;
  const R = 15.915; // circumference 100
  let offset = 25;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 42 42" className="size-28 shrink-0">
        {points.map((p, i) => {
          const pct = (p.value / total) * 100;
          const el = <circle key={p.label} cx="21" cy="21" r={R} fill="none" strokeWidth="5.5"
            stroke={p.tone ? TONE_FILL[p.tone] : 'var(--accent)'} strokeOpacity={p.tone ? 1 : SHADES[i % SHADES.length]}
            strokeDasharray={`${Math.max(pct - 0.6, 0)} ${100 - Math.max(pct - 0.6, 0)}`} strokeDashoffset={offset} />;
          offset -= pct;
          return el;
        })}
        <text x="21" y="22.5" textAnchor="middle" className="fill-zinc-900 text-[7px] font-semibold">{total}</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {points.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: p.tone ? TONE_FILL[p.tone] : 'var(--accent)', opacity: p.tone ? 1 : SHADES[i % SHADES.length] }} />
            <span className="truncate text-zinc-600">{titleCase(p.label)}</span>
            <span className="tnum ml-auto font-medium">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Line({ points }: { points: Point[] }) {
  if (!points.length) return <Empty />;
  const W = 600, H = 150, pad = 4;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => pad + (i / Math.max(points.length - 1, 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2 - 6);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const short = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="#f4f4f5" />)}
        <path d={`${line} L${x(points.length - 1)},${H} L${x(0)},${H} Z`} fill="var(--accent)" opacity="0.08" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-zinc-400"><span>{short(points[0].label)}</span><span>{short(points[points.length - 1].label)}</span></div>
    </div>
  );
}

const Empty = () => <p className="py-6 text-center text-sm text-zinc-400">Nothing to show yet.</p>;
