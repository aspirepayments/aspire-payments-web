'use client';

import { useState } from 'react';
import { apiPost } from '@/lib/api';
import { Card, Btn } from '@/components/Ui';
import { useRouter } from 'next/navigation';

export default function NewCustomerPage(){
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string|null>(null);

  const [form, setForm] = useState<any>({
    firstName: '', lastName: '', company: '',
    email: '', phone: '', address1: '', postal: '',
    city: '', state: '', country: 'US', terms: 'Net 30'
  });

  async function save(){
    setMsg(null);
    setSaving(true);
    try{
      // API expects merchantId; use demo_merchant for now
      await apiPost('/customers', { merchantId: 'demo_merchant', ...form });
      router.push('/customers');
    }catch(e:any){
      setMsg(e.message || 'Failed to create customer');
      setSaving(false);
    }
  }

  function Field({name, label, placeholder='' }:{name:string; label:string; placeholder?:string}){
    return (
      <label className="block text-sm">
        <span className="text-neutral-600">{label}</span>
        <input className="input mt-1" placeholder={placeholder}
          value={form[name] ?? ''} onChange={e=>setForm({...form,[name]:e.target.value})}/>
      </label>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">New Customer</h1>
        <div className="flex gap-2">
          <Btn kind="ghost" onClick={()=>router.push('/customers')}>Cancel</Btn>
          <Btn kind="primary" onClick={save} disabled={saving}>{saving?'Saving…':'Create'}</Btn>
        </div>
      </div>

      <Card className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field name="firstName" label="First name"/>
        <Field name="lastName"  label="Last name"/>
        <Field name="company"   label="Company"/>
        <Field name="email"     label="Email"/>
        <Field name="phone"     label="Phone"/>
        <Field name="address1"  label="Address"/>
        <Field name="city"      label="City"/>
        <Field name="state"     label="State/Province"/>
        <Field name="postal"    label="Postal"/>
        <Field name="country"   label="Country"/>
        <label className="block text-sm">
          <span className="text-neutral-600">Payment Terms</span>
          <select className="select mt-1" value={form.terms} onChange={e=>setForm({...form,terms:e.target.value})}>
            <option>Due on Receipt</option>
            <option>Net 7</option>
            <option>Net 14</option>
            <option>Net 30</option>
            <option>Net 45</option>
            <option>Net 60</option>
          </select>
        </label>
      </Card>

      {msg && <Card className="p-3 text-sm text-red-600">{msg}</Card>}
    </div>
  );
}