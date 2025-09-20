// api/src/routes/straddle_paykeys.ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

/**
 * Save a Straddle paykey as a saved "bank payment method" for the customer.
 * Body: { merchantId, customerId, paykey, bankName?, mask? , isDefault? }
 *
 * We store this in PaymentMethod with vaultProvider='straddle', providerRef=<paykey>.
 */
export async function straddlePaykeysRoutes(app: FastifyInstance) {
  app.post('/straddle/paykeys', async (req, reply) => {
    try {
      const b = req.body as {
        merchantId: string;
        customerId: string;
        paykey: string;
        bankName?: string | null;
        mask?: string | null;
        isDefault?: boolean | null;
      };

      if (!b?.merchantId || !b?.customerId || !b?.paykey) {
        return reply.code(400).send({ error: 'missing_fields' });
      }

      // ensure the customer exists
      const cust = await prisma.customer.findUnique({ where: { id: b.customerId } });
      if (!cust) return reply.code(404).send({ error: 'customer_not_found' });

      // if setting default, clear other defaults
      if (b.isDefault) {
        await prisma.paymentMethod.updateMany({
          where: { customerId: b.customerId, isDefault: true },
          data: { isDefault: false }
        });
      }

      const pm = await prisma.paymentMethod.create({
        data: {
          merchantId: b.merchantId,
          customerId: b.customerId,
          type: 'bank',
          vaultProvider: 'straddle',
          providerRef: b.paykey,          // the actual paykey
          brand: 'ach',
          bankName: b.bankName ?? undefined,
          mask: b.mask ?? undefined,
          isDefault: !!b.isDefault
        }
      });

      return reply.code(201).send({ payment_method: pm });
    } catch (err: any) {
      req.log.error({ err }, 'save paykey failed');
      return reply.code(500).send({ error: 'server_error', message: err?.message || 'save_paykey_failed' });
    }
  });
}