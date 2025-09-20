// api/src/routes/straddle_webhooks.ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

function toDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

/**
 * Straddle webhook receiver (secured with shared secret)
 * - Requires X-Webhook-Secret to match process.env.WEBHOOK_SECRET
 * - Handles "charge.event.v1" lifecycle updates
 * - Upserts local Payment by providerRef (Straddle charge id)
 */
export async function straddleWebhooksRoutes(app: FastifyInstance) {
  app.post('/webhooks/straddle', async (req, reply) => {
    try {
      // 1) Authenticate
      const expected = process.env.WEBHOOK_SECRET || '';
      const provided = (req.headers['x-webhook-secret'] as string | undefined) || '';
      if (!expected || provided !== expected) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

      // 2) Parse event
      const evt = req.body as any;
      const eventType: string =
        evt?.event_type || evt?.type || evt?.data?.type || 'unknown';
      const data = evt?.data || {};
      const chargeId: string | undefined = data?.id;
      const status: string = String(data?.status || '').toLowerCase();
      const statusChangedAt = toDate(data?.status_details?.changed_at) || new Date();
      const paymentRail = data?.payment_rail || data?.rail || 'ach';

      // (Optional) audit row – ignore duplicates
      const externalId = String(evt?.event_id ?? evt?.id ?? `${Date.now()}`);
      try {
        await prisma.webhookEvent.create({
          data: {
            provider: 'straddle',
            eventType,
            externalId,
            payloadHash: 'n/a',
            processed: false
          }
        });
      } catch {}

      // 3) Handle lifecycle
      if (eventType === 'charge.event.v1' && chargeId) {
        // Map provider status → local status
        // keep 'scheduled' as-is; map posted->captured, created->pending
        let mapped = status;
        if (status === 'created') mapped = 'pending';
        if (status === 'posted')  mapped = 'captured';

        // Prepare updates
        const update: any = {
          status: mapped,
          providerRef: chargeId,
          rail: paymentRail,
          lastEventAt: statusChangedAt
        };

        if (status === 'posted')  update.postedAt  = statusChangedAt;
        if (status === 'settled') update.settledAt = statusChangedAt;

        // ACH returns
        if (status === 'returned') {
          update.returnCode   = data?.status_details?.code   || data?.return_code || null;
          update.returnReason = data?.status_details?.message || data?.return_reason || null;
        }

        // Upsert by Straddle charge id
        await prisma.payment.upsert({
          where: { id: chargeId },
          create: {
            id: chargeId,
            merchantId: 'demo_merchant',                 // if you map evt.account_id -> merchantId, set it here
            amount: data?.amount ?? 0,
            currency: data?.currency ?? 'USD',
            method: 'bank',
            rail: paymentRail,
            provider: 'straddle',
            status: mapped,
            providerRef: chargeId,
            instrumentMask: undefined,
            postedAt:  update.postedAt  ?? undefined,
            settledAt: update.settledAt ?? undefined,
            returnCode:   update.returnCode   ?? undefined,
            returnReason: update.returnReason ?? undefined,
            lastEventAt:  statusChangedAt
          },
          update
        });
      }

      // 4) Ack quickly
      return reply.code(200).send({ ok: true });
    } catch (err: any) {
      req.log.error({ err }, 'straddle webhook failed');
      // Return 200 to avoid retries while debugging
      return reply.code(200).send({ ok: true });
    }
  });
}
