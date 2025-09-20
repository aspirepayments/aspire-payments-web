import type{ FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

/**
 * Payment Terms settings API
 *   GET    /v1/settings/terms                 -> list all (default first)
 *   POST   /v1/settings/terms                 -> create { name, days, isDefault? }
 *   DELETE /v1/settings/terms/:id             -> delete (forbid if default)
 *   POST   /v1/settings/terms/:id/default     -> set default (single default per merchant)
 *   GET    /v1/settings/terms/default         -> get default
 */
export async function settingsTermsRoutes(app: FastifyInstance) {
  const merchantId = 'demo_merchant'; // TODO: replace with auth/tenant context

  // List terms (default first, then by days)
  app.get('/settings/terms', async (_req, reply) => {
    const terms = await prisma.paymentTerm.findMany({
      where: { merchantId },
      orderBy: [{ isDefault: 'desc' }, { days: 'asc' }]
    });
    return reply.send({ terms });
  });

  // Create term
  app.post('/settings/terms', async (req, reply) => {
    const { name, days, isDefault } = (req.body as any) || {};
    if (!name || typeof days !== 'number') {
      return reply.code(400).send({ error: 'invalid_body' });
    }
    const created = await prisma.$transaction(async (tx) => {
      const term = await tx.paymentTerm.create({
        data: { merchantId, name: String(name), days: Number(days), isDefault: !!isDefault },
      });
      if (isDefault) {
        await tx.paymentTerm.updateMany({
          where: { merchantId, id: { not: term.id } },
          data: { isDefault: false }
        });
      }
      return term;
    });
    return reply.code(201).send({ term: created });
  });

  // Delete term (cannot delete default)
  app.delete('/settings/terms/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const existing = await prisma.paymentTerm.findUnique({ where: { id } });
    if (!existing || existing.merchantId !== merchantId) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (existing.isDefault) {
      return reply.code(400).send({ error: 'cannot_delete_default' });
    }
    await prisma.paymentTerm.delete({ where: { id } });
    return reply.send({ ok: true });
  });

  // Set default term
  app.post('/settings/terms/:id/default', async (req, reply) => {
    const id = (req.params as any).id as string;
    const existing = await prisma.paymentTerm.findUnique({ where: { id } });
    if (!existing || existing.merchantId !== merchantId) {
      return reply.code(404).send({ error: 'not_found' });
    }
    await prisma.$transaction(async (tx) => {
      await tx.paymentTerm.update({ where: { id }, data: { isDefault: true } });
      await tx.paymentTerm.updateMany({
        where: { merchantId, id: { not: id } },
        data: { isDefault: false }
      });
    });
    return reply.send({ ok: true });
  });

  // Get default
  app.get('/settings/terms/default', async (_req, reply) => {
    const term = await prisma.paymentTerm.findFirst({
      where: { merchantId, isDefault: true },
      orderBy: { days: 'asc' }
    });
    return reply.send({ term: term ?? null });
  });
}