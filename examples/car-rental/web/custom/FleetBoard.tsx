import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import system from '../../system.config';
import { api } from '../api';
import { PageHeader } from '../components/Shell';
import { StatusBadge } from '../format';

type Vehicle = { id: number; name: string; plate: string; status: string; class_name: string };
type Booking = { id: number; reference: string; vehicle_id: number; pickup_on: string; return_on: string; status: string; customer?: string };
type Board = { from: string; to: string; today: string; vehicles: Vehicle[]; bookings: Booking[] };

const DAY = 864e5;
const diff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const BAR: Record<string, string> = { reserved: 'bg-amber-400', on_rent: 'bg-sky-500', returned: 'bg-zinc-300' };

export function FleetBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Board>('/custom/fleet-board').then(setBoard).catch((e) => setError(e.message)); }, []);
  const vehicles = system.entities.find((e) => e.name === 'vehicles')!;
  const span = board ? diff(board.from, board.to) + 1 : 0;
  const days = board ? Array.from({ length: span }, (_, i) => new Date(Date.parse(board.from) + i * DAY)) : [];
  const todayIx = board ? diff(board.from, board.today) : 0;

  return (
    <>
      <PageHeader title="Fleet board" sub="Which car is out, which is due back and which is free, for the next two weeks." />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!board && !error && <p className="text-sm text-zinc-400">Loading…</p>}
      {board && (
        <section className="card overflow-x-auto p-4">
          <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-zinc-500">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> On rent</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Reserved</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-zinc-300" /> Returned</span>
          </div>
          <div style={{ minWidth: 900 }}>
            <div className="flex border-b border-zinc-100 pb-1 text-xs text-zinc-400">
              <div className="w-56 shrink-0" />
              <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))` }}>
                {days.map((d, i) => (
                  <div key={i} className={`tnum text-center ${i === todayIx ? 'font-semibold text-accent' : ''}`}>
                    {d.toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' })}<br />{d.getUTCDate()}
                  </div>
                ))}
              </div>
            </div>
            {board.vehicles.map((v) => (
              <div key={v.id} className="flex items-center border-b border-zinc-100 py-1.5">
                <div className="w-56 shrink-0 pr-3">
                  <Link to={`/e/vehicles/${v.id}`} className="text-sm font-medium text-zinc-900 hover:text-accent">{v.name}</Link>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span className="tnum">{v.plate}</span><span>{v.class_name}</span><StatusBadge entity={vehicles} value={v.status} />
                  </div>
                </div>
                <div className="relative h-7 flex-1 rounded bg-zinc-50">
                  <div className="absolute inset-y-0 w-px bg-accent" style={{ left: `${((todayIx + 0.5) / span) * 100}%` }} />
                  {board.bookings.filter((b) => b.vehicle_id === v.id).map((b) => {
                    const start = Math.max(diff(board.from, b.pickup_on), 0);
                    const end = Math.min(diff(board.from, b.return_on), span - 1);
                    return (
                      <Link key={b.id} to={`/e/bookings/${b.id}`} title={`${b.reference}${b.customer ? ` · ${b.customer}` : ''} · ${b.pickup_on} to ${b.return_on}`}
                        className={`absolute inset-y-1 overflow-hidden whitespace-nowrap rounded px-1.5 text-xs leading-5 text-white hover:opacity-80 ${BAR[b.status] ?? 'bg-zinc-300'}`}
                        style={{ left: `${((start + 0.5) / span) * 100}%`, width: `${(Math.max(end - start, 0.4) / span) * 100}%` }}>
                        {b.customer ?? b.reference}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            {!board.vehicles.length && <p className="py-6 text-sm text-zinc-400">No vehicles yet.</p>}
          </div>
        </section>
      )}
    </>
  );
}
