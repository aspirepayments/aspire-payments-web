'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000/v1';

/** Load @straddleio/bridge-js and return the object with init/show methods */
async function loadBridgeClient(): Promise<any> {
  const mod: any = await import('@straddleio/bridge-js');
  const sb = mod?.straddleBridge ?? mod?.default?.straddleBridge ?? mod?.default ?? mod;
  console.log(
    '[Bridge] module keys:', Object.keys(mod ?? {}),
    'default type:', typeof mod?.default,
    'straddleBridge type:', typeof (mod?.straddleBridge ?? mod?.default?.straddleBridge),
    'straddleBridge keys:',
    (mod?.straddleBridge && typeof mod.straddleBridge === 'object') ? Object.keys(mod.straddleBridge) : '(n/a)'
  );
  return sb;
}

/** Open Bridge with the session token, resolve with paykey */
async function openBridgeAndGetPaykey(bridgeToken: string): Promise<string> {
  const sb = await loadBridgeClient();

  // Prefer init + show pattern if available
  const hasInit = sb && typeof sb.init === 'function';
  const hasShow = sb && typeof sb.show === 'function';

  if (!hasInit || !hasShow) {
    throw new Error('Bridge client does not expose init/show; see console for exported methods');
  }

  // We’ll try to capture paykey two ways:
  //  1) if the SDK accepts onSuccess/onExit in init options
  //  2) if the SDK posts a message to window (postMessage)
  return new Promise(async (resolve, reject) => {
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      window.removeEventListener('message', onMessage);
    };

    // 2) Fallback: listen for a postMessage event from the Bridge iframe
    const onMessage = (ev: MessageEvent) => {
      // relax origin check in sandbox if docs don’t provide a fixed origin yet;
      // ideally restrict to sb.origin when available.
      try {
        const data = ev.data;
        if (!data) return;
        // Look for common payload shapes
        const pk =
          data?.paykey ||
          data?.data?.paykey ||
          (data?.type && /bridge.*success/i.test(String(data.type)) && data?.payload?.paykey);
        if (pk) {
          cleanup();
          resolve(pk);
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('message', onMessage);

    // 1) Primary path: callbacks via init options
    const options: any = {
      token: bridgeToken,            // many SDKs use "token"
      bridge_token: bridgeToken,     // or "bridge_token"
      mode: 'sandbox',
      onSuccess: (result: any) => {
        const pk = result?.paykey || result?.data?.paykey || result?.payload?.paykey;
        if (pk) {
          cleanup();
          resolve(pk);
        } else {
          console.log('[Bridge] onSuccess (no paykey):', result);
          // leave listener active to catch postMessage fallback if any
        }
      },
      onExit: (err: any) => {
        cleanup();
        reject(err || new Error('Bridge closed by user'));
      },
      onClose: (err: any) => {
        cleanup();
        reject(err || new Error('Bridge closed'));
      },
      onLoadError: (err: any) => {
        cleanup();
        reject(err || new Error('Bridge load error'));
      }
    };

    try {
      // Initialize and show widget
      await sb.init(options);
      // Some SDKs need a short tick before show
      setTimeout(() => {
        try { sb.show(); } catch (e) { cleanup(); reject(e); }
      }, 0);
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

export default function LinkBankPage() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  const customerId = params.id;

  const embeddedAccountId  = sp.get('acct') || '';
  const straddleCustomerId = sp.get('scus') || '';

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  async function startLink() {
    if (inFlight.current) return;
    inFlight.current = true;
    setMsg(null);
    setLoading(true);
    try {
      // 1) Create Bridge session (server → Straddle /v1/bridge/initialize)
      const sres = await fetch(`${API_BASE}/straddle/bridge/session`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ embeddedAccountId, straddleCustomerId })
      });
      if (!sres.ok) throw new Error(await sres.text());
      const session = await sres.json();

      // Accept token in common shapes
      const bridgeToken =
        session?.bridge_token ||
        session?.data?.bridge_token ||
        session?.token;
      if (!bridgeToken) throw new Error('No bridge_token returned from session: ' + JSON.stringify(session));

      // 2) Open Bridge → get a real paykey
      const paykey = await openBridgeAndGetPaykey(bridgeToken);

      // 3) Save the paykey
      const pres = await fetch(`${API_BASE}/straddle/paykeys`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          merchantId: 'demo_merchant',
          customerId,
          paykey,
          bankName: 'Linked via Bridge',
          mask: '****0000',
          isDefault: true
        })
      });
      if (!pres.ok) throw new Error(await pres.text());
      setMsg('Bank linked & paykey saved. You can now run a charge.');
    } catch (e: any) {
      setMsg(`Link failed: ${e?.message || e}`);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }

  const disabled = loading || !embeddedAccountId || !straddleCustomerId;

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-xl font-semibold">Link bank (Bridge)</h1>
      <div className="text-sm text-neutral-600">
        acct: <code>{embeddedAccountId || '—'}</code><br/>
        customer: <code>{straddleCustomerId || '—'}</code>
      </div>

      <button
        onClick={startLink}
        disabled={disabled}
        className="rounded bg-black text-white px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {loading ? 'Opening Bridge…' : 'Link bank'}
      </button>

      {msg && <div className="text-sm">{msg}</div>}

      <p className="text-xs text-neutral-500">
        After linking, this page will save your paykey with the API. Then you can charge it.
      </p>
    </div>
  );
}