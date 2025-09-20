import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { z } from 'zod';

const CreateItem = z.object({
  merchantId: z.string().default('demo_merchant'),
  name: z.string().min(1),
  description: z.string().optional(),
  unitPrice: z.number().int().min(0) // cents
});

export async function itemsRoutes(app: FastifyInstance) {
  app.get('/items', async (req, reply) => {
    const merchantId = (req.query as any)?.merchantId ?? 'demo_merchant';
    const items = await prisma.item.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: 500
    });
    return { items };
  });

  app.post('/items', async (req, reply) => {
    const body = CreateItem.parse(req.body);
    await prisma.merchant.upsert({
      where: { id: body.merchantId },
      update: {},
      create: { id: body.merchantId, name: 'Demo Merchant' }
    });
    const item = await prisma.item.create({ data: body });
    return reply.code(201).send({ item });
  });
}
