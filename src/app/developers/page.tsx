'use client';
import { useState } from 'react';
import { apiPost } from '@/lib/api';

export default function DevelopersPage() {
  const [merchantId, setMerchantId] = useState('demo_merchant');
  const [apiKey, setApiKey] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function connectNmi() {
    setMsg(null);
    setLoading(true);
    try {
      await apiPost(`/merchants/${merchantId}/gateways/nmi/connect`, { apiKey });
      setMsg('Saved ✓');
      setApiKey(''); // clear field after save
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Developers</h1>

      <section className="rounded border bg-white p-4 space-y-3 max-w-lg">
        <div className="font-medium">
          Connect NMI <span className="text-neutral-500 text-xs">(store <code>security_key</code>)</span>
        </div>

        <label className="block text-sm">
          <span className="text-neutral-600">Merchant ID</span>
          <input
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1.5"
            placeholder="demo_merchant"
          />
        </label>

        <label className="block text-sm">
          <span className="text-neutral-600">NMI security_key</span>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1.5 font-mono"
            placeholder="sk_live_..."
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={connectNmi}
            disabled={loading || !merchantId || !apiKey}
            className="rounded bg-black text-white px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
          {msg && <span className="text-sm">{msg}</span>}
        </div>

        <p className="text-xs text-neutral-500">
          If your API has <code>NMI_SIMULATE=true</code> in <code>.env</code>, card sales simulate approval.
          Set it to <code>false</code> and store a real <code>security_key</code> to go live.
        </p>
      </section>
    </div>
  );
}
