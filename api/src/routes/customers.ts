// api/src/routes/customers.ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

type ListQuery = {
  q?: string;
  limit?: string;      // string in query -> parse to number
  cursor?: string;     // id-based cursor
};

type UpdateBody = Partial<{
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postal: string | null;
  country: string | null;
  terms: string | null;
}>;

// Ensure a merchant exists and return it (prevents FK errors)
async function getOrCreateMerchant() {
  let merchant = await prisma.merchant.findFirst();
  if (!merchant) {
    merchant = await prisma.merchant.create({ data: { name: 'Aspire Payments (DEV)' } });
  }
  return merchant;
}

/**
 * Customers routes:
 *  GET   /v1/customers?q=&limit=&cursor=   -> list with search + cursor pagination
 *  GET   /v1/customers/:id                 -> detail
 *  PATCH /v1/customers/:id                 -> update select fields
 *  POST  /v1/customers                     -> create
 */
export async function customersRoutes(app: FastifyInstance) {
  // LIST with search + cursor pagination (scoped to merchant)
  app.get('/customers', async (req, reply) => {
    try {
      const merchant = await getOrCreateMerchant();
      const { q, limit = '25', cursor } = (req.query as ListQuery) || {};
      const take = Math.min(Math.max(parseInt(String(limit), 10) || 25, 1), 100);

      const search = q?.trim();
      const where = {
        merchantId: merchant.id,
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName:  { contains: search, mode: 'insensitive' } },
                { company:   { contains: search, mode: 'insensitive' } },
                { email:     { contains: search, mode: 'insensitive' } },
                { phone:     { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      const customers = await prisma.customer.findMany({
        where,
        take: take + 1,                                   // fetch one extra for next-cursor detection
        ...(cursor ? { skip: 1, cursor: { id: String(cursor) } } : {}),
        orderBy: { id: 'desc' },
        select: {
          id: true, firstName: true, lastName: true, email: true, company: true,
          phone: true, address1: true, address2: true, city: true, state: true,
          postal: true, country: true, terms: true,
        },
      });

      let nextCursor: string | null = null;
      if (customers.length > take) {
        const next = customers.pop()!;
        nextCursor = next.id;
      }

      return reply.send({ customers, nextCursor });
    } catch (err: any) {
      req.log.error({ err }, 'GET /customers failed');
      return reply.status(500).send({
        message: 'Failed to list customers',
        hint: 'Verify Customer model/fields and pagination params.',
      });
    }
  });

  // GET by id
  app.get('/customers/:id', async (req, reply) => {
    try {
      const id = (req.params as any).id as string;
      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer) return reply.code(404).send({ error: 'not_found' });
      return reply.send({ customer });
    } catch (err: any) {
      req.log.error({ err }, 'GET /customers/:id failed');
      return reply.status(500).send({ message: 'Failed to fetch customer' });
    }
  });

  // UPDATE select fields
  app.patch('/customers/:id', async (req, reply) => {
    try {
      const id = (req.params as any).id as string;
      const body = req.body as UpdateBody;

      const existing = await prisma.customer.findUnique({ where: { id } });
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      const updated = await prisma.customer.update({
        where: { id },
        data: {
          firstName: body.firstName ?? existing.firstName,
          lastName:  body.lastName  ?? existing.lastName,
          company:   body.company   ?? existing.company,
          email:     body.email     !== undefined
                        ? (body.email ? String(body.email).trim().toLowerCase() : null)
                        : existing.email,
          phone:     body.phone     ?? existing.phone,
          address1:  body.address1  ?? existing.address1,
          address2:  body.address2  ?? existing.address2,
          city:      body.city      ?? existing.city,
          state:     body.state     ?? existing.state,
          postal:    body.postal    ?? existing.postal,
          country:   body.country   ?? existing.country,
          terms:     body.terms     ?? existing.terms,
        },
      });

      return reply.send({ customer: updated });
    } catch (err: any) {
      // P2002 = unique constraint (e.g., merchantId+email uniqueness)
      if (err?.code === 'P2002') {
        return reply.status(409).send({ error: 'duplicate', message: 'Email already exists for this merchant' });
      }
      req.log.error({ err }, 'PATCH /customers/:id failed');
      return reply.status(500).send({ message: 'Failed to update customer' });
    }
  });

  // CREATE (scoped to merchant, dedupe on email)
  app.post('/customers', async (req, reply) => {
    try {
      const merchant = await getOrCreateMerchant();
      const b = (req.body as any) ?? {};

      // require at least some identifier
      if (!b.firstName && !b.lastName && !b.company && !b.email) {
        return reply.code(400).send({ error: 'missing_fields', message: 'Provide name, company, or email.' });
      }

      const email = b.email ? String(b.email).trim().toLowerCase() : null;

      try {
        const created = await prisma.customer.create({
          data: {
            merchantId: merchant.id,
            firstName:  b.firstName ?? null,
            lastName:   b.lastName  ?? null,
            company:    b.company   ?? null,
            email,                            // nullable
            phone:      b.phone     ?? null,
            address1:   b.address1  ?? null,
            address2:   b.address2  ?? null,
            city:       b.city      ?? null,
            state:      b.state     ?? null,
            postal:     b.postal    ?? null,
            country:    b.country   ?? 'US',
            terms:      b.terms     ?? 'Net 30',
          },
        });
        return reply.code(201).send({ customer: created });
      } catch (e: any) {
        // P2002 unique constraint (e.g., unique (merchantId, email))
        if (e?.code === 'P2002' && email) {
          const existing = await prisma.customer.findFirst({
            where: { merchantId: merchant.id, email },
          });
          if (existing) {
            return reply.code(200).send({ customer: existing, deduped: true });
          }
        }
        throw e;
      }
    } catch (err: any) {
      req.log.error({ err }, 'POST /customers failed');
      return reply.status(500).send({ message: 'Failed to create customer' });
    }
  });
}