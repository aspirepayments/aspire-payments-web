import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db.js';

export async function idempotencyGuard(req: FastifyRequest, reply: FastifyReply) {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string') return; // proceed if not provided

  // If we already have a canonical response, replay it immediately
  const existing = await prisma.idempotency.findUnique({ where: { key } });
  if (existing?.responseJson) {
    reply.header('x-idempotent-replay', 'true');
    return reply.send(existing.responseJson);
  }

  // Reserve the key early so concurrent retries don't double-create.
  // The route handler will upsert the final response once work completes.
  if (!existing) {
    await prisma.idempotency.create({ data: { key } });
  }
  // If existing but no response yet, let the route proceed and write it.
}
