import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { z } from 'zod';

export async function merchantsRoutes(app: FastifyInstance) {
  const ConnectSchema = z.object({
    apiKey: z.string().min(10) // NMI 'security_key'
  });

  // Connect NMI to a merchant (store creds)
  app.post('/merchants/:id/gateways/nmi/connect', async (req, reply) => {
    const merchantId = (req.params as any).id as string;
    const { apiKey } = ConnectSchema.parse(req.body);

    // Ensure merchant exists (demo upsert)
    await prisma.merchant.upsert({
      where: { id: merchantId },
      update: {},
      create: { id: merchantId, name: merchantId === 'demo_merchant' ? 'Demo Merchant' : merchantId }
    });

    await prisma.merchantGateway.upsert({
      where: { merchantId_type: { merchantId, type: 'nmi' } },
      create: { merchantId, type: 'nmi', apiKey },
      update: { apiKey }
    });

    return reply.code(201).send({ ok: true });
  });
}
