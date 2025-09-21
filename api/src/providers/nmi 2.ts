// NMI provider stub
export type NmiChargeInput = {
  token: string;
  amount: number;
  currency: string;
  capture?: boolean;
};

export async function nmiCharge(input: NmiChargeInput) {
  // TODO: call NMI sale
  return { transaction_id: 'nmi_tx_123', approved: true, auth_code: '12345' };
}

// api/src/providers/nmi.ts (append)

type NmiAddCustomerInput = {
  apiKey?: string;                 // NMI security_key
  payment_token: string;           // Collect.js payment_token
  billing?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    address1?: string;
    postal?: string;
  };
};

// Creates a NMI Customer Vault record using a Collect.js payment_token
export async function nmiAddCustomer(input: NmiAddCustomerInput) {
  const simulate = process.env.NMI_SIMULATE === 'true' || !input.apiKey;
  if (simulate) {
    return {
      ok: true,
      customer_vault_id: 'nmi_cust_sim_' + Math.random().toString(36).slice(2),
      raw: { simulated: true }
    };
  }

  const params: Record<string,string> = {
    security_key: input.apiKey!,
    customer_vault: 'add_customer',
    payment_token: input.payment_token
  };
  if (input.billing?.first_name) params['first_name'] = input.billing.first_name;
  if (input.billing?.last_name)  params['last_name']  = input.billing.last_name;
  if (input.billing?.address1)   params['address1']   = input.billing.address1;
  if (input.billing?.postal)     params['zip']        = input.billing.postal;
  if (input.billing?.email)      params['email']      = input.billing.email;

  const res = await fetch('https://secure.nmi.com/api/transact.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  const text = await res.text();
  const kv: Record<string,string> = {};
  text.split('&').forEach(p => { const [k,v] = p.split('='); if(k) kv[k]=decodeURIComponent(v??''); });

  // NMI returns response=1 on success, customer_vault_id=<id>
  return {
    ok: kv['response'] === '1',
    customer_vault_id: kv['customer_vault_id'],
    raw: { text, kv }
  };
}

type NmiChargeVaultInput = {
  apiKey?: string;
  customerVaultId: string;
  amount: number;                  // cents
  currency: string;                // 'USD'
  capture?: boolean;
};

function dollars(cents: number) { return (cents/100).toFixed(2); }

// Runs a sale using an existing NMI customer_vault_id
export async function nmiChargeWithVault(input: NmiChargeVaultInput) {
  const simulate = process.env.NMI_SIMULATE === 'true' || !input.apiKey;
  if (simulate) {
    return {
      approved: true,
      auth_code: 'SIM123',
      transactionid: 'nmi_sim_tx_' + Math.random().toString(36).slice(2),
      raw: { simulated: true }
    };
  }

  const params: Record<string,string> = {
    security_key: input.apiKey!,
    type: 'sale',                       // or 'auth'
    amount: dollars(input.amount),
    customer_vault_id: input.customerVaultId
  };

  const res = await fetch('https://secure.nmi.com/api/transact.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  const text = await res.text();
  const kv: Record<string,string> = {};
  text.split('&').forEach(p => { const [k,v] = p.split('='); if(k) kv[k]=decodeURIComponent(v??''); });

  return {
    approved: kv['response'] === '1',
    auth_code: kv['authcode'],
    transactionid: kv['transactionid'],
    raw: { text, kv }
  };
}