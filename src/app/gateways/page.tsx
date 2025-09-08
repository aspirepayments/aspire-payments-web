'use client';
import { useState } from 'react';
import { apiPost } from '@/lib/api';
import { Card, Btn } from '@/components/Ui';

type Gw = 'nmi'|'authorize_net';

export default function GatewaysPage(){
  const [merchantId, setMerchantId] = useState('demo_merchant');
  const [gw, setGw] = useState<Gw>('nmi');

  // NMI
  const [nmiKey, setNmiKey] = useState('');

  // Authorize.Net
  const [anetLogin, setAnetLogin] = useState('');
  const [anetSig, setAnetSig] = useState('');

  const [msg, setMsg] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);

  async function save(){
    setMsg(null); setLoading(true);
    try{
      if (gw==='nmi'){
        await apiPost(`/merchants/${merchantId}/gateways/nmi/connect`, { apiKey: nmiKey });
      } else {
        await apiPost(`/merchants/${merchantId}/gateways/authorize-net/connect`, {
          apiLoginId: anetLogin,
          signatureKeyHex: anetSig
        });
      }
      setMsg('Saved ✓');
    }catch(e:any){ setMsg(`Error: ${e.message}`); }
    finally{ setLoading(false); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Payment Gateways</h1>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block text-sm">
            <span className="text-neutral-600">Merchant ID</span>
            <input className="input mt-1" value={merchantId} onChange={e=>setMerchantId(e.target.value)}/>
          </label>

        <label className="block text-sm">
            <span className="text-neutral-600">Gateway</span>
            <select className="select mt-1" value={gw} onChange={e=>setGw(e.target.value as Gw)}>
              <option value="nmi">NMI</option>
              <option value="authorize_net">Authorize.Net</option>
            </select>
          </label>
        </div>

        {gw==='nmi' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-neutral-600">NMI security_key</span>
              <input className="input mt-1 font-mono" value={nmiKey} onChange={e=>setNmiKey(e.target.value)} placeholder="sk_live_..."/>
            </label>
          </div>
        )}

        {gw==='authorize_net' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-neutral-600">API Login ID</span>
              <input className="input mt-1" value={anetLogin} onChange={e=>setAnetLogin(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="text-neutral-600">Signature Key (hex)</span>
              <input className="input mt-1 font-mono" value={anetSig} onChange={e=>setAnetSig(e.target.value)} placeholder="hex string" />
            </label>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Btn kind="primary" onClick={save} disabled={loading}>{loading?'Saving…':'Save'}</Btn>
          {msg && <div className="small">{msg}</div>}
        </div>
      </Card>
    </div>
  );
}
