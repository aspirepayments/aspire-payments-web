// api/src/routes/straddle_payments.ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

// Use Node 18+ global fetch
const STRADDLE_BASE = process.env.STRADDLE_API_BASE!;
const STRADDLE_KEY  = process.env.STRADDLE_API_KEY!;

/** Minimal Straddle POST helper with embedded scoping */
async function straddlePost(path: string, body: any, embeddedAccountId?: string) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${STRADDLE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (embeddedAccountId) headers['Straddle-Account-Id'] = embeddedAccountId;

  const res  = await fetch(`${STRADDLE_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {})
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Straddle ${path} ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

/** yyyy-mm-dd (today, local) */
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth()+1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Prefer client IP from X-Forwarded-For, else req.ip, else a safe public IP (sandbox) */
function getClientIp(req: any): string {
  const xfwd = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  let ip = xfwd || req.ip || '';
  if (!ip || ip === '::1' || ip.startsWith('127.')) ip = '1.1.1.1';
  return ip;
}

/**
 * POST /v1/straddle/charges
 * Body:
 *   {
 *     merchantId: string,
 *     customerId: string,
 *     embeddedAccountId: string,        // required (embedded platform)
 *     amount: number,                   // in cents
 *     currency?: string,                // 'USD' default
 *     paykey?: string,                  // if omitted we use customer's default straddle bank method
 *     rail?: 'ach'|'rtp',               // 'ach' default
 *     description?: string,             // optional; default provided below
 *     externalId?: string               // optional; default generated below
 *   }
 */
export async function straddlePaymentsRoutes(app: FastifyInstance) {
  app.post('/straddle/charges', async (req, reply) => {
    try {
      const b = req.body as {
        merchantId: string;
        customerId: string;
        embeddedAccountId: string;
        amount: number;
        currency?: string;
        paykey?: string;
        rail?: string;
        description?: string;
        externalId?: string;
      };

      if (!b?.merchantId || !b?.customerId || !b?.embeddedAccountId || !b?.amount) {
        return reply.code(400).send({ error: 'missing_fields' });
      }
      if (b.amount <= 0) return reply.code(400).send({ error: 'invalid_amount' });

      // Resolve paykey: explicit or customer's default Straddle bank PM
      let paykey = b.paykey;
      if (!paykey) {
        const def = await prisma.paymentMethod.findFirst({
          where: {
            customerId: b.customerId,
            vaultProvider: 'straddle',
            type: 'bank',
            status: 'active',
            isDefault: true
          }
        });
        if (!def) return reply.code(404).send({ error: 'no_default_paykey' });
        paykey = def.providerRef;
      }

      // Required fields per Straddle: description, payment_date, consent_type, device.ip_address, external_id
      // Also set balance check via config to avoid "Unknown" validation
      const description = b.description?.trim() || 'Pay by bank charge';
      const payment_date = todayISO(); // must be today or later
      const ip = getClientIp(req);
      const external_id = b.externalId?.trim() || `order_${Date.now()}`; // unique in your system

      // Build the charge payload. Straddle docs show these exact keys on /v1/charges.  [oai_citation:1‡Straddle Docs](https://docs.straddle.io/guides/resources/sandbox-paybybank?utm_source=chatgpt.com)
      const body = {
        paykey,
        description,
        amount: b.amount,
        currency: b.currency || 'USD',
        payment_date,
        consent_type: 'internet',
        device: { ip_address: ip },
        external_id,
        // Set balance check explicitly so it isn't "Unknown"
        // (Straddle sandbox examples show config usage; 'required' triggers a check.)  [oai_citation:2‡Straddle Docs](https://docs.straddle.io/guides/resources/sandbox-paybybank?utm_source=chatgpt.com)
        config: { balance_check: 'required' },
        // Optional rail hint; Straddle may auto-route in production
        rail: (b.rail || 'ach')
      };

      // POST /v1/charges
      const created = await straddlePost('/v1/charges', body, b.embeddedAccountId);

      const chargeId: string | undefined =
        (created && (created.id as string)) ||
        (created && created.data && (created.data.id as string));

      if (!chargeId) {
        throw new Error(`Create Charge returned unexpected body: ${JSON.stringify(created)}`);
      }

      // You can also persist a Payment locally here if you want. For now, return raw.
      return reply.code(201).send({ charge_id: chargeId, charge: created });
    } catch (err: any) {
      const msg = String(err?.message || '');
      req.log.error({ err }, 'straddle charge failed');

      // Lift Straddle field-level errors for easier debugging in curl
      if (msg.includes(' 422 ')) {
        return reply.code(422).send({ error: 'validation_error', message: msg });
      }
      if (msg.includes(' 403 ')) {
        return reply.code(403).send({ error: 'forbidden', message: msg });
      }
      return reply.code(500).send({ error: 'server_error', message: msg });
    }
  });
}