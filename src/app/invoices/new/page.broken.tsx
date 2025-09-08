'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { apiGet, apiPost } from '@/lib/api';
import { Card, Btn } from '@/components/Ui';

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  company?: string | null;
  email?: string | null;
  terms?: string | null;
};
type Item = { id: string; name: string; unitPrice: number; description?: string | null };
type FeePlan = {
  id: string;
  name: string;
  mode: 'none' | 'convenience' | 'service' | string;
  isDefault: boolean;
  convenienceFeeCents?: number;
  serviceFeeBps?: number;
};
type TaxRate = { id: string; name: string; rateBps: number; isDefault: boolean };

const TERMS = ['Due on Receipt','Net 7','Net 14','Net 30','Net 45','Net 60'] as const;

function iso(date: Date) { return date.toISOString().slice(0,10); }
function addDays(d: Date, days: number) { return new Date(d.getTime()+days*86400000); }
function termDaysFromString(term?: string) {
  if (!term) return 30;
  const t = term.trim();
  if (/^due on receipt$/i.test(t)) return 0;
  const m = /^net\s+(\d+)$/i.exec(t);
  if (m) return Math.max(0, parseInt(m[1],10)||0);
  return 30;
}

export default function NewInvoicePage() {
  const { data: custData } = useSWR<{customers:Customer[]}>('/customers', apiGet);
  const { data: itemData, mutate: refreshItems } = useSWR<{items:Item[]}>('/items', apiGet);
  const { data: planData } = useSWR<{plans:FeePlan[]}>('/settings/fee-plans', apiGet);
  const { data: taxData }  = useSWR<{rates:TaxRate[]}>('/settings/tax-rates', apiGet);

  const today = new Date();
  const [issueDate, setIssueDate] = useState(iso(today));
  const [term, setTerm]           = useState('Net 30');
  const [dueDate, setDueDate]     = useState(iso(addDays(today,30)));

  useEffect(()=>{ setDueDate(iso(addDays(new Date(issueDate), termDaysFromString(term)))); },[issueDate,term]);

  const [customerId, setCustomerId] = useState('');
  const [feePlanId, setFeePlanId]   = useState('');
  const [taxRateId, setTaxRateId]   = useState('');
  const [lines, setLines] = useState<Array<{id:string; itemId?:string; description:string; qty:number; unitPrice:number; taxable:boolean}>>([]);
  const [sendBehavior, setSendBehavior] = useState<'send_immediately'|'draft'>('send_immediately');
  const [message,setMessage] = useState('');
  const [internalNote,setInternalNote] = useState('');

  // auto-fill terms from customer
  useEffect(()=>{
    if (!customerId) return;
    const c=(custData?.customers??[]).find(c=>c.id===customerId);
    if (c?.terms){
      setTerm(c.terms);
      setDueDate(iso(addDays(new Date(issueDate), termDaysFromString(c.terms))));
    }
  },[customerId]);

  function addLine(){ setLines(l=>[...l,{id:crypto.randomUUID(),description:'',qty:1,unitPrice:0,taxable:false}]); }
  function removeLine(id:string){ setLines(l=>l.filter(x=>x.id!==id)); }
  function updateLine(id:string, patch:Partial<{itemId:string;description:string;qty:number;unitPrice:number;taxable:boolean}>){
    setLines(l=>l.map(x=>x.id===id?{...x,...patch}:x));
  }

  const items=itemData?.items??[];
  const plans=planData?.plans??[];
  const taxes=taxData?.rates??[];
  const selectedPlan=plans.find(p=>p.id===feePlanId);
  const selectedTax=taxes.find(t=>t.id===taxRateId);

  const baseSubtotal=useMemo(()=>lines.reduce((a,l)=>a+l.qty*l.unitPrice,0),[lines]);

  const previewFee=useMemo(()=>{
    if (!selectedPlan) return {amount:0,description:'',normalizedMode:'none'};
    const mode=String(selectedPlan.mode||'none').toLowerCase();
    if(mode==='convenience'){
      const cents=Math.max(0,Number(selectedPlan.convenienceFeeCents||0)|0);
      return cents>0?{amount:cents,description:selectedPlan.name||'Convenience Fee',normalizedMode:'convenience'}:{amount:0,description:'',normalizedMode:'convenience'};
    }
    if(mode==='service'){
      const bps=Math.max(0,Number(selectedPlan.serviceFeeBps||0)|0);
      const amt=Math.round(baseSubtotal*(bps/10000));
      return amt>0?{amount:amt,description:`${selectedPlan.name||'Service Fee'} (${(bps/100).toFixed(2)}%)`,normalizedMode:'service'}:{amount:0,description:'',normalizedMode:'service'};
    }
    return {amount:0,description:'',normalizedMode:'none'};
  },[selectedPlan,baseSubtotal]);

  const taxableBase=useMemo(()=>lines.filter(l=>l.taxable).reduce((a,l)=>a+l.qty*l.unitPrice,0),[lines]);
  const previewTax=useMemo(()=>{
    if(!selectedTax) return 0;
    const bps=Math.max(0,Number(selectedTax.rateBps||0)|0);
    return Math.round(taxableBase*(bps/10000));
  },[selectedTax,taxableBase]);

  const previewLines=useMemo(()=>{
    if(previewFee.amount<=0) return lines;
    return [...lines,{id:'fee-preview',description:previewFee.description,qty:1,unitPrice:previewFee.amount,taxable:false}];
  },[lines,previewFee]);

  const previewSubtotal=baseSubtotal+previewFee.amount;
  const previewTotal=previewSubtotal+previewTax;

  async function saveInvoice(){
    if(!customerId){ alert('Pick a customer'); return; }
    if(lines.length===0){ alert('Add at least one item'); return; }

    const payload={
      merchantId:'demo_merchant',
      customerId,
      issueDate,
      term,
      dueDate,
      currency:'USD',
      feePlanId: feePlanId||undefined,
      taxRateId: taxRateId||undefined,
      items: lines.map(l=>({itemId:l.itemId??undefined,description:l.description,quantity:l.qty,unitPrice:l.unitPrice,taxable:l.taxable})),
      message,
      internalNote,
      sendBehavior
    };
    const res=await apiPost<{invoice:any}>('/invoices',payload);
    alert(`Invoice created: ${res.invoice.number}`);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* LEFT FORM */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Create Invoice</h1>
          <div className="flex items-center gap-2">
            <Btn kind="ghost" onClick={()=>setSendBehavior('draft')}>Save draft</Btn>
            <Btn kind="primary" onClick={saveInvoice}>
              {sendBehavior==='send_immediately'?'Save & send':'Save draft'}
            </Btn>
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm"><span>Invoice Date</span>
            <input type="date" value={issueDate} onChange={e=>setIssueDate(e.target.value)} className="input mt-1"/>
          </label>
          <label className="block text-sm"><span>Term</span>
            <select value={term} onChange={e=>setTerm(e.target.value)} className="select mt-1">
              {TERMS.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="block text-sm"><span>Due Date</span>
            <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} className="input mt-1"/>
          </label>
        </div>

        {/* Customer */}
        <label className="block text-sm"><span>Customer</span>
          <select value={customerId} onChange={e=>setCustomerId(e.target.value)} className="select mt-1">
            <option value="">Select customer…</option>
            {(custData?.customers??[]).map(c=><option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.company?` – ${c.company}`:''}</option>)}
          </select>
        </label>

        {/* Fee + Tax */}
        {plans.length>0 && <label className="block text-sm"><span>Fee plan</span>
          <select className="select mt-1" value={feePlanId} onChange={e=>setFeePlanId(e.target.value)}>
            <option value="">None</option>
            {plans.map(p=><option key={p.id} value={p.id}>{p.name}{p.isDefault?' (default)':''}</option>)}
          </select>
        </label>}
        {taxes.length>0 && <label className="block text-sm"><span>Sales Tax</span>
          <select className="select mt-1" value={taxRateId} onChange={e=>setTaxRateId(e.target.value)}>
            <option value="">None</option>
            {taxes.map(t=><option key={t.id} value={t.id}>{t.name} ({(t.rateBps/100).toFixed(2)}%)</option>)}
          </select>
        </label>}

        {/* Items */}
        <div className="space-y-2">
          <div className="section-title">Details</div>
          <table className="table">
            <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Taxable</th><th className="text-right">Amount</th><th/></tr></thead>
            <tbody>
              {lines.map(l=>{
                const amt=l.qty*l.unitPrice;
                return (
                  <tr key={l.id}>
                    <td><input className="input" value={l.description} onChange={e=>updateLine(l.id,{description:e.target.value})}/></td>
                    <td><input type="number" min={1} className="input text-right" value={l.qty} onChange={e=>{
                      const n=parseInt(e.target.value||'1',10); updateLine(l.id,{qty:isNaN(n)||n<1?1:n});
                    }}/></td>
                    <td><input type="number" step="0.01" min={0} className="input text-right" value={(l.unitPrice/100).toFixed(2)} onChange={e=>{
                      const f=parseFloat(e.target.value); const cents=isNaN(f)?0:Math.round(f*100); updateLine(l.id,{unitPrice:Math.max(0,cents)});
                    }}/></td>
                    <td className="text-center"><input type="checkbox" checked={l.taxable} onChange={e=>updateLine(l.id,{taxable:e.target.checked})}/></td>
                    <td className="text-right">{(amt/100).toLocaleString(undefined,{style:'currency',currency:'USD'})}</td>
                    <td><Btn kind="ghost" className="text-xs px-2" onClick={()=>removeLine(l.id)}>✕</Btn></td>
                  </tr>
                );
              })}
              {!lines.length && <tr><td colSpan={6} className="p-3 text-neutral-500">No items</td></tr>}
            </tbody>
          </table>
          <Btn kind="ghost" onClick={addLine}>Add item</Btn>
        </div>

        {/* Message/Note */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm"><span>Message</span>
            <textarea className="textarea mt-1" rows={3} value={message} onChange={e=>setMessage(e.target.value)}/>
          </label>
          <label className="block text-sm"><span>Internal Note</span>
            <textarea className="textarea mt-1" rows={3} value={internalNote} onChange={e=>setInternalNote(e.target.value)}/>
          </label>
        </div>
      </Card>

      {/* RIGHT PREVIEW */}
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1 text-sm">
            <img src="/logo.png" className="h-8 w-auto"/>
            <div>990 South Rogers Circle</div>
            <div>Ste 4</div>
            <div>Boca Raton, FL 33487</div>
            <div>(888) 555-1466</div>
          </div>
          <div className="text-sm text-right">
            <div>Date: {issueDate}</div>
            <div>Due: {dueDate}</div>
            <div>Terms: {term||'—'}</div>
          </div>
        </div>
        <div className="text-sm">
          <div className="section-title">Bill To</div>
          {customerId?(()=>{
            const c=(custData?.customers??[]).find(x=>x.id===customerId)!;
            return <div className="small">
              <div>{c.firstName} {c.lastName}{c.company?` – ${c.company}`:''}</div>
              {c.email && <div className="muted">{c.email}</div>}
            </div>;
          })():<div className="muted small">No customer selected</div>}
        </div>

        <div className="divider"/>
        <table className="w-full text-sm">
          <thead><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {previewLines.map(l=>
              <tr key={l.id} className="border-t">
                <td className="p-2">{l.description}</td>
                <td className="p-2 text-right">{(l as any).qty??1}</td>
                <td className="p-2 text-right">{(l.unitPrice/100).toLocaleString(undefined,{style:'currency',currency:'USD'})}</td>
                <td className="p-2 text-right">{(((l.unitPrice)*((l as any).qty??1))/100).toLocaleString(undefined,{style:'currency',currency:'USD'})}</td>
              </tr>)}
          </tbody>
        </table>

        <div className="divider"/>
        <div className="space-y-1">
          <div className="flex justify-between small"><span className="muted">Subtotal</span><span>{(baseSubtotal/100).toLocaleString(undefined,{style:'currency',currency:'USD'})}</span></div>
          {previewFee.amount>0 && <div className="flex justify-between small"><span className="muted">Fees</span><span>{(previewFee.amount/100).toLocaleString(undefined,{style:'currency',currency:'USD'})}</span></div>}
          {selectedTax && <div className="flex justify-between small"><span className="muted">Tax ({(selectedTax.rateBps/100).toFixed(2)}%)</span><span>{(previewTax/100).toLocaleString(undefined,{style:'currency',currency:'USD'})}</span></div>}
          <div className="flex justify-between font-semibold"><span>Total</span><span>{(previewTotal/100).toLocaleString(undefined,{style:'currency',currency:'USD'})}</span></div>
        </div>

        {message && <><div className="divider"/><div className="text-sm"><div className="section-title">Message</div><div className="small">{message}</div></div></>}
      </Card>
    </div>
  );
}
