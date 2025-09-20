import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { z } from 'zod';
import { nmiAddCustomer } from '../providers/nmi.js';

const CreatePM = z.object({
  customerId: z.string(),
  type: z.enum(['card','bank']),
  provider: z.enum(['nmi','plaid','authorize_net']).default('nmi'),
  payment_token: z.string().optional(),   // Collect.js token for NMI
  providerRef: z.string().optional(),     // if you already have a vault ref
  brand: z.string().optional(),
  last4: z.string().optional(),
  expMonth: z.number().int().optional(),
  expYear: z.number().int().optional(),
  bankName: z.string().optional(),
  mask: z.string().optional(),
  billing: z.object({
    first_name: z.string().optional(),
    last_name:  z.string().optional(),
    email:      z.string().optional(),
    address1:   z.string().optional(),
    postal:     z.string().optional()
  }).optional(),
  makeDefault: z.boolean().optional()
});

export default async function paymentMethodsRoutes(app: FastifyInstance) {
  // List payment methods for a customer
  app.get('/customers/:id/payment-methods', async (req) => {
    const customerId = (req.params as any).id as string;
    const methods = await prisma.paymentMethod.findMany({
      where: { customerId, status: 'active' },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });
    return { payment_methods: methods };
  });

  // Create (vault if needed)
  app.post('/payment-methods', async (req, reply) => {
    const b = CreatePM.parse(req.body);

    // Ensure customer exists
    const customer = await prisma.customer.findUnique({ where: { id: b.customerId } });
    if (!customer) return reply.code(404).send({ error: 'customer_not_found' });

    let providerRef = b.providerRef ?? '';

    if (b.provider === 'nmi') {
      const gw = await prisma.merchantGateway.findUnique({
        where: { merchantId_type: { merchantId: customer.merchantId, type: 'nmi' } }
      });
      const apiKey = gw?.apiKey || process.env.NMI_SECURITY_KEY || undefined;

      if (b.payment_token) {
        const r = await nmiAddCustomer({
          apiKey,
          payment_token: b.payment_token,
          billing: b.billing
        });
        if (!(r as any).ok || !(r as any).customer_vault_id) {
          return reply.code(502).send({ error: 'nmi_vault_error', detail: (r as any).raw });
        }
        providerRef = (r as any).customer_vault_id as string;
      } else if (!providerRef) {
        return reply.code(400).send({ error: 'missing_payment_token' });
      }
    }

    if (b.makeDefault) {
      await prisma.paymentMethod.updateMany({
        where: { customerId: b.customerId, isDefault: true },
        data: { isDefault: false }
      });
    }

    // If your schema uses `provider` instead of `vaultProvider`, change this field accordingly
    const pm = await prisma.paymentMethod.create({
      data: {
        merchantId: customer.merchantId,
        customerId: b.customerId,
        type: b.type,
        vaultProvider: b.provider,
        providerRef,
        brand: b.brand,
        last4: b.last4,
        expMonth: b.expMonth,
        expYear: b.expYear,
        bankName: b.bankName,
        mask: b.mask,
        isDefault: !!b.makeDefault
      }
    });

    return reply.code(201).send({ payment_method: pm });
  });

  // Set default
  app.post('/payment-methods/:id/default', async (req, reply) => {
    const id = (req.params as any).id as string;
    const pm = await prisma.paymentMethod.findUnique({ where: { id } });
    if (!pm) return reply.code(404).send({ error: 'not_found' });

    await prisma.$transaction([
      prisma.paymentMethod.updateMany({ where: { customerId: pm.customerId, isDefault: true }, data: { isDefault: false } }),
      prisma.paymentMethod.update({ where: { id }, data: { isDefault: true } })
    ]);

    return { ok: true };
  });

  // Soft delete
  app.delete('/payment-methods/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const pm = await prisma.paymentMethod.findUnique({ where: { id } });
    if (!pm) return reply.code(404).send({ error: 'not_found' });

    await prisma.paymentMethod.update({ where: { id }, data: { status: 'inactive', isDefault: false } });
    return { ok: true };
  });
}
