import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { z } from 'zod';

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

const InvoiceItemInput = z.object({
  itemId: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().int().min(0),
  taxable: z.boolean().optional().default(false),
});

const UpdateInvoice = z.object({
  merchantId: z.string().default('demo_merchant'),
  customerId: z.string().optional(),
  issueDate: z.string().optional(),     // ISO "YYYY-MM-DD"
  term: z.string().optional(),
  dueDate: z.string().optional(),       // ISO; server re-computes if absent but issue/term changed
  currency: z.string().optional(),
  feePlanId: z.string().optional(),
  taxRateId: z.string().optional(),
  items: z.array(InvoiceItemInput).min(1).optional(),  // if present, we replace all items
  message: z.string().optional(),
  internalNote: z.string().optional(),
  status: z.enum(['draft','open','paid','overdue','partial','void']).optional(),
});

function calcDue(issueISO?: string, term?: string, explicitDueISO?: string) {
  if (explicitDueISO) return new Date(explicitDueISO);
  if (!issueISO) return undefined;
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

export async function invoicesRoutes(app: FastifyInstance) {
  // List invoices
  app.get('/invoices', async (req) => {
    const merchantId = (req.query as any)?.merchantId ?? 'demo_merchant';
    const invoices = await prisma.invoice.findMany({
      where: { merchantId },
      orderBy: { issueDate: 'desc' },
      take: 200,
    });
    return { invoices };
  });

  // GET one (include items + customer)
  app.get('/invoices/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        items: true,
        customer: { select: { id: true, firstName: true, lastName: true, company: true, email: true } },
      },
    });
    if (!invoice) return reply.code(404).send({ error: 'not_found' });
    return { invoice };
  });

  // PATCH an invoice (simple fields e.g., mark paid)
  app.patch('/invoices/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const body = (req.body as any) ?? {};
    const data: any = {};
    if (typeof body.status === 'string') data.status = body.status;
    if (typeof body.amountPaid === 'number') data.amountPaid = Math.max(0, body.amountPaid);
    const inv = await prisma.invoice.update({ where: { id }, data });
    return { invoice: inv };
  });

  // PUT an invoice (full edit: header + lines; recompute fees/tax/totals)
  app.put('/invoices/:id', async (req, reply) => {
    const parsed = UpdateInvoice.safeParse(req.body);
    if (!parsed.success) {
      app.log.error({ zod: parsed.error.flatten() }, 'Invalid invoice update payload');
      return reply.code(400).send({ error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const id = (req.params as any).id as string;

    try {
      // Fetch existing invoice (keep amountPaid, number)
      const existing = await prisma.invoice.findUnique({ where: { id }, include: { items: true } });
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      // Compute due date if issue/term changed and dueDate not explicitly set
      let nextDue: Date | undefined = undefined;
      if (body.issueDate || body.term || body.dueDate) {
        const issueISO = body.issueDate ?? existing.issueDate.toISOString().slice(0,10);
        nextDue = calcDue(issueISO, body.term ?? existing.term ?? undefined, body.dueDate);
      }

      // Lines: if body.items provided, replace; else keep existing
      let lineRows: Array<{itemId: string|null; description: string; quantity: number; unitPrice: number; amount: number; taxable: boolean}> = [];
      if (body.items) {
        // Build from payload
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
        }
      } else {
        // Keep existing rows as-is
        lineRows = existing.items.map(it => ({
          itemId: it.itemId, description: it.description, quantity: it.quantity,
          unitPrice: it.unitPrice, amount: it.amount, taxable: (it as any).taxable ?? false
        }));
      }

      // Subtotal
      let subtotal = lineRows.reduce((acc, r) => acc + r.amount, 0);

      // Fee Plan
      let feePlanId = body.feePlanId ?? existing.taxRateId /* placeholder variable reuse fix next line */;
      // ^ the above is accidental potential confusion; set feePlanId correctly:
      feePlanId = body.feePlanId ?? (null as any);

      if (body.feePlanId) {
        const plan = await prisma.feePlan.findUnique({ where: { id: body.feePlanId } });
        if (plan) {
          if (plan.mode === 'convenience' && plan.convenienceFeeCents > 0) {
            const amount = plan.convenienceFeeCents;
            lineRows.push({ itemId: null, description: plan.name || 'Convenience Fee', quantity: 1, unitPrice: amount, amount, taxable: false });
            subtotal += amount;
          } else if (plan.mode === 'service' && plan.serviceFeeBps > 0) {
            const amount = Math.round(subtotal * (plan.serviceFeeBps / 10000));
            if (amount > 0) {
              lineRows.push({ itemId: null, description: `${plan.name || 'Service Fee'} (${(plan.serviceFeeBps/100).toFixed(2)}%)`, quantity: 1, unitPrice: amount, amount, taxable: false });
              subtotal += amount;
            }
          }
        }
      }

      // Tax
      let taxTotal = 0;
      const taxRateId = body.taxRateId ?? existing.taxRateId ?? undefined;
      if (taxRateId) {
        const rate = await prisma.taxRate.findUnique({ where: { id: taxRateId } });
        if (rate) {
          const taxableBase = lineRows.filter(r => r.taxable).reduce((a,r)=>a+r.amount,0);
          taxTotal = Math.round(taxableBase * (rate.rateBps / 10000));
        }
      }

      const total = subtotal + taxTotal;

      // Prepare invoice update
      const updateData: any = {
        customerId: body.customerId ?? existing.customerId,
        issueDate: body.issueDate ? new Date(body.issueDate) : existing.issueDate,
        dueDate: nextDue ? nextDue : existing.dueDate,
        term: body.term ?? existing.term,
        currency: body.currency ?? existing.currency,
        taxRateId: taxRateId ?? null,
        subtotal,
        taxTotal,
        total,
        message: body.message ?? existing.message,
        internalNote: body.internalNote ?? existing.internalNote,
        status: body.status ?? existing.status,
      };

      // Transaction: replace items if provided
      const updated = await prisma.$transaction(async (tx) => {
        if (body.items) {
          await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
          await tx.invoiceItem.createMany({
            data: lineRows.map(r => ({
              invoiceId: id,
              itemId: r.itemId,
              description: r.description,
              quantity: r.quantity,
              unitPrice: r.unitPrice,
              amount: r.amount,
              taxable: r.taxable,
            }))
          });
        }
        return tx.invoice.update({ where: { id }, data: updateData });
      });

      return reply.send({ invoice: updated });
    } catch (err:any) {
      app.log.error({ err }, 'Failed to update invoice');
      return reply.code(500).send({ error: 'server_error', message: err?.message || 'Failed to update invoice' });
    }
  });

  // Revenue summary
  app.get('/reports/revenue', async (req) => {
    const merchantId = (req.query as any)?.merchantId ?? 'demo_merchant';
    const days = Math.min(Number((req.query as any)?.days ?? 30), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await prisma.invoice.findMany({
      where: { merchantId, updatedAt: { gte: since }, status: { in: ['paid', 'partial'] } },
      select: { updatedAt: true, amountPaid: true },
    });
    const daily: Record<string, number> = {};
    for (const r of rows) {
      const key = r.updatedAt.toISOString().slice(0, 10);
      daily[key] = (daily[key] ?? 0) + r.amountPaid;
    }
    const series = Object.keys(daily).sort().map((k) => ({ date: k, amount: daily[k] }));
    return { series };
  });

  // Transactions count
  app.get('/reports/txnCount', async (req) => {
    const merchantId = (req.query as any)?.merchantId ?? 'demo_merchant';
    const days = Math.min(Number((req.query as any)?.days ?? 30), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await prisma.invoice.findMany({
      where: { merchantId, issueDate: { gte: since } },
      select: { issueDate: true },
    });
    const daily: Record<string, number> = {};
    for (const r of rows) {
      const key = r.issueDate.toISOString().slice(0, 10);
      daily[key] = (daily[key] ?? 0) + 1;
    }
    const series = Object.keys(daily).sort().map((k) => ({ date: k, count: daily[k] }));
    return { series };
  });

  // A/R aging
  app.get('/reports/aging', async (req) => {
    const merchantId = (req.query as any)?.merchantId ?? 'demo_merchant';
    const today = new Date();
    const open = await prisma.invoice.findMany({
      where: { merchantId, status: { in: ['open', 'overdue', 'partial'] } },
      select: { dueDate: true, total: true, amountPaid: true },
    });
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const inv of open) {
      const due = new Date(inv.dueDate);
      const overdueDays = daysBetween(today, due);
      const remaining = Math.max(inv.total - inv.amountPaid, 0);
      if (remaining === 0) continue;
      if (overdueDays > 0 && overdueDays <= 30) buckets['0-30'] += remaining;
      else if (overdueDays <= 60) buckets['31-60'] += remaining;
      else if (overdueDays <= 90) buckets['61-90'] += remaining;
      else if (overdueDays > 90) buckets['90+'] += remaining;
    }
    return { buckets };
  });
}