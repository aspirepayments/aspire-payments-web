// api/src/routes/settings.ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

/**
 * Ensure we always have a merchant in dev and return it.
 * This prevents FK errors (P2003) when creating related rows. 
 */
async function getOrCreateMerchant() {
  let merchant = await prisma.merchant.findFirst();
  if (!merchant) {
    merchant = await prisma.merchant.create({ data: { name: 'Aspire Payments (DEV)' } });
  }
  return merchant;
}

export async function settingsRoutes(app: FastifyInstance) {
  // ---------- General ----------
  app.get('/settings/general', async () => {
    const merchant = await getOrCreateMerchant();
    const profile = await prisma.merchantProfile.findUnique({
      where: { merchantId: merchant.id }
    });
    return { profile };
  });

  app.patch('/settings/general', async (req) => {
    const body = (req.body as any) ?? {};
    const merchant = await getOrCreateMerchant();

    const updated = await prisma.merchantProfile.upsert({
      where: { merchantId: merchant.id },
      update: body,
      create: { merchantId: merchant.id, ...body }
    });
    return { profile: updated };
  });

  // ---------- Fee Plans ----------
  app.get('/settings/fee-plans', async () => {
    const merchant = await getOrCreateMerchant();
    const plans = await prisma.feePlan.findMany({
      where: { merchantId: merchant.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });
    return { plans };
  });

  app.post('/settings/fee-plans', async (req, reply) => {
    const b = (req.body as any) ?? {};
    const merchant = await getOrCreateMerchant();

    const plan = await prisma.feePlan.create({
      data: {
        merchantId: merchant.id,
        name: b.name ?? 'New Plan',
        mode: b.mode ?? 'none', // 'none' | 'convenience' | 'service'
        convenienceFeeCents: Math.max(0, Math.trunc(Number(b.convenienceFeeCents ?? 0))),
        serviceFeeBps:       Math.max(0, Math.trunc(Number(b.serviceFeeBps ?? 0))),
        isDefault: !!b.isDefault
      }
    });

    if (plan.isDefault) {
      await prisma.feePlan.updateMany({
        where: { merchantId: merchant.id, id: { not: plan.id } },
        data: { isDefault: false }
      });
    }
    return reply.code(201).send({ plan });
  });

  app.patch('/settings/fee-plans/:id', async (req) => {
    const id = (req.params as any).id as string;
    const b = (req.body as any) ?? {};
    const merchant = await getOrCreateMerchant();

    const updated = await prisma.feePlan.update({
      where: { id },
      data: {
        name: b.name,
        mode: b.mode,
        convenienceFeeCents: b.convenienceFeeCents != null
          ? Math.max(0, Math.trunc(Number(b.convenienceFeeCents)))
          : undefined,
        serviceFeeBps: b.serviceFeeBps != null
          ? Math.max(0, Math.trunc(Number(b.serviceFeeBps)))
          : undefined,
        isDefault: b.isDefault
      }
    });

    if (updated.isDefault) {
      await prisma.feePlan.updateMany({
        where: { merchantId: merchant.id, id: { not: updated.id } },
        data: { isDefault: false }
      });
    }
    return { plan: updated };
  });

  app.post('/settings/fee-plans/:id/default', async (req) => {
    const id = (req.params as any).id as string;
    const merchant = await getOrCreateMerchant();

    await prisma.feePlan.update({ where: { id }, data: { isDefault: true } });
    await prisma.feePlan.updateMany({
      where: { merchantId: merchant.id, id: { not: id } },
      data: { isDefault: false }
    });
    return { ok: true };
  });

  // ---------- Tax Rates ----------
  app.get('/settings/tax-rates', async () => {
    const merchant = await getOrCreateMerchant();
    const rates = await prisma.taxRate.findMany({
      where: { merchantId: merchant.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });
    return { rates };
  });

  app.post('/settings/tax-rates', async (req, reply) => {
    const b = (req.body as any) ?? {};
    const merchant = await getOrCreateMerchant();

    const rate = await prisma.taxRate.create({
      data: {
        merchantId: merchant.id,
        name: b.name ?? 'Sales Tax',
        rateBps: Math.max(0, Math.trunc(Number(b.rateBps ?? 0))),
        isDefault: !!b.isDefault
      }
    });

    if (rate.isDefault) {
      await prisma.taxRate.updateMany({
        where: { merchantId: merchant.id, id: { not: rate.id } },
        data: { isDefault: false }
      });
    }
    return reply.code(201).send({ rate });
  });

  app.patch('/settings/tax-rates/:id', async (req) => {
    const id = (req.params as any).id as string;
    const b = (req.body as any) ?? {};
    const merchant = await getOrCreateMerchant();

    const rate = await prisma.taxRate.update({
      where: { id },
      data: {
        name: b.name,
        rateBps: b.rateBps != null
          ? Math.max(0, Math.trunc(Number(b.rateBps)))
          : undefined,
        isDefault: b.isDefault
      }
    });

    if (rate.isDefault) {
      await prisma.taxRate.updateMany({
        where: { merchantId: merchant.id, id: { not: rate.id } },
        data: { isDefault: false }
      });
    }
    return { rate };
  });

  app.post('/settings/tax-rates/:id/default', async (req) => {
    const id = (req.params as any).id as string;
    const merchant = await getOrCreateMerchant();

    await prisma.taxRate.update({ where: { id }, data: { isDefault: true } });
    await prisma.taxRate.updateMany({
      where: { merchantId: merchant.id, id: { not: id } },
      data: { isDefault: false }
    });
    return { ok: true };
  });
}