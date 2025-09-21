// api/src/routes/settings_terms.ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

/**
 * Ensure we always have a merchant in dev and return it.
 * Prevents FK (P2003) errors by guaranteeing merchantId exists.
 */
async function getOrCreateMerchant() {
  let merchant = await prisma.merchant.findFirst();
  if (!merchant) {
    merchant = await prisma.merchant.create({ data: { name: 'Aspire Payments (DEV)' } });
  }
  return merchant;
}

export async function settingsTermsRoutes(app: FastifyInstance) {
  // ---------- Payment Terms (list) ----------
  app.get('/settings/terms', async () => {
    const merchant = await getOrCreateMerchant();
    const terms = await prisma.paymentTerm.findMany({
      where: { merchantId: merchant.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, name: true, days: true, isDefault: true, createdAt: true, updatedAt: true },
    });
    return { terms };
  });

  // ---------- Payment Terms (default) ----------
  // Used by the create/edit invoice pages to preselect terms
  app.get('/settings/terms/default', async () => {
    const merchant = await getOrCreateMerchant();

    // Prefer the explicit default; if none yet, fall back to the most recently updated term (or null)
    let term =
      await prisma.paymentTerm.findFirst({
        where: { merchantId: merchant.id, isDefault: true },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, name: true, days: true, isDefault: true },
      }) ??
      await prisma.paymentTerm.findFirst({
        where: { merchantId: merchant.id },
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        select: { id: true, name: true, days: true, isDefault: true },
      });

    return { term }; // { term: {..} | null }
  });

  // ---------- Create Term ----------
  app.post('/settings/terms', async (req, reply) => {
    const b = (req.body as any) ?? {};
    const merchant = await getOrCreateMerchant();

    const days = Math.max(0, Math.trunc(Number(b.days ?? 0)));

    const term = await prisma.paymentTerm.create({
      data: {
        merchantId: merchant.id,
        name: b.name ?? 'Net 0',
        days,
        isDefault: !!b.isDefault,
      },
      select: { id: true, name: true, days: true, isDefault: true },
    });

    if (term.isDefault) {
      await prisma.paymentTerm.updateMany({
        where: { merchantId: merchant.id, id: { not: term.id } },
        data: { isDefault: false },
      });
    }

    return reply.code(201).send({ term });
  });

  // ---------- Update Term ----------
  app.patch('/settings/terms/:id', async (req) => {
    const merchant = await getOrCreateMerchant();
    const id = (req.params as any).id as string;
    const b = (req.body as any) ?? {};

    const updated = await prisma.paymentTerm.update({
      where: { id },
      data: {
        name: b.name,
        days: b.days != null ? Math.max(0, Math.trunc(Number(b.days))) : undefined,
        isDefault: b.isDefault,
      },
      select: { id: true, name: true, days: true, isDefault: true },
    });

    if (updated.isDefault) {
      await prisma.paymentTerm.updateMany({
        where: { merchantId: merchant.id, id: { not: updated.id } },
        data: { isDefault: false },
      });
    }

    return { term: updated };
  });

  // ---------- Make Default ----------
  app.post('/settings/terms/:id/default', async (req) => {
    const merchant = await getOrCreateMerchant();
    const id = (req.params as any).id as string;

    await prisma.paymentTerm.update({ where: { id }, data: { isDefault: true } });
    await prisma.paymentTerm.updateMany({
      where: { merchantId: merchant.id, id: { not: id } },
      data: { isDefault: false },
    });

    return { ok: true };
  });
}