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

/**
 * Customers routes:
 *  GET   /v1/customers?q=&limit=&cursor=   -> list with search + cursor pagination
 *  GET   /v1/customers/:id                 -> detail
 *  PATCH /v1/customers/:id                 -> update select fields
 *  POST  /v1/customers                     -> create
 */
export async function customersRoutes(app: FastifyInstance) {
  // LIST with search + cursor pagination (defensive + Prisma-correct)
  app.get('/customers', async (req, reply) => {
    try {
      const { q, limit = '25', cursor } = (req.query as ListQuery) || {};
      const take = Math.min(Math.max(parseInt(String(limit), 10) || 25, 1), 100);

      const where = q?.trim()
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName:  { contains: q, mode: 'insensitive' } },
              { company:   { contains: q, mode: 'insensitive' } },
              { email:     { contains: q, mode: 'insensitive' } },
              { phone:     { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined;

      const customers = await prisma.customer.findMany({
        where,
        take: take + 1,                   // fetch one extra for next-cursor detection
        ...(cursor ? { skip: 1, cursor: { id: String(cursor) } } : {}), // Prisma cursor pagination
        orderBy: { id: 'desc' },    // assumes createdAt exists; adjust to your model if needed
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
        hint: 'Ensure Prisma model `Customer` exists and fields used in orderBy/select are valid; use take/skip/cursor for pagination.',
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
          email:     body.email     ?? existing.email,
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
      req.log.error({ err }, 'PATCH /customers/:id failed');
      return reply.status(500).send({ message: 'Failed to update customer' });
    }
  });

  // CREATE
  app.post('/customers', async (req, reply) => {
    try {
      const b = req.body as any;
      const created = await prisma.customer.create({
        data: {
          merchantId: b.merchantId ?? 'demo_merchant',
          firstName:  b.firstName,
          lastName:   b.lastName,
          company:    b.company   ?? null,
          email:      b.email     ?? null,
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
    } catch (err: any) {
      req.log.error({ err }, 'POST /customers failed');
      return reply.status(500).send({ message: 'Failed to create customer' });
    }
  });
}