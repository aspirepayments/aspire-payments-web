'use client';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { apiGet } from '@/lib/api';
import { Card, Btn } from '@/components/Ui';
import { StatusBadge } from '@/components/StatusBadge';

type Invoice = {
  id: string;
  number: string;
  status: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
};

export default function InvoicesListPage() {
  const { data } = useSWR<{ invoices: Invoice[] }>('/invoices', apiGet);

  const [sortBy, setSortBy] = useState<'number' | 'issue' | 'due'>('issue');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    const list = [...(data?.invoices ?? [])];
    list.sort((a, b) => {
      const m = dir === 'asc' ? 1 : -1;
      if (sortBy === 'number') return a.number.localeCompare(b.number) * m;
      if (sortBy === 'issue')
        return (
          (new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime()) * m
        );
      return (
        (new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()) * m
      );
    });
    return list;
  }, [data, sortBy, dir]);

  function head(label: string, key: 'number' | 'issue' | 'due') {
    const active = sortBy === key;
    return (
      <button
        className={`text-left ${active ? 'font-semibold' : ''}`}
        onClick={() => {
          setSortBy(key);
          setDir((d) => (active ? (d === 'asc' ? 'desc' : 'asc') : 'desc'));
        }}
      >
        {label}
        {active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Invoices</h1>
        <Btn kind="primary" onClick={() => location.assign('/invoices/new')}>
          Create invoice
        </Btn>
      </div>

      <Card className="p-0">
        <table className="table">
          <thead>
            <tr className="text-left">
              <th>{head('Invoice #', 'number')}</th>
              <th>Status</th>
              <th>{head('Issue date', 'issue')}</th>
              <th>{head('Due date', 'due')}</th>
              <th className="text-right">Total</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => {
              const bal = Math.max(inv.total - inv.amountPaid, 0);
              return (
                <tr
                  key={inv.id}
                  className="cursor-pointer hover:bg-neutral-50"
                  onClick={() => location.assign(`/invoices/${inv.id}`)}
                >
                  <td>{inv.number}</td>
                  <td><StatusBadge status={inv.status} /></td>
                  <td>{new Date(inv.issueDate).toLocaleDateString()}</td>
                  <td>{new Date(inv.dueDate).toLocaleDateString()}</td>
                  <td className="text-right">
                    {(inv.total / 100).toLocaleString(undefined, {
                      style: 'currency',
                      currency: inv.currency,
                    })}
                  </td>
                  <td className="text-right">
                    {(inv.amountPaid / 100).toLocaleString(undefined, {
                      style: 'currency',
                      currency: inv.currency,
                    })}
                  </td>
                  <td className="text-right">
                    {(bal / 100).toLocaleString(undefined, {
                      style: 'currency',
                      currency: inv.currency,
                    })}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td className="p-3 text-neutral-500" colSpan={7}>
                  No invoices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
