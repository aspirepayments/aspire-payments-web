// api/src/routes/charges.ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { z } from 'zod';
import { nmiChargeWithVault } from '../providers/nmi.js';

const ChargeSaved = z.object({
  paymentMethodId: z.string(),
  amount: z.number().int().min(1),
  currency: z.string().default('USD'),
  capture: z.boolean().optional()
});

// Charge a saved PaymentMethod (NMI vault path only for now)
export async function chargesRoutes(app: FastifyInstance) {
  app.post('/charges', async (req, reply) => {
    const b = ChargeSaved.parse(req.body);

    const pm = await prisma.paymentMethod.findUnique({ where: { id: b.paymentMethodId } });
    if (!pm || pm.status !== 'active') {
      return reply.code(404).send({ error: 'pm_not_found' });
    }

    // If your schema uses `provider` instead of `vaultProvider`, change this check accordingly.
    const vaultProvider = (pm as any).vaultProvider ?? (pm as any).provider;
    if (vaultProvider !== 'nmi') {
      return reply.code(400).send({ error: 'unsupported_provider' });
    }

    // Lookup merchant's NMI security_key
    const gw = await prisma.merchantGateway.findUnique({
      where: { merchantId_type: { merchantId: pm.merchantId, type: 'nmi' } }
    });
    const apiKey = gw?.apiKey || process.env.NMI_SECURITY_KEY || undefined;

    const r = await nmiChargeWithVault({
      apiKey,
      customerVaultId: pm.providerRef,  // NMI customer_vault_id we stored earlier
      amount: b.amount,
      currency: b.currency,
      capture: b.capture
    });

    if (!r.approved) {
      return reply.code(402).send({ error: 'card_declined', detail: r.raw });
    }

    // You can also persist a Payment & Attempt here; for now, return result
    return reply.code(201).send({ ok: true, auth_code: r.auth_code, transactionid: r.transactionid });
  });
}
