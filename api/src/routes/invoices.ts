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
  dueDate: z.string().optional(),       // ISO
  currency: z.string().optional(),
  feePlanId: z.string().optional(),     // connect/disconnect relation
  taxRateId: z.string().optional(),
  items: z.array(InvoiceItemInput).min(1).optional(), // if present, replace all items
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

// Heuristic: is this row likely a "fee" row (legacy fee-as-item)?
function looksLikeFeeRow(r: { itemId: string|null; description: string; taxable: boolean }) {
  const d = (r.description || '').toLowerCase();
  return r.itemId === null && (d.includes('fee') || d.includes('convenience') || d.includes('service'));
}

export async function invoicesRoutes(app: FastifyInstance) {
  // -------------------- LIST --------------------
  app.get('/invoices', async (req) => {
    const merchantId = (req.query as any)?.merchantId ?? 'demo_merchant';

    const invoices = await prisma.invoice.findMany({
      where: { merchantId },
      orderBy: { issueDate: 'desc' },
      take: 200,
      select: {
        id: true,
        number: true,
        issueDate: true,
        dueDate: true,
        status: true,
        subtotal: true,
        taxTotal: true,
        feeCents: true,
        total: true,
        amountPaid: true,
        currency: true,
        customerId: true,
      }
    });
    return { invoices };
  });

  // -------------------- GET ONE --------------------
  app.get('/invoices/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        items: true,
        customer: { select: { id: true, firstName: true, lastName: true, company: true, email: true } },
        feePlan:  { select: { id: true, name: true, mode: true, convenienceFeeCents: true, serviceFeeBps: true } },
      },
    });
    if (!invoice) return reply.code(404).send({ error: 'not_found' });
    return { invoice };
  });

  // -------------------- CREATE --------------------
  app.post('/invoices', async (req, reply) => {
    const b = (req.body as any) ?? {};

    const merchant =
      (await prisma.merchant.findFirst()) ??
      (await prisma.merchant.create({ data: { name: 'Aspire Payments (DEV)' } }));

    if (!b.customerId) return reply.code(400).send({ error: 'missing_customer' });

    const issueDate = b.issueDate ? new Date(b.issueDate) : new Date();
    const dueDate   = b.dueDate   ? new Date(b.dueDate)   : issueDate;
    const currency  = b.currency  || 'USD';
    const term      = b.term      || null;

    // items (never put fee as a line item): strip any fee-looking rows first
    let items = (b.items ?? []).map((it: any) => {
      const qty  = Math.max(1, Number(it.quantity || 1));
      const unit = Math.max(0, Number(it.unitPrice || 0));
      return {
        itemId: it.itemId ?? null,
        description: it.description ?? 'Item',
        quantity: qty,
        unitPrice: unit,
        amount: qty * unit,
        taxable: !!it.taxable,
      };
    });
    items = items.filter(r => !looksLikeFeeRow({ itemId: r.itemId, description: r.description, taxable: r.taxable }));

    const subtotal = items.reduce((s: number, r: any) => s + r.amount, 0);

    // fee (convenience/service)
    let feeCents = 0;
    if (b.feePlanId) {
      const plan = await prisma.feePlan.findUnique({ where: { id: b.feePlanId } });
      if (plan) {
        if (plan.mode === 'convenience' && (plan.convenienceFeeCents ?? 0) > 0) {
          feeCents = plan.convenienceFeeCents ?? 0;
        } else if (plan.mode === 'service' && (plan.serviceFeeBps ?? 0) > 0) {
          feeCents = Math.round(subtotal * ((plan.serviceFeeBps ?? 0) / 10000));
        }
      }
    }

    // tax (only taxable items)
    let taxTotal = 0;
    if (b.taxRateId) {
      const rate = await prisma.taxRate.findUnique({ where: { id: b.taxRateId } });
      if (rate) {
        const taxableBase = items.filter((r: any) => r.taxable).reduce((a: number, r: any) => a + r.amount, 0);
        taxTotal = Math.round(taxableBase * (rate.rateBps / 10000));
      }
    }

    const total = subtotal + feeCents + taxTotal;

    const created = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          merchant:  { connect: { id: merchant.id } },   // relation connect
          customer:  { connect: { id: b.customerId } },  // relation connect
          number:    b.number ?? `INV-${Date.now()}`,
          status:    'open',                             // or 'draft' if you want a finalize step
          issueDate, dueDate, currency, term,
          subtotal, feeCents, taxTotal, total,
          ...(b.taxRateId ? { taxRateId: b.taxRateId } : {}),
          ...(b.feePlanId ? { feePlan: { connect: { id: b.feePlanId } } } : {}),
        }
      });

      if (items.length) {
        await tx.invoiceItem.createMany({
          data: items.map((r: any) => ({
            invoiceId: inv.id,
            itemId: r.itemId,
            description: r.description,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
            amount: r.amount,
            taxable: r.taxable,
          }))
        });
      }
      return inv;
    });

    reply
      .code(201)
      .header('Location', `/v1/invoices/${created.id}`)
      .send({ id: created.id });
  });

  // -------------------- PATCH SMALL FIELDS --------------------
  app.patch('/invoices/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const body = (req.body as any) ?? {};
    const data: any = {};
    if (typeof body.status === 'string') data.status = body.status;
    if (typeof body.amountPaid === 'number') data.amountPaid = Math.max(0, body.amountPaid);
    const inv = await prisma.invoice.update({ where: { id }, data });
    return { invoice: inv };
  });

  // -------------------- UPDATE (PUT) --------------------
  app.put('/invoices/:id', async (req, reply) => {
    const parsed = UpdateInvoice.safeParse(req.body);
    if (!parsed.success) {
      app.log.error({ zod: parsed.error.flatten() }, 'Invalid invoice update payload');
      return reply.code(400).send({ error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const id = (req.params as any).id as string;

    try {
      const existing = await prisma.invoice.findUnique({
        where: { id },
        include: { items: true, feePlan: true }
      });
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      // due date
      let nextDue: Date | undefined;
      if (body.issueDate || body.term || body.dueDate) {
        const issueISO = body.issueDate ?? existing.issueDate.toISOString().slice(0,10);
        nextDue = calcDue(issueISO, body.term ?? existing.term ?? undefined, body.dueDate);
      }

      // items: strip any legacy "fee-as-item" rows
      let lineRows: Array<{itemId: string|null; description: string; quantity: number; unitPrice: number; amount: number; taxable: boolean}> = [];
      if (body.items) {
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
        lineRows = existing.items.map(it => ({
          itemId: it.itemId, description: it.description, quantity: it.quantity,
          unitPrice: it.unitPrice, amount: it.amount, taxable: (it as any).taxable ?? false
        }));
      }
      // strip fee-like rows before computing subtotal
      lineRows = lineRows.filter(r => !looksLikeFeeRow({ itemId: r.itemId, description: r.description, taxable: r.taxable }));

      const subtotal = lineRows.reduce((acc, r) => acc + r.amount, 0);

      // fee (not as an item)
      const incomingFeePlanId = body.feePlanId ?? null;
      let feeCents = 0;
      if (incomingFeePlanId) {
        const plan = await prisma.feePlan.findUnique({ where: { id: incomingFeePlanId } });
        if (plan) {
          if (plan.mode === 'convenience' && (plan.convenienceFeeCents ?? 0) > 0) {
            feeCents = plan.convenienceFeeCents ?? 0;
          } else if (plan.mode === 'service' && (plan.serviceFeeBps ?? 0) > 0) {
            feeCents = Math.round(subtotal * ((plan.serviceFeeBps ?? 0) / 10000));
          }
        }
      }

      // tax (taxable items only)
      let taxTotal = 0;
      const taxRateId = body.taxRateId ?? existing.taxRateId ?? undefined;
      if (taxRateId) {
        const rate = await prisma.taxRate.findUnique({ where: { id: taxRateId } });
        if (rate) {
          const taxableBase = lineRows.filter(r => r.taxable).reduce((a,r)=>a+r.amount,0);
          taxTotal = Math.round(taxableBase * (rate.rateBps / 10000));
        }
      }

      const total = subtotal + feeCents + taxTotal;

      // scalars
      const updateDataBase: any = {
        issueDate: body.issueDate ? new Date(body.issueDate) : existing.issueDate,
        dueDate: nextDue ? nextDue : existing.dueDate,
        term: body.term ?? existing.term,
        currency: body.currency ?? existing.currency,
        taxRateId: taxRateId ?? null,
        subtotal,
        feeCents,
        taxTotal,
        total,
        message: body.message ?? existing.message,
        internalNote: body.internalNote ?? existing.internalNote,
      };

      // relations (nested writes — Prisma pattern)
      const relationUpdates: any = {};
      relationUpdates.merchant = { connect: { id: body.merchantId ?? existing.merchantId ?? 'demo_merchant' } };
      if (body.customerId) relationUpdates.customer = { connect: { id: body.customerId } };
      if (incomingFeePlanId) {
        relationUpdates.feePlan = { connect: { id: incomingFeePlanId } };
      } else if (existing.feePlan) {
        relationUpdates.feePlan = { disconnect: true };
      }

      // auto-open rule
      const hasCustomer = !!(body.customerId || existing.customerId);
      const hasIssue = !!(body.issueDate || existing.issueDate);
      const hasLines = lineRows.length > 0;
      const nextStatus =
        body.status ?? (existing.status === 'draft' && hasCustomer && hasIssue && hasLines ? 'open' : existing.status);

      const updateData = { ...updateDataBase, ...relationUpdates, status: nextStatus };

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

  // -------------------- REPORTS --------------------
  // Cashflow (paid/partial)
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

  // Open A/R (open|overdue|partial)
  app.get('/reports/ar-open', async (req) => {
    const merchantId = (req.query as any)?.merchantId ?? 'demo_merchant';
    const rows = await prisma.invoice.findMany({
      where: { merchantId, status: { in: ['open','overdue','partial'] } },
      select: { total: true, amountPaid: true },
    });
    const sumCents = rows.reduce((s, r) => s + Math.max((r.total || 0) - (r.amountPaid || 0), 0), 0);
    const count    = rows.length;
    return { sumCents, count };
  });

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

  // -------------------- ADMIN REPAIR (DEV ONLY) --------------------
  // Removes legacy "fee-as-item" rows, recomputes feeCents/tax/total.
  app.post('/admin/repair/fees', async (_req, reply) => {
    const batch = 200;
    let cursor: string | null = null;
    let repaired = 0;

    while (true) {
      const invoices = await prisma.invoice.findMany({
        take: batch,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        include: { items: true, feePlan: true },
        orderBy: { id: 'asc' }
      });
      if (!invoices.length) break;
      cursor = invoices[invoices.length - 1].id;

      for (const inv of invoices) {
        const feeItems = inv.items.filter(it =>
          looksLikeFeeRow({ itemId: it.itemId, description: it.description, taxable: (it as any).taxable ?? false })
        );
        if (!feeItems.length) continue;

        const kept = inv.items.filter(it => !feeItems.includes(it));
        const subtotal = kept.reduce((s, r) => s + r.amount, 0);

        let feeCents = 0;
        if (inv.feePlan) {
          const mode = inv.feePlan.mode;
          const flat = inv.feePlan.convenienceFeeCents ?? 0;
          const bps  = inv.feePlan.serviceFeeBps ?? 0;
          if (mode === 'convenience' && flat > 0) feeCents = flat;
          else if (mode === 'service' && bps > 0) feeCents = Math.round(subtotal * (bps / 10000));
        }

        let taxTotal = 0;
        if (inv as any && (inv as any).taxRateId) {
          const rate = await prisma.taxRate.findUnique({ where: { id: (inv as any).taxRateId } });
          if (rate) {
            const taxableBase = kept
              .filter(it => (it as any).taxable ?? false)
              .reduce((a, r) => a + r.amount, 0);
            taxTotal = Math.round(taxableBase * (rate.rateBps / 10000));
          }
        }

        const total = subtotal + feeCents + taxTotal;

        await prisma.$transaction(async tx => {
          await tx.invoiceItem.deleteMany({ where: { id: { in: feeItems.map(f => f.id) } } });
          await tx.invoice.update({ where: { id: inv.id }, data: { subtotal, feeCents, taxTotal, total } });
        });

        repaired++;
      }
    }

    return reply.send({ ok: true, repaired });
  });
}