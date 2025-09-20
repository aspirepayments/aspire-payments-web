import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { z } from 'zod';
import { idempotencyGuard } from '../middleware/idempotency.js';
import { plaidCreateAchDebit } from '../providers/plaid.js';
import { nmiCharge } from '../providers/nmi.js';
import { authNetCharge } from '../providers/authnet.js';

const CreatePaymentSchema = z.object({
  merchantId: z.string().optional(), // future: tenant scoping
  amount: z.number().int().positive(),
  currency: z.string().default('USD'),
  method: z.enum(['card', 'bank']),
  rail: z.enum(['ach', 'rtp_rfp', 'fednow']).optional(),
  provider_pref: z.enum(['nmi', 'authorize_net', 'plaid']).optional(),
  token: z.string().optional(), // card token
  plaid_account_id: z.string().optional(),
  capture: z.boolean().default(true),
  metadata: z.record(z.any()).optional()
});

export async function paymentsRoutes(app: FastifyInstance) {
  // CREATE PAYMENT
  app.post('/payments', { preHandler: [idempotencyGuard] }, async (req, reply) => {
    const body = CreatePaymentSchema.parse(req.body);

    // Ensure a merchant exists (upsert demo merchant by default)
    const merchantId = body.merchantId ?? 'demo_merchant';
    await prisma.merchant.upsert({
      where: { id: merchantId },
      update: {},
      create: { id: merchantId, name: merchantId === 'demo_merchant' ? 'Demo Merchant' : merchantId }
    });

    // Create local payment
    const payment = await prisma.payment.create({
      data: {
        merchantId,
        amount: body.amount,
        currency: body.currency,
        method: body.method,
        rail: body.method === 'bank' ? (body.rail ?? 'ach') : null,
        provider: body.method === 'card' ? (body.provider_pref ?? 'nmi') : 'plaid',
        status: 'created',
        instrumentMask: body.method === 'card' ? '****4242' : '****6789'
      }
    });

    // Attempt provider call
    let attemptResp: any = null;
    let status: string = 'failed';

    if (body.method === 'bank') {
      attemptResp = await plaidCreateAchDebit({
        plaidAccountId: body.plaid_account_id ?? 'acct_stub',
        amount: body.amount,
        currency: body.currency,
        idempotencyKey: req.headers['idempotency-key'] as string | undefined
      });
      status = 'pending'; // posted → webhook will mark settled/returned
    } else {
      const cardProvider = body.provider_pref ?? 'nmi';
      if (cardProvider === 'nmi') {
        attemptResp = await nmiCharge({
          token: body.token ?? 'tok_stub',
          amount: body.amount,
          currency: body.currency,
          capture: body.capture
        });
      } else {
        attemptResp = await authNetCharge({
          token: body.token ?? 'tok_stub',
          amount: body.amount,
          currency: body.currency,
          capture: body.capture
        });
      }
      status = attemptResp?.approved ? 'captured' : 'failed';
    }

    await prisma.paymentAttempt.create({
      data: {
        paymentId: payment.id,
        idempotencyKey: (req.headers['idempotency-key'] as string | undefined) ?? null,
        status,
        requestJson: body as any,
        responseJson: attemptResp as any
      }
    });

    const saved = await prisma.payment.update({
      where: { id: payment.id },
      data: { status }
    });

    // Persist idempotent response (hardened upsert)
    const key = req.headers['idempotency-key'];
    if (key && typeof key === 'string') {
      await prisma.idempotency.upsert({
        where: { key },
        create: {
          key,
          responseJson: { payment_id: saved.id, status: saved.status, provider: saved.provider }
        },
        update: {
          responseJson: { payment_id: saved.id, status: saved.status, provider: saved.provider }
        }
      });
    }

    return reply.code(201).send({
      payment_id: saved.id,
      status: saved.status,
      provider: saved.provider
    });
  });

  // LIST PAYMENTS (simple)
  app.get('/payments', async (req, reply) => {
    const limit = Math.min(Number((req.query as any)?.limit ?? 50), 200);
    const payments = await prisma.payment.findMany({
     orderBy: { createdAt: 'desc' },
     take: limit
  });
  return { payments };
});
  // GET PAYMENT
  app.get('/payments/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { attempts: true, refunds: true }
    });
    if (!payment) return reply.code(404).send({ error: 'not_found' });
    return { payment };
  });

  // CREATE REFUND
  app.post('/payments/:id/refunds', async (req, reply) => {
    const id = (req.params as any).id as string;
    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) return reply.code(404).send({ error: 'not_found' });

    const amount = (req.body as any)?.amount ?? payment.amount; // full refund default
    const refund = await prisma.refund.create({
      data: { paymentId: id, amount, status: 'pending' }
    });

    // TODO: call provider refund; for bank rails, create credit transfer
    return reply.code(202).send({ refund_id: refund.id, status: refund.status });
  });
}