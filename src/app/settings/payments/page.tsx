'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { Card, Btn } from '@/components/Ui';

// For now we’ll act as demo_merchant. If you have auth/tenanting, pass merchantId via context.
const MERCHANT_ID = 'demo_merchant';

export default function PaymentsSettingsPage() {
  const [loading, setLoading]   = useState(false);
  const [acctId, setAcctId]     = useState<string | null>(null);
  const [businessName, setBN]   = useState('Demo Merchant');
  const [website, setWebsite]   = useState('https://demo-merchant.example');
  const [email, setEmail]       = useState('ops@demo-merchant.example');
  const [msg, setMsg]           = useState<string | null>(null);

  async function fetchStatus() {
    setMsg(null);
    try {
      const res = await apiGet<{ embeddedAccountId: string | null }>(`/straddle/accounts/${MERCHANT_ID}`);
      setAcctId(res.embeddedAccountId);
    } catch (e: any) {
      setMsg(`Load failed: ${e.message || e}`);
    }
  }

  async function createAccount() {
    setLoading(true); setMsg(null);
    try {
      const res = await apiPost<{ embeddedAccountId: string }>(`/straddle/accounts`, {
        merchantId: MERCHANT_ID,
        businessName,
        website,
        email
      });
      setAcctId(res.embeddedAccountId);
      setMsg('Embedded account created.');
    } catch (e: any) {
      setMsg(`Create failed: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchStatus(); }, []);

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-semibold">Payments (Bank)</h1>
      <Card className="p-4 space-y-3">
        <div className="section-title">Embedded Account</div>

        {!acctId ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-neutral-600">Business name</span>
                <input className="input mt-1" value={businessName} onChange={e=>setBN(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-neutral-600">Website</span>
                <input className="input mt-1" value={website} onChange={e=>setWebsite(e.target.value)} />
              </label>
              <label className="block text-sm md:col-span-2">
                <span className="text-neutral-600">Contact email (optional)</span>
                <input className="input mt-1" value={email} onChange={e=>setEmail(e.target.value)} />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Btn kind="primary" onClick={createAccount} disabled={loading}>
                {loading ? 'Creating…' : 'Create embedded account'}
              </Btn>
              <Btn kind="ghost" onClick={fetchStatus}>Refresh</Btn>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm">
              <div className="muted">Embedded Account ID</div>
              <code className="text-xs">{acctId}</code>
            </div>
            <div className="text-sm text-neutral-600">
              ACH: <b>Enabled</b> · RTP: <i>Enablement controlled by Straddle</i>
            </div>
            <div>
              <Btn kind="ghost" onClick={fetchStatus}>Refresh</Btn>
            </div>
          </>
        )}

        {msg && <div className="text-sm">{msg}</div>}
      </Card>

      <Card className="p-4">
        <div className="section-title">How this works</div>
        <p className="text-sm text-neutral-700 mt-2">
          This creates an embedded merchant account via Straddle’s API (<code>POST /v1/accounts</code>) under your platform organization. 
          When you later act on behalf of this merchant (customers, Bridge/paykeys, charges, payouts), your API calls must include the 
          <code> Straddle-Account-Id</code> header equal to this ID. That is Straddle’s platform scoping model. 
        </p>
      </Card>
    </div>
  );
}
