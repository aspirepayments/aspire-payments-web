'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import { apiGet, apiPut, apiPatch } from '@/lib/api';
import { Card, Btn } from '@/components/Ui';

type Customer = { id:string; firstName:string; lastName:string; company?:string|null; email?:string|null; terms?:string|null };
type Item = { id:string; name:string; unitPrice:number; description?:string|null };
type FeePlan = { id:string; name:string; mode:'none'|'convenience'|'service'|string; isDefault:boolean; convenienceFeeCents?:number; serviceFeeBps?:number };
type TaxRate = { id:string; name:string; rateBps:number; isDefault:boolean };

function iso(date: Date) { return date.toISOString().slice(0,10); }
function addDays(d: Date, days: number) { return new Date(d.getTime()+days*86400000); }
function termDaysFromString(term?: string) {
  if (!term) return 30;
  const t = term.trim();
  if (/^due on receipt$/i.test(t)) return 0;
  const m = /^net\s+(\d+)$/i.exec(t); if (m) return Math.max(0, parseInt(m[1], 10) || 0);
  return 30;
}

export default function EditInvoicePage() {
  const params = useParams<{id:string}>();
  const router = useRouter();

  // Load invoice + deps
  const { data: invRes } = useSWR<{invoice:any}>(`/invoices/${params.id}`, apiGet);
  const { data: custRes } = useSWR<{customers:Customer[]}>('/customers', apiGet);
  const { data: planRes } = useSWR<{plans:FeePlan[]}>('/settings/fee-plans', apiGet);
  const { data: taxRes }  = useSWR<{rates:TaxRate[]}>('/settings/tax-rates', apiGet);

  // Form state
  const [issueDate, setIssueDate] = useState('');
  const [term, setTerm]           = useState('');
  const [dueDate, setDueDate]     = useState('');
  const [customerId, setCustomerId] = useState('');
  const [currency, setCurrency]   = useState('USD');
  const [feePlanId, setFeePlanId] = useState(''); // optional re-apply plan
  const [taxRateId, setTaxRateId] = useState('');
  const [lines, setLines] = useState<Array<{ id:string; itemId?:string; description:string; qty:number; unitPrice:number; taxable:boolean }>>([]);
  const [message, setMessage] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Prefill when invoice loads
  useEffect(()=>{
    const inv = invRes?.invoice;
    if (!inv) return;
    setIssueDate(inv.issueDate?.slice(0,10) || '');
    setTerm(inv.term ?? '');
    setDueDate(inv.dueDate?.slice(0,10) || '');
    setCustomerId(inv.customerId);
    setCurrency(inv.currency || 'USD');
    setTaxRateId(inv.taxRateId ?? '');
    setMessage(inv.message ?? '');
    setInternalNote(inv.internalNote ?? '');
    setLines(inv.items.map((it:any)=>({
      id: it.id,
      itemId: it.itemId ?? undefined,
      description: it.description,
      qty: it.quantity,
      unitPrice: it.unitPrice,
      taxable: !!it.taxable
    })));
  },[invRes]);

  function updateLine(id:string, patch:Partial<{itemId:string; description:string; qty:number; unitPrice:number; taxable:boolean}>){
    setLines(l=>l.map(x=>x.id===id?{...x,...patch}:x));
  }
  function addLine(){ setLines(l=>[...l, { id: crypto.randomUUID(), description:'', qty:1, unitPrice:0, taxable:false }]); }
  function removeLine(id:string){ setLines(l=>l.filter(x=>x.id!==id)); }

  const baseSubtotal = useMemo(()=> lines.reduce((a,l)=>a + l.qty*l.unitPrice, 0), [lines]);
  const taxes = taxRes?.rates ?? [];
  const selectedTax = taxes.find(t=>t.id===taxRateId);
  const previewTax = useMemo(()=>{
    if (!selectedTax) return 0;
    const bps = Math.max(0, Number(selectedTax.rateBps||0)|0);
    const taxableBase = lines.filter(l=>l.taxable).reduce((a,l)=>a + l.qty*l.unitPrice, 0);
    return Math.round(taxableBase*(bps/10000));
  }, [selectedTax, lines]);
  const previewTotal = baseSubtotal + previewTax;

  async function onSave(){
    setBusy(true);
    try{
      // PUT edit (always allowed even if nothing changed)
      const payload:any = {
        customerId,
        issueDate,
        term,
        dueDate,
        currency,
        items: lines.map(l=>({
          itemId:l.itemId ?? undefined,
          description:l.description,
          quantity:l.qty,
          unitPrice:l.unitPrice,
          taxable:l.taxable
        })),
        taxRateId: taxRateId || undefined,
        message,
        internalNote
      };
      if (feePlanId) payload.feePlanId = feePlanId; // reapply fee plan if selected
      await apiPut(`/invoices/${params.id}`, payload);
      router.push(`/invoices/${params.id}`); // go back to detail after save
    }catch(e:any){
      alert(e.message || 'Failed to save invoice');
    }finally{
      setBusy(false);
    }
  }

  async function onVoid(){
    if (!confirm('Void this invoice? This marks it as void and prevents further collection.')) return;
    setBusy(true);
    try{
      await apiPatch(`/invoices/${params.id}`, { status: 'void' });
      router.push(`/invoices/${params.id}`);
    }catch(e:any){
      alert(e.message || 'Failed to void invoice');
    }finally{
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header / actions */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit Invoice</h1>
        <div className="flex items-center gap-2">
          {/* CANCEL → Invoices list as requested */}
          <Btn kind="ghost" onClick={()=>router.push('/invoices')}>Cancel</Btn>
          <Btn kind="ghost" onClick={onVoid} disabled={busy}>Void</Btn>
          <Btn kind="primary" onClick={onSave} disabled={busy}>{busy?'Saving…':'Save changes'}</Btn>
        </div>
      </div>

      {/* Header fields */}
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="block text-sm"><span>Issue Date</span>
            <input type="date" className="input mt-1" value={issueDate||''} onChange={e=>setIssueDate(e.target.value)}/>
          </label>
          <label className="block text-sm"><span>Term</span>
            <input className="input mt-1" value={term||''} onChange={e=>setTerm(e.target.value)}/>
          </label>
          <label className="block text-sm"><span>Due Date</span>
            <input type="date" className="input mt-1" value={dueDate||''} onChange={e=>setDueDate(e.target.value)}/>
          </label>
          <label className="block text-sm"><span>Currency</span>
            <input className="input mt-1" value={currency} onChange={e=>setCurrency(e.target.value)}/>
          </label>
        </div>

        <label className="block text-sm"><span>Customer</span>
          <select className="select mt-1" value={customerId} onChange={e=>setCustomerId(e.target.value)}>
            {(custRes?.customers??[]).map(c=><option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.company?` – ${c.company}`:''}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block text-sm"><span>Fee Plan (optional)</span>
            <select className="select mt-1" value={feePlanId} onChange={e=>setFeePlanId(e.target.value)}>
              <option value="">Do not change</option>
              {(planRes?.plans??[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          <label className="block text-sm"><span>Sales Tax</span>
            <select className="select mt-1" value={taxRateId} onChange={e=>setTaxRateId(e.target.value)}>
              <option value="">None</option>
              {(taxRes?.rates??[]).map(t=><option key={t.id} value={t.id}>{t.name} ({(t.rateBps/100).toFixed(2)}%)</option>)}
            </select>
          </label>
        </div>

        {/* Items */}
        <div className="space-y-2">
          <div className="section-title">Items</div>
          <table className="table">
            <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Taxable</th><th className="text-right">Amount</th><th/></tr></thead>
            <tbody>
              {lines.map(l=>{
                const amt=l.qty*l.unitPrice;
                return (
                  <tr key={l.id}>
                    <td><input className="input" value={l.description} onChange={e=>updateLine(l.id,{description:e.target.value})}/></td>
                    <td><input type="number" min={1} className="input text-right" value={l.qty} onChange={e=>{
                      const n = parseInt(e.target.value||'1',10); updateLine(l.id,{qty: isNaN(n)||n<1 ? 1 : n});
                    }}/></td>
                    <td><input type="number" step="0.01" min={0} className="input text-right" value={(l.unitPrice/100).toFixed(2)} onChange={e=>{
                      const f=parseFloat(e.target.value); const cents=isNaN(f)?0:Math.round(f*100); updateLine(l.id,{unitPrice:Math.max(0,cents)});
                    }}/></td>
                    <td className="text-center"><input type="checkbox" checked={l.taxable} onChange={e=>updateLine(l.id,{taxable:e.target.checked})}/></td>
                    <td className="text-right">{(amt/100).toLocaleString(undefined,{style:'currency',currency:'USD'})}</td>
                    <td className="text-center"><Btn kind="ghost" className="text-xs px-2" onClick={()=>removeLine(l.id)}>✕</Btn></td>
                  </tr>
                );
              })}
              {!lines.length && <tr><td className="p-3 text-neutral-500" colSpan={6}>No items</td></tr>}
            </tbody>
          </table>
          <Btn kind="ghost" onClick={addLine}>Add item</Btn>
        </div>

        {/* Message & Note */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm"><span>Message</span>
            <textarea className="textarea mt-1" rows={3} value={message} onChange={e=>setMessage(e.target.value)}/>
          </label>
          <label className="block text-sm"><span>Internal Note</span>
            <textarea className="textarea mt-1" rows={3} value={internalNote} onChange={e=>setInternalNote(e.target.value)}/>
          </label>
        </div>

        {/* Quick totals preview */}
        <div className="flex justify-end gap-10 mt-2">
          <div className="muted small">Subtotal</div>
          <div>{(baseSubtotal/100).toLocaleString(undefined,{style:'currency',currency:'USD'})}</div>
        </div>
        {selectedTax && <div className="flex justify-end gap-10 small">
          <div className="muted">Tax ({(selectedTax.rateBps/100).toFixed(2)}%)</div>
          <div>{(previewTax/100).toLocaleString(undefined,{style:'currency',currency:'USD'})}</div>
        </div>}
        <div className="flex justify-end gap-10 font-semibold">
          <div>Total</div>
          <div>{(previewTotal/100).toLocaleString(undefined,{style:'currency',currency:'USD'})}</div>
        </div>
      </Card>
    </div>
  );
}