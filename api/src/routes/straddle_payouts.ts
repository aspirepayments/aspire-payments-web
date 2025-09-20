// api/src/routes/straddle_payouts.ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

const STRADDLE_BASE = process.env.STRADDLE_API_BASE!;
const STRADDLE_KEY  = process.env.STRADDLE_API_KEY!;

/** Minimal Straddle POST with embedded merchant scoping */
async function straddlePost(path: string, body: any, embeddedAccountId: string) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${STRADDLE_KEY}`,
    'Content-Type': 'application/json',
    'Straddle-Account-Id': embeddedAccountId, // operate on behalf of that embedded merchant
  };
  const res  = await fetch(`${STRADDLE_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Straddle ${path} ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

/** yyyy-mm-dd (today) */
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Get client IP (trust X-Forwarded-For in dev; fallback to request.ip or a safe public IP) */
function getClientIp(req: any): string {
  const xfwd = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  let ip = xfwd || req.ip || '';
  if (!ip || ip === '::1' || ip.startsWith('127.')) ip = '1.1.1.1';
  return ip;
}

/**
 * POST /v1/straddle/payouts
 * Body:
 *   {
 *     merchantId: string,
 *     embeddedAccountId: string,   // required
 *     paykey: string,              // destination bank (paykey)
 *     amount: number,              // cents
 *     currency?: string,           // default 'USD'
 *     description?: string,
 *     externalId?: string,         // your id
 *     rail?: 'rtp'|'ach'           // default 'rtp' for this spike
 *   }
 */
export async function straddlePayoutsRoutes(app: FastifyInstance) {
  app.post('/straddle/payouts', async (req, reply) => {
    try {
      const b = req.body as {
        merchantId: string;
        embeddedAccountId: string;
        paykey: string;
        amount: number;
        currency?: string;
        description?: string;
        externalId?: string;
        rail?: string;
      };

      if (!b?.merchantId || !b?.embeddedAccountId || !b?.paykey || !b?.amount) {
        return reply.code(400).send({ error: 'missing_fields' });
      }
      if (b.amount <= 0) return reply.code(400).send({ error: 'invalid_amount' });

      const ip = getClientIp(req);
      const payment_date = todayISO();             // must be today or later
      const rail = (b.rail || 'rtp');

      const body = {
        paykey: b.paykey,
        amount: b.amount,
        currency: b.currency || 'USD',
        description: b.description || 'RTP payout',
        external_id: b.externalId || `payout_${Date.now()}`,
        rail,
        payment_date,
        device: { ip_address: ip },
        // Optional sandbox knob (only if your tenant supports it)
        // config: { sandbox_outcome: 'standard' }
      };

      // NOTE: Adjust path if your OpenAPI shows a different payouts route
      const created = await straddlePost('/v1/payouts', body, b.embeddedAccountId);

      const payoutId =
        (created && created.id) ||
        (created && created.data && created.data.id);

      if (!payoutId) {
        throw new Error(`Create Payout returned unexpected body: ${JSON.stringify(created)}`);
      }

      return reply.code(201).send({ payout_id: payoutId, payout: created });
    } catch (err: any) {
      const msg = String(err?.message || '');
      req.log.error({ err }, 'straddle payout failed');
      if (msg.includes(' 422 ')) return reply.code(422).send({ error: 'validation_error', message: msg });
      if (msg.includes(' 403 ')) return reply.code(403).send({ error: 'forbidden', message: msg });
      return reply.code(500).send({ error: 'server_error', message: msg });
    }
  });
}