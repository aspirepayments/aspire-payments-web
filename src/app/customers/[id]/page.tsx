'use client';

import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { Card, Btn } from '@/components/Ui';
import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    CollectJS?: { tokenize: () => void };
    collectHandler?: (resp: any) => void;
  }
}

type Customer = {
  id: string; firstName: string; lastName: string; company?: string|null;
  email?: string|null; phone?: string|null; address1?: string|null;
  postal?: string|null; city?:string|null; state?:string|null; country?:string|null;
  terms?: string|null; createdAt: string;
};

type PaymentMethod = {
  id: string; type: 'card'|'bank'; vaultProvider: string; providerRef: string;
  brand?: string|null; last4?: string|null; expMonth?: number|null; expYear?: number|null;
  bankName?: string|null; mask?: string|null; isDefault: boolean; status: string;
};

const STANDARD_TERMS = ['Due on Receipt','Net 7','Net 14','Net 30'] as const;

export default function CustomerDetailPage(){
  const params = useParams<{id:string}>();
  const router = useRouter();

  const { data: custRes, mutate: mutateCustomer } =
    useSWR<{customer:Customer}>(`/customers/${params.id}`, apiGet);
  const { data: pmRes, mutate: mutatePMs } =
    useSWR<{payment_methods:PaymentMethod[]}>(`/customers/${params.id}/payment-methods`, apiGet);

  const [form,setForm] = useState<Customer | null>(null);
  const [saving,setSaving] = useState(false);
  const [openAddCard, setOpenAddCard] = useState(false);
  const [msg, setMsg] = useState<string|null>(null);
  const [adding, setAdding] = useState(false);
  const [collectReady, setCollectReady] = useState(false);

  useEffect(()=>{ if (custRes?.customer) setForm(custRes.customer); },[custRes]);

  async function saveCustomer(){
    if (!form) return;
    try{ setSaving(true); await apiPatch(`/customers/${params.id}`, form); await mutateCustomer(); alert('Saved'); }
    catch(e:any){ alert(e.message || 'Failed to save'); }
    finally{ setSaving(false); }
  }

  // Non-PCI billing for vault
  const first = useRef(''); const last = useRef(''); const email = useRef('');
  const addr1 = useRef(''); const postal = useRef('');

  // Inject Collect.js (simple mode) once; don’t remove existing
  const COLLECT_URL = process.env.NEXT_PUBLIC_NMI_COLLECTJS_URL || 'https://secure.nmi.com/token/Collect.js';
  const COLLECT_KEY = process.env.NEXT_PUBLIC_NMI_COLLECTJS_KEY  || '';

  useEffect(()=>{
    try { (window as any).ApplePaySession = undefined; } catch {}
    try { (window as any).PaymentRequest  = undefined; } catch {}

    let script = document.querySelector<HTMLScriptElement>('script[src*="Collect.js"]');
    if (!script) {
      script = document.createElement('script');
      script.src = COLLECT_URL;
      if (COLLECT_KEY) script.setAttribute('data-tokenization-key', COLLECT_KEY);
      script.setAttribute('data-callback', 'collectHandler');
      script.onload = () => setCollectReady(true);
      document.head.appendChild(script);
    } else {
      if (COLLECT_KEY && !script.getAttribute('data-tokenization-key')) {
        script.setAttribute('data-tokenization-key', COLLECT_KEY);
      }
      if (!script.getAttribute('data-callback')) {
        script.setAttribute('data-callback', 'collectHandler');
      }
      setCollectReady(true);
    }
  }, [COLLECT_URL, COLLECT_KEY]);

  // Global Collect.js callback (simple mode)
  useEffect(() => {
    window.collectHandler = async (resp: any) => {
      if (!resp || !resp.token) {
        setMsg(`Tokenization failed${resp?.error ? ': ' + resp.error : ''}`);
        setAdding(false);
        return;
      }
      try {
        await apiPost('/payment-methods', {
          customerId: params.id,
          type: 'card',
          provider: 'nmi',
          payment_token: resp.token,
          billing: {
            first_name:first.current, last_name:last.current, email:email.current,
            address1:addr1.current, postal:postal.current
          },
          makeDefault: true
        });
        setMsg('Card saved ✓');
        setOpenAddCard(false);
        await mutatePMs();
      } catch(e:any) {
        setMsg(`Save failed: ${e.message}`);
      } finally {
        setAdding(false);
      }
    };
    return () => { delete window.collectHandler; };
  }, [params.id, mutatePMs]);

  // format helpers
  function formatCard(e: React.ChangeEvent<HTMLInputElement>){
    const digits = e.target.value.replace(/\D/g,'').slice(0,19);
    const parts = []; for (let i=0;i<digits.length;i+=4) parts.push(digits.slice(i,i+4));
    e.target.value = parts.join(' ');
  }
  function formatExpiry(e: React.ChangeEvent<HTMLInputElement>){
    const d = e.target.value.replace(/\D/g,'').slice(0,4);
    e.target.value = d.length<=2 ? d : `${d.slice(0,2)}/${d.slice(2)}`;
  }

  async function setDefault(pmId:string){ await apiPost(`/payment-methods/${pmId}/default`, {}); await mutatePMs(); }
  async function removePM(pmId:string){
    if (!confirm('Remove this payment method?')) return;
    await fetch((process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000/v1') + `/payment-methods/${pmId}`, { method:'DELETE' });
    await mutatePMs();
  }

  if (!form) return <div className="small muted">Loading…</div>;
  const pmList = pmRes?.payment_methods ?? [];

  return (
    <div className="space-y-4">
      {/* Header & actions */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Customer</h1>
        <div className="flex gap-2">
          <Btn kind="ghost" onClick={()=>router.push('/customers')}>Back</Btn>
          <Btn kind="primary" onClick={saveCustomer} disabled={saving}>{saving?'Saving…':'Save'}</Btn>
        </div>
      </div>

      {/* Customer details (editable) */}
      <Card className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {['firstName','lastName','company','email','phone','address1','city','state','postal','country'].map(k=>(
          <label key={k} className="block text-sm">
            <span className="text-neutral-600 capitalize">{k}</span>
            <input className="input mt-1" value={(form as any)[k] ?? ''} onChange={e=>setForm({...form!, [k]: e.target.value})}/>
          </label>
        ))}
      </Card>

      {/* Terms editor */}
      <Card className="p-4 space-y-3">
        <div className="section-title">Payment Terms</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block text-sm">
            <span className="text-neutral-600">Standard terms</span>
            <select className="select mt-1"
              value={STANDARD_TERMS.includes((form.terms||'') as any) ? form.terms! : ''}
              onChange={e=>setForm({...form!, terms: e.target.value || form.terms || ''})}
            >
              <option value="">—</option>
              {STANDARD_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Custom (e.g., Net 45)</span>
            <input className="input mt-1" placeholder="Net 45"
              value={form.terms ?? ''} onChange={e=>setForm({...form!, terms: e.target.value})}/>
            <div className="hint mt-1">Due dates auto-calc from “Net X”.</div>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Current terms</span>
            <input className="input mt-1" readOnly value={form.terms ?? '—'}/>
          </label>
        </div>
      </Card>

      {/* Payment Methods */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="section-title">Payment Methods</div>
          <Btn kind="primary" onClick={()=>{ setMsg(null); setOpenAddCard(true); }}>
            Add card
          </Btn>
        </div>

        <div className="overflow-auto rounded border bg-white">
          <table className="table">
            <thead>
              <tr className="text-left">
                <th>Type</th><th>Brand</th><th>Ref</th><th>Exp</th><th>Default</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pmList.map(pm=>{
                const ref = pm.last4 ? `****${pm.last4}` : (pm.mask ?? '—');
                const exp = pm.expMonth && pm.expYear ? `${pm.expMonth}/${String(pm.expYear).slice(-2)}` : '—';
                return (
                  <tr key={pm.id}>
                    <td>{pm.type}</td>
                    <td>{pm.brand ?? (pm.type==='bank' ? 'ach' : '—')}</td>
                    <td>{ref}</td>
                    <td>{exp}</td>
                    <td>{pm.isDefault ? 'Yes' : 'No'}</td>
                    <td className="space-x-2">
                      {!pm.isDefault && <Btn kind="ghost" className="text-xs px-2" onClick={()=>setDefault(pm.id)}>Set default</Btn>}
                      <Btn kind="ghost" className="text-xs px-2" onClick={()=>removePM(pm.id)}>Remove</Btn>
                    </td>
                  </tr>
                );
              })}
              {!pmList.length && (
                <tr><td className="p-3 text-neutral-500" colSpan={6}>No saved methods.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add Card Drawer — simple Collect.js inputs */}
        {openAddCard && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/30" onClick={()=>setOpenAddCard(false)} />
            <div className="absolute right-0 top-0 h-full w-full max-w-[520px] card overflow-auto">
              <div className="sticky top-0 bg-white/90 border-b p-4 flex items-center justify-between">
                <div className="font-semibold">Add Card (NMI)</div>
                <Btn kind="ghost" onClick={()=>setOpenAddCard(false)}>Close</Btn>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="text-neutral-600">First name</span><input className="input mt-1" onChange={e=>first.current=e.target.value}/></label>
                  <label className="block"><span className="text-neutral-600">Last name</span><input  className="input mt-1" onChange={e=>last.current=e.target.value}/></label>
                  <label className="block col-span-2"><span className="text-neutral-600">Email</span><input className="input mt-1" onChange={e=>email.current=e.target.value}/></label>
                  <label className="block col-span-2"><span className="text-neutral-600">Address</span><input className="input mt-1" onChange={e=>addr1.current=e.target.value}/></label>
                  <label className="block"><span className="text-neutral-600">ZIP</span><input className="input mt-1" onChange={e=>postal.current=e.target.value}/></label>
                </div>

                <label className="block"><span className="text-neutral-600">Card Number</span>
                  <input data-payment-field="ccnumber" inputMode="numeric" autoComplete="cc-number"
                         placeholder="4111 1111 1111 1111" className="input mt-1" onInput={formatCard}/>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="text-neutral-600">Expiry (MM/YY)</span>
                    <input data-payment-field="ccexp" inputMode="numeric" autoComplete="cc-exp"
                           placeholder="MM/YY" className="input mt-1" onInput={formatExpiry}/>
                  </label>
                  <label className="block"><span className="text-neutral-600">CVV</span>
                    <input data-payment-field="cvv" inputMode="numeric" autoComplete="cc-csc"
                           placeholder="123" className="input mt-1"/>
                  </label>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Btn kind="primary"
                    onClick={()=>{
                      setMsg(null); setAdding(true);
                      if (!window.CollectJS || !window.CollectJS.tokenize) {
                        setMsg('Card fields are still loading… try again in a moment.');
                        setAdding(false);
                        return;
                      }
                      window.CollectJS.tokenize();
                    }}
                    disabled={adding || !collectReady}>
                    {adding ? 'Saving…' : (collectReady ? 'Save card' : 'Loading fields…')}
                  </Btn>
                  {msg && <div className="small">{msg}</div>}
                </div>

                <div className="hint">Card data is tokenized by NMI Collect.js (simple mode) and vaulted at NMI; your app stores only a safe reference.</div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}