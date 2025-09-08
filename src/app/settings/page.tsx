'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { Card, Btn } from '@/components/Ui';

type Profile = {
  companyName?: string; address1?: string; address2?: string; city?:string; state?:string; postal?:string; country?:string;
  phone?:string; websiteUrl?:string; email?:string; taxId?:string; logoUrl?:string;
  termsText?:string; refundPolicyText?:string; privacyPolicyText?:string;
};
type User = {
  id:string; firstName:string; lastName:string; email:string; mobile?:string|null; role:string;
};

export default function SettingsPage(){
  const [tab,setTab] = useState<'general'|'fees'|'users'|'tax'|'payments'>('general');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={()=>setTab('general')}  className={`btn btn-ghost ${tab==='general'?'ring-1':''}`}>General</button>
        <button onClick={()=>setTab('fees')}     className={`btn btn-ghost ${tab==='fees'?'ring-1':''}`}>Fees</button>
        <button onClick={()=>setTab('users')}    className={`btn btn-ghost ${tab==='users'?'ring-1':''}`}>Users</button>
        <button onClick={()=>setTab('tax')}      className={`btn btn-ghost ${tab==='tax'?'ring-1':''}`}>Tax</button>
        <button onClick={()=>setTab('payments')} className={`btn btn-ghost ${tab==='payments'?'ring-1':''}`}>Payments</button>
      </div>

      {tab==='general'  && <GeneralSettings />}
      {tab==='fees'     && <FeeSettings />}
      {tab==='users'    && <UsersSettings />}
      {tab==='tax'      && <TaxSettings />}
      {tab==='payments' && <PaymentsSettings />}
    </div>
  );
}

/* -------------------- Payments (new tab) -------------------- */
function PaymentsSettings() {
  // optional: fetch embedded account id to display status at a glance
  const { data } = useSWR<{ embeddedAccountId: string | null }>('/straddle/accounts/demo_merchant', apiGet);
  const acctId = data?.embeddedAccountId ?? null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Card Gateways tile */}
      <Link href="/gateways" className="card block p-4 hover:shadow-md transition border rounded-lg bg-white">
        <div className="text-sm text-neutral-500">Payments</div>
        <div className="mt-1 font-medium">Card Gateways</div>
        <p className="text-sm text-neutral-600 mt-2">
          Connect NMI or Authorize.Net to accept credit/debit cards. Manage credentials and routing preferences.
        </p>
        <div className="mt-3">
          <Btn kind="ghost">Configure</Btn>
        </div>
      </Link>

      {/* Pay by Bank tile */}
      <Link href="/settings/payments" className="card block p-4 hover:shadow-md transition border rounded-lg bg-white">
        <div className="text-sm text-neutral-500">Payments</div>
        <div className="mt-1 font-medium">Pay by Bank (ACH / RTP)</div>
        <p className="text-sm text-neutral-600 mt-2">
          Onboard with Straddle to enable ACH debits and RTP payouts. Create your embedded account and manage pay-by-bank.
        </p>
        {acctId ? (
          <div className="mt-3 text-sm">
            <div className="muted">Embedded Account</div>
            <code className="text-xs">{acctId}</code>
          </div>
        ) : (
          <div className="mt-3">
            <Btn kind="ghost">Get Started</Btn>
          </div>
        )}
      </Link>
    </div>
  );
}

/* -------------------- General -------------------- */
function GeneralSettings(){
  const { data, mutate } = useSWR<{profile:Profile|null}>('/settings/general', apiGet);
  const [form,setForm] = useState<Profile>({});

  useEffect(()=>{ if(data?.profile) setForm(data.profile); },[data]);

  async function save(){
    await apiPatch('/settings/general', form);
    await mutate();
    alert('Saved');
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Company name"><input className="input" value={form.companyName??''} onChange={e=>setForm({...form,companyName:e.target.value})}/></Field>
        <Field label="Business phone"><input className="input" value={form.phone??''} onChange={e=>setForm({...form,phone:e.target.value})}/></Field>
        <Field label="Website URL"><input className="input" value={form.websiteUrl??''} onChange={e=>setForm({...form,websiteUrl:e.target.value})}/></Field>
        <Field label="Business email"><input className="input" value={form.email??''} onChange={e=>setForm({...form,email:e.target.value})}/></Field>
        <Field label="Tax ID"><input className="input" value={form.taxId??''} onChange={e=>setForm({...form,taxId:e.target.value})}/></Field>
        <Field label="Logo URL (shown on invoices)"><input className="input" value={form.logoUrl??''} onChange={e=>setForm({...form,logoUrl:e.target.value})}/></Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Address 1"><input className="input" value={form.address1??''} onChange={e=>setForm({...form,address1:e.target.value})}/></Field>
        <Field label="Address 2"><input className="input" value={form.address2??''} onChange={e=>setForm({...form,address2:e.target.value})}/></Field>
        <Field label="City"><input className="input" value={form.city??''} onChange={e=>setForm({...form,city:e.target.value})}/></Field>
        <Field label="State/Province"><input className="input" value={form.state??''} onChange={e=>setForm({...form,state:e.target.value})}/></Field>
        <Field label="Postal Code"><input className="input" value={form.postal??''} onChange={e=>setForm({...form,postal:e.target.value})}/></Field>
        <Field label="Country"><input className="input" value={form.country??'US'} onChange={e=>setForm({...form,country:e.target.value})}/></Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Terms & Conditions (text)">
          <textarea className="textarea" rows={5} value={form.termsText??''} onChange={e=>setForm({...form,termsText:e.target.value})}/>
        </Field>
        <Field label="Refund Policy (text)">
          <textarea className="textarea" rows={5} value={form.refundPolicyText??''} onChange={e=>setForm({...form,refundPolicyText:e.target.value})}/>
        </Field>
        <Field label="Privacy Policy (text)">
          <textarea className="textarea" rows={5} value={form.privacyPolicyText??''} onChange={e=>setForm({...form,privacyPolicyText:e.target.value})}/>
        </Field>
      </div>

      <div className="flex justify-end">
        <Btn kind="primary" onClick={save}>Save</Btn>
      </div>
    </Card>
  );
}

/* -------------------- Fees -------------------- */
function FeeSettings(){
  const { data, mutate } = useSWR<{plans: any[]}>('/settings/fee-plans', apiGet);
  const [msg,setMsg] = useState<string|null>(null);

  const [newPlan, setNewPlan] = useState<{name:string; mode:'none'|'convenience'|'service'; flat:string; percent:string; isDefault:boolean}>({
    name: '',
    mode: 'none',
    flat: '',
    percent: '',
    isDefault: false,
  });

  async function addPlan(){
    setMsg(null);
    try {
      const body:any = { name: newPlan.name || 'New Plan', mode: newPlan.mode, isDefault: newPlan.isDefault };
      if (newPlan.mode === 'convenience') body.convenienceFeeCents = Math.round((parseFloat(newPlan.flat || '0')||0)*100);
      if (newPlan.mode === 'service') body.serviceFeeBps = Math.round((parseFloat(newPlan.percent || '0')||0)*100);
      await apiPost('/settings/fee-plans', body);
      setNewPlan({ name:'', mode:'none', flat:'', percent:'', isDefault:false });
      await mutate();
    } catch(e:any){ setMsg(`Error: ${e.message}`); }
  }

  async function setDefault(id:string){
    await apiPost(`/settings/fee-plans/${id}/default`, {});
    await mutate();
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="section-title">Add Fee Plan</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="Name">
            <input className="input" value={newPlan.name} onChange={e=>setNewPlan({...newPlan, name: e.target.value})}/>
          </Field>
          <Field label="Type">
            <select className="select" value={newPlan.mode as any} onChange={e=>setNewPlan({...newPlan, mode: e.target.value as any})}>
              <option value="none">None</option>
              <option value="convenience">Convenience Fee ($)</option>
              <option value="service">Service Fee (%)</option>
            </select>
          </Field>
          {newPlan.mode==='convenience' && (
            <Field label="Flat amount (USD)">
              <input
                className="input"
                inputMode="decimal"
                placeholder="e.g. 1.99"
                value={newPlan.flat}
                onChange={e=>setNewPlan({...newPlan, flat: e.target.value})}
              />
            </Field>
          )}
          {newPlan.mode==='service' && (
            <Field label="Percent (%)">
              <input
                className="input"
                inputMode="decimal"
                placeholder="e.g. 2.50"
                value={newPlan.percent}
                onChange={e=>setNewPlan({...newPlan, percent: e.target.value})}
              />
            </Field>
          )}
          <label className="block text-sm">
            <span className="text-neutral-600">Default</span>
            <div className="mt-2">
              <input type="checkbox" checked={newPlan.isDefault} onChange={e=>setNewPlan({...newPlan, isDefault:e.target.checked})}/>
              <span className="ml-2 small muted">Make this the default plan</span>
            </div>
          </label>
        </div>
        <div className="flex justify-end">
          <Btn kind="primary" onClick={addPlan}>Add plan</Btn>
        </div>
        {msg && <div className="text-red-600">{msg}</div>}
      </Card>

      <Card className="p-0">
        <div className="sticky-head px-4 pt-3 pb-2 border-b">
          <div className="section-title">Existing Fee Plans</div>
        </div>
        <div className="p-4">
          <table className="table">
            <thead>
              <tr className="text-left">
                <th>Name</th><th>Type</th><th>Value</th><th>Default</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.plans ?? []).map(p=>{
                const value = p.mode==='convenience'
                  ? `$${(p.convenienceFeeCents/100).toFixed(2)}`
                  : p.mode==='service'
                    ? `${(p.serviceFeeBps/100).toFixed(2)}%`
                    : '—';
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.mode}</td>
                    <td>{value}</td>
                    <td>{p.isDefault ? 'Yes' : 'No'}</td>
                    <td>
                      {!p.isDefault && <Btn kind="ghost" className="text-xs px-2" onClick={()=>setDefault(p.id)}>Set default</Btn>}
                    </td>
                  </tr>
                );
              })}
              {!data?.plans?.length && <tr><td className="p-3 text-neutral-500" colSpan={5}>No plans yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* -------------------- Users -------------------- */
function UsersSettings(){
  const { data, mutate } = useSWR<{users:User[]}>('/users', apiGet);
  const [open,setOpen] = useState(false);
  const [msg,setMsg] = useState<string|null>(null);
  const [form,setForm] = useState<any>({ firstName:'', lastName:'', email:'', mobile:'', role:'admin' });

  async function create(){
    setMsg(null);
    try{
      await apiPost('/users', form);
      setOpen(false);
      setForm({ firstName:'', lastName:'', email:'', mobile:'', role:'admin' });
      await mutate();
    }catch(e:any){ setMsg(`Error: ${e.message}`); }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="section-title">Users</div>
          <Btn kind="primary" onClick={()=>setOpen(true)}>Invite user</Btn>
        </div>
        <div className="mt-3 overflow-auto">
          <table className="table">
            <thead>
              <tr className="text-left">
                <th>Name</th><th>Email</th><th>Mobile</th><th>Role</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map(u=>(
                <tr key={u.id}>
                  <td>{u.firstName} {u.lastName}</td>
                  <td>{u.email}</td>
                  <td>{u.mobile ?? '—'}</td>
                  <td>{u.role}</td>
                  <td>
                    <Btn kind="ghost" className="text-xs px-2"
                      onClick={async()=>{ await apiPost(`/users/${u.id}/resend-password`,{}); alert('Password email sent (stub)'); }}>
                      Resend Password
                    </Btn>
                  </td>
                </tr>
              ))}
              {!data?.users?.length && <tr><td className="p-3 text-neutral-500" colSpan={5}>No users yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={()=>setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-[460px] card overflow-auto">
            <div className="sticky top-0 bg-white/90 border-b p-4 flex items-center justify-between">
              <div className="font-semibold">Invite user</div>
              <Btn kind="ghost" onClick={()=>setOpen(false)}>Close</Btn>
            </div>
            <div className="p-4 space-y-3 text-sm">
              {['firstName','lastName','email','mobile'].map(k=>(
                <label key={k} className="block">
                  <span className="text-neutral-600 capitalize">{k}</span>
                  <input className="input mt-1" value={form[k]??''} onChange={e=>setForm({...form,[k]:e.target.value})}/>
                </label>
              ))}

              <label className="block">
                <span className="text-neutral-600">Role</span>
                <select className="select mt-1" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
                  <option value="admin">Admin (full access)</option>
                </select>
              </label>

              {msg && <div className="text-red-600">{msg}</div>}
              <div className="flex gap-2 pt-2">
                <Btn kind="primary" onClick={create}>Invite</Btn>
                <Btn kind="ghost" onClick={()=>setOpen(false)}>Cancel</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------- Tax -------------------- */
function TaxSettings(){
  const { data, mutate } = useSWR<{rates:any[]}>('/settings/tax-rates', apiGet);
  const [msg,setMsg] = useState<string|null>(null);
  const [form,setForm] = useState({ name:'', percent:'', isDefault:false });

  async function add(){
    setMsg(null);
    try{
      const rateBps = Math.round((parseFloat(form.percent || '0')||0) * 100);
      await apiPost('/settings/tax-rates', { name: form.name || 'Sales Tax', rateBps, isDefault: form.isDefault });
      setForm({ name:'', percent:'', isDefault:false });
      await mutate();
    }catch(e:any){ setMsg(`Error: ${e.message}`); }
  }

  async function makeDefault(id:string){
    await apiPost(`/settings/tax-rates/${id}/default`,{});
    await mutate();
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="section-title">Add Tax Rate</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Name">
            <input className="input" value={form.name} onChange={e=>setForm({...form, name:e.target.value})}/>
          </Field>
          <Field label="Percent (%)">
            <input className="input" inputMode="decimal" placeholder="e.g. 6.50"
              value={form.percent} onChange={e=>setForm({...form, percent:e.target.value})}/>
          </Field>
          <label className="block text-sm">
            <span className="text-neutral-600">Default</span>
            <div className="mt-2">
              <input type="checkbox" checked={form.isDefault} onChange={e=>setForm({...form, isDefault:e.target.checked})}/>
              <span className="ml-2 small muted">Make default</span>
            </div>
          </label>
        </div>
        <div className="flex justify-end">
          <Btn kind="primary" onClick={add}>Add</Btn>
        </div>
        {msg && <div className="text-red-600">{msg}</div>}
      </Card>

      <Card className="p-0">
        <div className="sticky-head px-4 pt-3 pb-2 border-b">
          <div className="section-title">Existing Tax Rates</div>
        </div>
        <div className="p-4">
          <table className="table">
            <thead><tr className="text-left"><th>Name</th><th>Rate</th><th>Default</th><th>Actions</th></tr></thead>
            <tbody>
              {(data?.rates ?? []).map(r=>(
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{(r.rateBps/100).toFixed(2)}%</td>
                  <td>{r.isDefault ? 'Yes' : 'No'}</td>
                  <td>{!r.isDefault && <Btn kind="ghost" className="text-xs px-2" onClick={()=>makeDefault(r.id)}>Set default</Btn>}</td>
                </tr>
              ))}
              {!data?.rates?.length && <tr><td className="p-3 text-neutral-500" colSpan={4}>No tax rates</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* -------------------- Shared Field -------------------- */
function Field({label, children}:{label:string; children:any}){
  return (
    <label className="block text-sm">
      <span className="text-neutral-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}