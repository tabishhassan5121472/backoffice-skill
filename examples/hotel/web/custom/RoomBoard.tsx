import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import system from '../../system.config';
import { api } from '../api';
import { Icon, PageHeader } from '../components/Shell';
import { num, StatusBadge } from '../format';

interface Room { id: number; number: string; floor: string; status: string; type: string }
interface Stay { id: number; code: string; room_id: number; check_in: string; check_out: string; adults: number; status: string; guest?: string; vip?: number }
interface Board { start: string; days: number; today: string; rooms: Room[]; stays: Stay[]; summary: { in_house: number; arrivals: number; departures: number; to_clean: number } }

const DAY = 86_400_000;
const shift = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const diff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const utc = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { ...o, timeZone: 'UTC' });

const BAR: Record<string, string> = {
  reserved: 'bg-sky-100 text-sky-900 ring-sky-300 hover:bg-sky-200',
  checked_in: 'bg-emerald-100 text-emerald-900 ring-emerald-300 hover:bg-emerald-200',
  checked_out: 'bg-zinc-100 text-zinc-600 ring-zinc-300 hover:bg-zinc-200',
};
const LABEL_W = 196; // px, the sticky room column

export function RoomBoard() {
  const rooms = system.entities.find((e) => e.name === 'rooms')!;
  const reservations = system.entities.find((e) => e.name === 'reservations')!;
  const [start, setStart] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api<Board>(`/custom/room-board${start ? `?start=${start}` : ''}`)
      .then((b) => { if (live) { setBoard(b); setError(''); } })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [start]);

  const days = board ? Array.from({ length: board.days }, (_, i) => shift(board.start, i)) : [];
  const floors = board ? [...new Set(board.rooms.map((r) => r.floor))].sort() : [];
  const move = (n: number) => board && setStart(shift(board.start, n));
  const tiles = board ? [
    { label: 'Guests in house', value: board.summary.in_house },
    { label: 'Arrivals still to come today', value: board.summary.arrivals },
    { label: 'Departures due today', value: board.summary.departures },
    { label: 'Rooms waiting for cleaning', value: board.summary.to_clean },
  ] : [];

  return (
    <>
      <PageHeader title="Room board" sub={board ? `${utc(days[0], { day: 'numeric', month: 'short' })} to ${utc(days[days.length - 1], { day: 'numeric', month: 'short', year: 'numeric' })} · every room, every stay` : 'Every room, every stay'}>
        <button className="btn" onClick={() => move(-7)}><Icon name="ChevronLeft" /> Earlier</button>
        <button className="btn" onClick={() => setStart(null)}>Today</button>
        <button className="btn" onClick={() => move(7)}>Later <Icon name="ChevronRight" /></button>
      </PageHeader>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {!board && !error && <p className="text-sm text-zinc-400">Loading…</p>}
      {board && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="card p-4">
                <div className="text-sm text-zinc-500">{t.label}</div>
                <div className="tnum mt-1 text-2xl font-semibold tracking-tight">{num(t.value)}</div>
              </div>
            ))}
          </div>

          <section className="card min-w-0 overflow-x-auto">
            <div style={{ minWidth: LABEL_W + board.days * 64 }}>
              <div className="flex border-b border-zinc-200">
                <div className="th sticky left-0 z-20 shrink-0 bg-white" style={{ width: LABEL_W }}>Room</div>
                <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${board.days}, minmax(0, 1fr))` }}>
                  {days.map((d) => (
                    <div key={d} className={`border-l border-zinc-100 px-1 py-2 text-center text-xs ${d === board.today ? 'bg-accent/10 font-semibold text-accent' : 'text-zinc-500'}`}>
                      <div className="uppercase tracking-wide">{utc(d, { weekday: 'short' })}</div>
                      <div className="tnum">{utc(d, { day: 'numeric', month: 'short' })}</div>
                    </div>
                  ))}
                </div>
              </div>

              {floors.map((floor) => (
                <div key={floor}>
                  <div className="sticky left-0 border-b border-zinc-100 bg-zinc-50 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">Floor {floor}</div>
                  {board.rooms.filter((r) => r.floor === floor).map((room) => (
                    <div key={room.id} className="flex border-b border-zinc-100 last:border-b-0">
                      <Link to={`/e/rooms/${room.id}`} className="sticky left-0 z-20 flex shrink-0 items-center justify-between gap-2 bg-white px-4 py-1.5 hover:text-accent" style={{ width: LABEL_W }} title={room.type}>
                        <span className="min-w-0 flex-1">
                          <span className="tnum block text-sm font-medium text-zinc-900">{room.number}</span>
                          <span className="block truncate text-xs text-zinc-400">{room.type}</span>
                        </span>
                        {room.status !== 'available' && <span className="shrink-0"><StatusBadge entity={rooms} value={room.status} /></span>}
                      </Link>
                      <div className={`relative flex-1 overflow-hidden ${room.status === 'out_of_service' ? 'bg-red-50/60' : ''}`} style={{ minHeight: 44 }}>
                        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${board.days}, minmax(0, 1fr))` }}>
                          {days.map((d) => <div key={d} className={`border-l border-zinc-100 ${d === board.today ? 'bg-accent/5' : ''}`} />)}
                        </div>
                        {board.stays.filter((s) => s.room_id === room.id).map((s) => {
                          // A stay runs from the afternoon of check-in to the morning of check-out: half a column each side.
                          const from = Math.max(0, diff(board.start, s.check_in) + 0.5);
                          const to = Math.min(board.days, diff(board.start, s.check_out) + 0.5);
                          if (to <= from) return null;
                          const nights = diff(s.check_in, s.check_out);
                          const state = reservations.status?.states.find((x) => x.name === s.status);
                          return (
                            <Link key={s.id} to={`/e/reservations/${s.id}`}
                              title={`${s.code}${s.guest ? ` · ${s.guest}` : ''} · ${nights} night${nights === 1 ? '' : 's'} · ${state?.label ?? s.status}`}
                              className={`absolute top-1.5 bottom-1.5 z-10 flex items-center gap-1 overflow-hidden rounded-md px-2 text-xs font-medium ring-1 ring-inset transition ${BAR[s.status] ?? BAR.reserved}`}
                              style={{ left: `calc(${(from / board.days) * 100}% + 1px)`, width: `calc(${((to - from) / board.days) * 100}% - 2px)` }}>
                              {s.vip ? <Icon name="Star" className="size-3 shrink-0" /> : null}
                              <span className="truncate">{s.guest ?? s.code}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
            {(['reserved', 'checked_in', 'checked_out'] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5"><StatusBadge entity={reservations} value={s} /></span>
            ))}
            <span>Bars start on the afternoon of check-in and end on the morning of check-out. Click a stay to open it.</span>
          </div>
        </>
      )}
    </>
  );
}
