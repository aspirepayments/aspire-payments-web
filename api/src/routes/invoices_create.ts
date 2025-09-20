import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { z } from 'zod';

const InvoiceItemInput = z.object({
  itemId: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().int().min(0),
  taxable: z.boolean().optional().default(false),
});

const CreateInvoice = z.object({
  merchantId: z.string().default('demo_merchant'),
  customerId: z.string(),
  issueDate: z.string(),                 // ISO: "YYYY-MM-DD"
  term: z.string().optional(),           // e.g., "Net 30"
  dueDate: z.string().optional(),        // ISO; server will compute if absent
  currency: z.string().default('USD'),
  feePlanId: z.string().optional(),
  taxRateId: z.string().optional(),
  items: z.array(InvoiceItemInput).min(1),
  message: z.string().optional(),
  internalNote: z.string().optional(),
  sendBehavior: z.enum(['draft','send_immediately','schedule']).default('draft'),
});

function calcDue(issueISO: string, term?: string, explicitDueISO?: string) {
  if (explicitDueISO) return new Date(explicitDueISO);
  const issue = new Date(issueISO);
  const map: Record<string, number> = {
    'Due on Receipt': 0, 'Net 7': 7, 'Net 14': 14, 'Net 15': 15, 'Net 30': 30, 'Net 45': 45, 'Net 60': 60
  };
  let days = 30;
  if (term) {
    if (map[term]) days = map[term];
    else {
      const m = /^net\s+(\d+)$/i.exec(term);
      if (m) days = parseInt(m[1], 10);
    }
  }
  return new Date(issue.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function invoicesCreateRoutes(app: FastifyInstance) {
  app.post('/invoices', async (req, reply) => {
    // 1) Validate input and show readable errors instead of 500
    const parsed = CreateInvoice.safeParse(req.body);
    if (!parsed.success) {
      app.log.error({ zod: parsed.error.flatten() }, 'Invalid invoice payload');
      return reply.code(400).send({ error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const body = parsed.data;

    try {
      const merchantId = body.merchantId;

      // 2) Ensure merchant exists
      await prisma.merchant.upsert({
        where: { id: merchantId },
        update: {},
        create: { id: merchantId, name: 'Demo Merchant' },
      });

      // 3) Dates
      const due = calcDue(body.issueDate, body.term, body.dueDate);

      // 4) Build line items (and subtotal)
      let subtotal = 0;
      const lineRows: any[] = [];
      for (const it of body.items) {
        const qty = it.quantity;
        const unit = it.unitPrice;
        const amount = qty * unit;

        let desc = it.description;
        if (!desc && it.itemId) {
          const item = await prisma.item.findUnique({ where: { id: it.itemId } });
          desc = item?.name ?? 'Item';
        }

        lineRows.push({
          itemId: it.itemId ?? null,
          description: desc ?? 'Item',
          quantity: qty,
          unitPrice: unit,
          amount,
          taxable: !!it.taxable,
        });

        subtotal += amount;
      }

      // 5) Apply fee plan (fee line is non-taxable)
      if (body.feePlanId) {
        const plan = await prisma.feePlan.findUnique({ where: { id: body.feePlanId } });
        if (plan) {
          if (plan.mode === 'convenience' && plan.convenienceFeeCents > 0) {
            const amount = plan.convenienceFeeCents;
            lineRows.push({
              itemId: null,
              description: plan.name || 'Convenience Fee',
              quantity: 1,
              unitPrice: amount,
              amount,
              taxable: false,
            });
            subtotal += amount;
          } else if (plan.mode === 'service' && plan.serviceFeeBps > 0) {
            const amount = Math.round(subtotal * (plan.serviceFeeBps / 10000));
            if (amount > 0) {
              lineRows.push({
                itemId: null,
                description: `${plan.name || 'Service Fee'} (${(plan.serviceFeeBps / 100).toFixed(2)}%)`,
                quantity: 1,
                unitPrice: amount,
                amount,
                taxable: false,
              });
              subtotal += amount;
            }
          }
        }
      }

      // 6) Tax (only on taxable lines)
      let taxTotal = 0;
      if (body.taxRateId) {
        const rate = await prisma.taxRate.findUnique({ where: { id: body.taxRateId } });
        if (rate) {
          const taxableBase = lineRows.filter((r: any) => r.taxable).reduce((acc: number, r: any) => acc + r.amount, 0);
          taxTotal = Math.round(taxableBase * (rate.rateBps / 10000));
        }
      }

      // 7) Totals & status
      const total = subtotal + taxTotal;
      let status: 'draft' | 'open' | 'paid' | 'overdue' | 'partial' | 'void' = 'draft';
      if (body.sendBehavior === 'send_immediately') status = 'open';

      // 8) Generate invoice number
      const number = 'INV-' + Math.random().toString(36).slice(2, 8).toUpperCase();

      // 9) Create
      const inv = await prisma.invoice.create({
        data: {
          merchantId,
          customerId: body.customerId,
          number,
          status,
          issueDate: new Date(body.issueDate),
          dueDate: due,
          term: body.term ?? null,
          currency: body.currency,
          taxRateId: body.taxRateId ?? null,
          subtotal,
          taxTotal,
          total,
          amountPaid: 0,
          message: body.message ?? null,
          internalNote: body.internalNote ?? null,
          items: {
            create: lineRows.map((r) => ({
              itemId: r.itemId,
              description: r.description,
              quantity: r.quantity,
              unitPrice: r.unitPrice,
              amount: r.amount,
              taxable: r.taxable,
            })),
          },
        },
      });

      // 10) Success
      return reply.code(201).send({ invoice: inv });
    } catch (err: any) {
      // Log the real reason to console and return readable 500
      app.log.error({ err, body: req.body }, 'Failed to create invoice');
      return reply.code(500).send({ error: 'server_error', message: err?.message || 'Failed to create invoice' });
    }
  });
}