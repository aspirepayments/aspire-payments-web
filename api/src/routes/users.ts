import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

const DEMO_MERCHANT = 'demo_merchant';

export async function usersRoutes(app: FastifyInstance) {
  app.get('/users', async () => {
    const users = await prisma.user.findMany({
      where: { merchantId: DEMO_MERCHANT },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    return { users };
  });

  app.post('/users', async (req, reply) => {
    const body = (req.body as any) ?? {};
    const user = await prisma.user.create({
      data: {
        merchantId: DEMO_MERCHANT,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        mobile: body.mobile ?? null,
        role: body.role ?? 'admin'
      }
    });
    return reply.code(201).send({ user });
  });

  app.patch('/users/:id', async (req) => {
    const id = (req.params as any).id as string;
    const body = (req.body as any) ?? {};
    const user = await prisma.user.update({
      where: { id },
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        mobile: body.mobile,
        role: body.role ?? 'admin'
      }
    });
    return { user };
  });

  // Stub for "resend password"
  app.post('/users/:id/resend-password', async () => {
    // In real system: trigger email
    return { ok: true };
  });
}
