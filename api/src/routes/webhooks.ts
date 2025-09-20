import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../db.js';
import { sha256hex, hmacHexSHA512 } from '../util/hash.js';

export async function webhooksRoutes(app: FastifyInstance) {
  // Plaid webhook (signature verification varies by product; stubbed here)
  app.post('/webhooks/plaid', async (req, reply) => {
    const raw = JSON.stringify(req.body ?? {});
    // TODO: verify Plaid signature header when enabled
    const extId = req.headers['x-plaid-event-id']?.toString() ?? `plaid-${sha256hex(raw).slice(0,12)}`;
    await ingestEvent('plaid', 'TRANSFER_EVENTS_UPDATE', extId, raw);
    // TODO: project event to Payment status (settled/returned) via ext API sync
    return reply.code(202).send({ ok: true });
  });

  // NMI webhook
  app.post('/webhooks/nmi', async (req, reply) => {
    const raw = JSON.stringify(req.body ?? {});
    // Example HMAC header X-NMI-Signature: hmac_sha256(secret, nonce + "." + raw)
    // TODO: implement real verify; nonce = req.headers['x-nmi-nonce']
    const extId = req.headers['x-nmi-event-id']?.toString() ?? `nmi-${sha256hex(raw).slice(0,12)}`;
    await ingestEvent('nmi', 'transaction_update', extId, raw);
    return reply.code(202).send({ ok: true });
  });

  // Authorize.Net webhook
  app.post('/webhooks/authorize-net', async (req, reply) => {
    const raw = JSON.stringify(req.body ?? {});
    const signatureKeyHex = process.env.AUTHNET_SIGNATURE_KEY_HEX || '';
    const signatureHeader = req.headers['x-anet-signature']?.toString() || '';
    // Expected: "sha512=" + hmacHex
    // Validate if configured; otherwise accept in dev
    if (signatureKeyHex && signatureHeader.startsWith('sha512=')) {
      const calc = hmacHexSHA512(signatureKeyHex, raw);
      if (!crypto.timingSafeEqual(Buffer.from(signatureHeader.split('=')[1], 'hex'), Buffer.from(calc, 'hex'))) {
        return reply.code(401).send({ error: 'invalid_signature' });
      }
    }
    const extId = `anet-${sha256hex(raw).slice(0,12)}`;
    await ingestEvent('authorize_net', 'event', extId, raw);
    return reply.code(202).send({ ok: true });
  });
}

async function ingestEvent(provider: string, eventType: string, externalId: string, raw: string) {
  const payloadHash = sha256hex(raw);
  try {
    await prisma.webhookEvent.create({ data: { provider, eventType, externalId, payloadHash } });
  } catch (e) {
    // unique violation -> already processed
  }
}
