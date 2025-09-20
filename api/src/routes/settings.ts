import type{ FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

const DEMO_MERCHANT = 'demo_merchant';

export async function settingsRoutes(app: FastifyInstance) {
  // ---------- General ----------
  app.get('/settings/general', async () => {
    const profile = await prisma.merchantProfile.findUnique({ where: { merchantId: DEMO_MERCHANT } });
    return { profile };
  });

  app.patch('/settings/general', async (req) => {
    const body = (req.body as any) ?? {};
    await prisma.merchant.upsert({
      where: { id: DEMO_MERCHANT },
      update: {},
      create: { id: DEMO_MERCHANT, name: 'Demo Merchant' }
    });
    const updated = await prisma.merchantProfile.upsert({
      where: { merchantId: DEMO_MERCHANT },
      update: body,
      create: { merchantId: DEMO_MERCHANT, ...body }
    });
    return { profile: updated };
  });

  // ---------- Fee Plans ----------
  app.get('/settings/fee-plans', async () => {
    const plans = await prisma.feePlan.findMany({
      where: { merchantId: DEMO_MERCHANT },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });
    return { plans };
  });

  app.post('/settings/fee-plans', async (req, reply) => {
    const b = (req.body as any) ?? {};
    const plan = await prisma.feePlan.create({
      data: {
        merchantId: DEMO_MERCHANT,
        name: b.name ?? 'New Plan',
        mode: b.mode ?? 'none',
        convenienceFeeCents: Math.max(0, Number(b.convenienceFeeCents ?? 0) | 0),
        serviceFeeBps: Math.max(0, Number(b.serviceFeeBps ?? 0) | 0),
        isDefault: !!b.isDefault
      }
    });
    if (plan.isDefault) {
      await prisma.feePlan.updateMany({
        where: { merchantId: DEMO_MERCHANT, id: { not: plan.id } },
        data: { isDefault: false }
      });
    }
    return reply.code(201).send({ plan });
  });

  app.patch('/settings/fee-plans/:id', async (req) => {
    const id = (req.params as any).id as string;
    const b = (req.body as any) ?? {};
    const updated = await prisma.feePlan.update({
      where: { id },
      data: {
        name: b.name,
        mode: b.mode,
        convenienceFeeCents: b.convenienceFeeCents != null ? Math.max(0, Number(b.convenienceFeeCents) | 0) : undefined,
        serviceFeeBps: b.serviceFeeBps != null ? Math.max(0, Number(b.serviceFeeBps) | 0) : undefined,
        isDefault: b.isDefault
      }
    });
    if (updated.isDefault) {
      await prisma.feePlan.updateMany({
        where: { merchantId: DEMO_MERCHANT, id: { not: updated.id } },
        data: { isDefault: false }
      });
    }
    return { plan: updated };
  });

  app.post('/settings/fee-plans/:id/default', async (req) => {
    const id = (req.params as any).id as string;
    await prisma.feePlan.update({ where: { id }, data: { isDefault: true } });
    await prisma.feePlan.updateMany({ where: { merchantId: DEMO_MERCHANT, id: { not: id } }, data: { isDefault: false } });
    return { ok: true };
  });

  // ---------- Tax Rates ----------
  app.get('/settings/tax-rates', async () => {
    const rates = await prisma.taxRate.findMany({
      where: { merchantId: DEMO_MERCHANT },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });
    return { rates };
  });

  app.post('/settings/tax-rates', async (req, reply) => {
    const b = (req.body as any) ?? {};
    const rate = await prisma.taxRate.create({
      data: {
        merchantId: DEMO_MERCHANT,
        name: b.name ?? 'Sales Tax',
        rateBps: Math.max(0, Number(b.rateBps ?? 0) | 0),
        isDefault: !!b.isDefault
      }
    });
    if (rate.isDefault) {
      await prisma.taxRate.updateMany({
        where: { merchantId: DEMO_MERCHANT, id: { not: rate.id } },
        data: { isDefault: false }
      });
    }
    return reply.code(201).send({ rate });
  });

  app.patch('/settings/tax-rates/:id', async (req) => {
    const id = (req.params as any).id as string;
    const b = (req.body as any) ?? {};
    const rate = await prisma.taxRate.update({
      where: { id },
      data: {
        name: b.name,
        rateBps: b.rateBps != null ? Math.max(0, Number(b.rateBps) | 0) : undefined,
        isDefault: b.isDefault
      }
    });
    if (rate.isDefault) {
      await prisma.taxRate.updateMany({
        where: { merchantId: DEMO_MERCHANT, id: { not: rate.id } },
        data: { isDefault: false }
      });
    }
    return { rate };
  });

  app.post('/settings/tax-rates/:id/default', async (req) => {
    const id = (req.params as any).id as string;
    await prisma.taxRate.update({ where: { id }, data: { isDefault: true } });
    await prisma.taxRate.updateMany({ where: { merchantId: DEMO_MERCHANT, id: { not: id } }, data: { isDefault: false } });
    return { ok: true };
  });
}
