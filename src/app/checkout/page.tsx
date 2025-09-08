'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import { apiPost } from '@/lib/api';

declare global {
  interface Window {
    CollectJS?: {
      configure: (opts: any) => void;
      tokenize: () => void;
    };
  }
}

export default function CheckoutPage() {
  // UI state
  const [tab, setTab] = useState<'card' | 'bank'>('card');
  const [amount, setAmount] = useState('19.99');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Billing (non-PCI) fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [address1, setAddress1]   = useState('');
  const [postal, setPostal]       = useState('');

  // Hosted field containers
  const ccNumRef = useRef<HTMLDivElement>(null);
  const expRef   = useRef<HTMLDivElement>(null);
  const cvvRef   = useRef<HTMLDivElement>(null);

  const COLLECT_URL =
    process.env.NEXT_PUBLIC_NMI_COLLECTJS_URL || 'https://secure.nmi.com/token/Collect.js';
  const COLLECT_KEY =
    process.env.NEXT_PUBLIC_NMI_COLLECTJS_KEY || 'REPLACE_WITH_PUBLIC_KEY';

  // Configure Collect.js (idempotent)
  const initCollect = useCallback(() => {
    if (!window.CollectJS) return;
    if (!ccNumRef.current || !expRef.current || !cvvRef.current) return;

    try {
      window.CollectJS.configure({
        tokenizationKey: COLLECT_KEY, // (some accounts use "publicKey" – adjust if needed)
        fields: {
          ccnumber: { selector: '#nmi-ccnumber', placeholder: '1234 1234 1234 1234' },
          ccexp:    { selector: '#nmi-ccexp',    placeholder: 'MM / YY' },
          cvv:      { selector: '#nmi-cvv',      placeholder: 'CVC' },
        },
        style: {
          input: {
            'font-size': '16px',
            'font-family': 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif',
            color: '#111827',
          },
          '::placeholder': { color: '#9CA3AF' },
        },
        callback: (resp: any) => {
          if (!resp?.token) {
            setMsg('Tokenization failed: missing token');
            setLoading(false);
            return;
          }
          handlePayCardWithToken(resp.token);
        },
        validationCallback: (field: string, ok: boolean, message: string) => {
          if (!ok) setMsg(`${field}: ${message}`);
        },
      });
    } catch (e: any) {
      setMsg(`Collect.js init error: ${e.message}`);
    }
  }, [COLLECT_KEY]);

  // Try configure after mount (if script already present)
  useEffect(() => { initCollect(); }, [initCollect]);

  async function handlePayCard() {
    setMsg(null);
    setLoading(true);
    try {
      if (!window.CollectJS) throw new Error('Card fields not ready');
      window.CollectJS.tokenize();
    } catch (e: any) {
      setMsg(`Card failed: ${e.message}`);
      setLoading(false);
    }
  }

  async function handlePayCardWithToken(payment_token: string) {
    try {
      const f = parseFloat(amount || '0');
      const cents = isNaN(f) ? 0 : Math.round(f * 100);
      const res = await apiPost<{ payment_id: string; status: string; provider: string }>(
        '/payments',
        {
          amount: cents,
          currency: 'USD',
          method: 'card',
          provider_pref: 'nmi',
          token: payment_token,
          capture: true,
          billing: {
            first_name: firstName,
            last_name: lastName,
            email,
            address1,
            postal,
          },
        }
      );
      setMsg(`Card success: ${res.status} | ${res.payment_id}`);
    } catch (e: any) {
      setMsg(`Card failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function payBank() {
    setMsg(null);
    setLoading(true);
    try {
      const { link_token } = await apiPost<{ link_token: string; expiration: string }>(
        '/bank-accounts/link-token',
        {}
      );
      const f = parseFloat(amount || '0');
      const cents = isNaN(f) ? 0 : Math.round(f * 100);
      const res = await apiPost<{ payment_id: string; status: string; provider: string }>(
        '/payments',
        {
          amount: cents,
          currency: 'USD',
          method: 'bank',
          rail: 'ach',
          plaid_account_id: 'acct_stub',
          billing: {
            first_name: firstName,
            last_name: lastName,
            email,
            address1,
            postal,
          },
        }
      );
      setMsg(`Bank success: ${res.status} | ${res.payment_id} (link_token: ${link_token.slice(0, 8)}...)`);
    } catch (e: any) {
      setMsg(`Bank failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Load Collect.js script; configure on load and after mount */}
      <Script src={COLLECT_URL} strategy="afterInteractive" onLoad={initCollect} />

      <h1 className="text-xl font-semibold">Hosted Checkout</h1>

      {/* Amount */}
      <label className="block text-sm">
        <span className="text-neutral-600">Amount (USD)</span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full rounded border px-2 py-1.5"
          placeholder="19.99"
          inputMode="decimal"
        />
      </label>

      {/* Billing (non-PCI) */}
      <div className="rounded border bg-white p-4 grid grid-cols-2 gap-3">
        <label className="text-sm col-span-1">
          <span className="text-neutral-600">First name</span>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5" />
        </label>
        <label className="text-sm col-span-1">
          <span className="text-neutral-600">Last name</span>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5" />
        </label>
        <label className="text-sm col-span-2">
          <span className="text-neutral-600">Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5" />
        </label>
        <label className="text-sm col-span-2">
          <span className="text-neutral-600">Billing address</span>
          <input value={address1} onChange={(e) => setAddress1(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5" />
        </label>
        <label className="text-sm col-span-1">
          <span className="text-neutral-600">ZIP / Postal</span>
          <input value={postal} onChange={(e) => setPostal(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5" />
        </label>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded border overflow-hidden">
        <button className={`px-3 py-1.5 text-sm ${tab === 'card' ? 'bg-black text-white' : 'bg-white'}`} onClick={() => setTab('card')}>
          Card
        </button>
        <button className={`px-3 py-1.5 text-sm ${tab === 'bank' ? 'bg-black text-white' : 'bg-white'}`} onClick={() => setTab('bank')}>
          Bank (ACH)
        </button>
      </div>

      {/* CARD TAB */}
      {tab === 'card' && (
        <div className="rounded border bg-white p-4 space-y-3">
          <div className="text-sm text-neutral-600 mb-1">Card (NMI Collect.js hosted fields)</div>

          {/* Card number */}
          <label className="block text-sm">
            <span className="text-neutral-600">Card number</span>
            <div id="nmi-ccnumber" ref={ccNumRef} className="mt-1 w-full rounded border px-3 py-3 min-h-[48px] flex items-center" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            {/* Expiry */}
            <label className="block text-sm">
              <span className="text-neutral-600">Expiry</span>
              <div id="nmi-ccexp" ref={expRef} className="mt-1 w-full rounded border px-3 py-3 min-h-[48px] flex items-center" />
            </label>

            {/* CVC */}
            <label className="block text-sm">
              <span className="text-neutral-600">CVC</span>
              <div id="nmi-cvv" ref={cvvRef} className="mt-1 w-full rounded border px-3 py-3 min-h-[48px] flex items-center" />
            </label>
          </div>

          <button onClick={handlePayCard} disabled={loading} className="rounded bg-black text-white px-3 py-1.5 text-sm disabled:opacity-50">
            {loading ? 'Processing…' : 'Pay now (card)'}
          </button>
        </div>
      )}

      {/* BANK TAB */}
      {tab === 'bank' && (
        <div className="rounded border bg-white p-4 space-y-3">
          <div className="text-sm text-neutral-600 mb-1">Bank (Plaid Link placeholder)</div>
          <button onClick={payBank} disabled={loading} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
            {loading ? 'Connecting bank…' : 'Continue with your bank'}
          </button>
          <p className="text-xs text-neutral-500">
            This calls <code>/bank-accounts/link-token</code> on your API (stub), then creates an ACH debit with a simulated account id.
          </p>
        </div>
      )}

      {msg && <div className="text-sm">{msg}</div>}
    </div>
  );
}