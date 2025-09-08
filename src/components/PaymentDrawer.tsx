'use client';
import { useEffect } from 'react';
import useSWR from 'swr';
import { apiGet, apiPost } from '@/lib/api';

type Attempt = { id: string; status: string; createdAt: string; requestJson?: any; responseJson?: any };
type Refund = { id: string; status: string; createdAt: string; amount: number };
type PaymentDetail = {
  id: string; status: string; amount: number; currency: string; provider: string;
  method: string; rail?: string | null; merchantId: string; createdAt: string;
  attempts: Attempt[]; refunds: Refund[];
};
type Props = { id: string | null; onClose: () => void; onRefunded?: () => void };

export default function PaymentDrawer({ id, onClose, onRefunded }: Props) {
  const { data, isLoading, error, mutate } = useSWR<{ payment: PaymentDetail }>(
    id ? `/payments/${id}` : null,
    apiGet,
    { refreshInterval: 0 }
  );

  useEffect(() => { if (!id) return; mutate(); }, [id]); // refresh when opening

  if (!id) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-[480px] bg-white shadow-xl overflow-auto">
        <div className="sticky top-0 bg-white/90 backdrop-blur border-b p-4 flex items-center justify-between">
          <div className="font-semibold">Payment Detail</div>
          <button onClick={onClose} className="rounded border px-2 py-1 text-sm">Close</button>
        </div>

        <div className="p-4 space-y-4">
          {isLoading && <div className="text-sm text-neutral-500">Loading…</div>}
          {error && <div className="text-sm text-red-600">Error: {String(error)}</div>}

          {data?.payment && (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field k="ID" v={data.payment.id} mono />
                <Field k="Status" v={data.payment.status} />
                <Field k="Amount" v={(data.payment.amount/100).toLocaleString(undefined,{style:'currency',currency:data.payment.currency})} />
                <Field k="Provider" v={data.payment.provider} />
                <Field k="Method" v={data.payment.rail ? `${data.payment.method} · ${data.payment.rail}` : data.payment.method} />
                <Field k="Merchant" v={data.payment.merchantId} />
                <Field k="Created" v={new Date(data.payment.createdAt).toLocaleString()} />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      await apiPost(`/payments/${data.payment.id}/refunds`, {});
                      await mutate();           // refresh the drawer data
                      onRefunded?.();           // refresh the list in the parent
                    } catch (e:any) {
                      alert(`Refund failed: ${e.message}`);
                    }
                  }}
                  className="rounded bg-black text-white px-3 py-1.5 text-sm hover:opacity-90"
                >
                  Refund
                </button>
              </div>

              <Section title="Timeline">
                <ul className="space-y-2 text-sm">
                  {data.payment.attempts.map(a => (
                    <li key={a.id} className="rounded border p-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{a.status}</span>
                        <span className="text-neutral-500">{new Date(a.createdAt).toLocaleString()}</span>
                      </div>
                      <pre className="mt-2 text-xs bg-neutral-50 p-2 overflow-auto">{JSON.stringify(a.responseJson ?? a.requestJson, null, 2)}</pre>
                    </li>
                  ))}
                  {!data.payment.attempts.length && <li className="text-neutral-500">No attempts.</li>}
                </ul>
              </Section>

              <Section title="Refunds">
                <ul className="space-y-2 text-sm">
                  {data.payment.refunds.map(r => (
                    <li key={r.id} className="rounded border p-2 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{r.status}</div>
                        <div className="text-neutral-500">{new Date(r.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="font-medium">{(r.amount/100).toLocaleString(undefined,{style:'currency',currency:data.payment.currency})}</div>
                    </li>
                  ))}
                  {!data.payment.refunds.length && <li className="text-neutral-500">No refunds yet.</li>}
                </ul>
              </Section>

              <Section title="Raw">
                <pre className="text-xs bg-neutral-50 p-2 overflow-auto">{JSON.stringify(data.payment, null, 2)}</pre>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">{title}</div>
      {children}
    </div>
  );
}
function Field({ k, v, mono }: { k: string; v?: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-neutral-500">{k}</div>
      <div className={mono ? 'font-mono text-xs break-all' : ''}>{v ?? '—'}</div>
    </div>
  );
}
