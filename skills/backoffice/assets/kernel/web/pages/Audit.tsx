import { useEffect, useState } from 'react';
import { titleCase } from '../../shared/types';
import { api } from '../api';
import { PageHeader } from '../components/Shell';
import { dateTime } from '../format';

export function Audit() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { api('/audit').then(setRows); }, []);
  return (
    <>
      <PageHeader title="Activity log" sub="Who did what, most recent first." />
      <section className="card overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-zinc-200 bg-zinc-50/60"><tr><th className="th">When</th><th className="th">Who</th><th className="th">Action</th><th className="th">Where</th><th className="th">Details</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {rows?.map((r) => (
              <tr key={r.id}><td className="td">{dateTime(r.at)}</td><td className="td font-medium text-zinc-900">{r.user_name}</td><td className="td">{r.action}</td><td className="td">{titleCase(r.entity)}{r.record_id ? ` #${r.record_id}` : ''}</td><td className="td text-zinc-500">{r.summary}</td></tr>
            ))}
            {rows && !rows.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-400">Nothing recorded yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
