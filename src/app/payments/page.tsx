'use client';
import { useState } from 'react';               // ← add this
import useSWR from 'swr';
import { apiGet } from '@/lib/api';
import PaymentDrawer from '@/components/PaymentDrawer';

type Payment = {
  id: string; createdAt: string; merchantId: string; amount: number; currency: string;
  method: string; rail?: string | null; provider: string; status: string; instrumentMask?: string | null;
};
type PaymentsResp = { payments: Payment[] };

export default function PaymentsPage() {
  const { data, error, isLoading, mutate } = useSWR<PaymentsResp>('/payments', apiGet, { refreshInterval: 8000 });
  const [openId, setOpenId] = useState<string | null>(null);   // ← add this

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">  
        <h1 className="text-xl font-semibold">Payments</h1>
        <button onClick={() => mutate()} className="rounded border px-3 py-1.5 text-sm hover:bg-neutral-100">Refresh</button>
      </div>

      {isLoading && <div className="text-sm text-neutral-500">Loading…</div>}
      {error && <div className="text-sm text-red-600">Error: {String(error)}</div>}

      <div className="overflow-auto rounded border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50">
            <tr className="text-left">
              <th className="p-2">Date</th>
              <th className="p-2">Merchant</th>
              <th className="p-2">Method</th>
              <th className="p-2">Provider</th>
              <th className="p-2">Status</th>
              <th className="p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data?.payments?.map(p => (
              <tr
                key={p.id}
                className="border-t hover:bg-neutral-50 cursor-pointer"   // ← make it clickable
                onClick={() => setOpenId(p.id)}                            // ← open drawer
              >
                <td className="p-2">{new Date(p.createdAt).toLocaleString()}</td>
                <td className="p-2">{p.merchantId}</td>
                <td className="p-2 capitalize">{p.method}{p.rail ? ` · ${p.rail}` : ''}</td>
                <td className="p-2 capitalize">{p.provider.replace('_',' ')}</td>
                <td className="p-2">
                  <span className="inline-flex rounded-full px-2 py-0.5 text-xs border">{p.status}</span>
                </td>
                <td className="p-2 text-right font-medium">
                  {(p.amount/100).toLocaleString(undefined, { style:'currency', currency: p.currency })}
                </td>
              </tr>
            ))}
            {!data?.payments?.length && !isLoading && (
              <tr><td className="p-3 text-neutral-500" colSpan={6}>No payments yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ← put the drawer here, at the bottom of the page */}
      <PaymentDrawer
        id={openId}
        onClose={() => setOpenId(null)}
        onRefunded={() => mutate()}
      />
    </div>
  );
}
