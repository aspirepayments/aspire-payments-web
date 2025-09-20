import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { signPayLink, verifyPayLink } from '../lib/public_link.js';

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3031';

function cleanToken(raw?: string) {
  if (!raw) return '';
  const d = decodeURIComponent(raw);
  // If someone pasted a whole JSON line like …%22,%22token%22:%22…
  if (d.includes('","token":"')) return d.split('","token":"')[0].replace(/^"+|"+$/g, '');
  return d.replace(/^"+|"+$/g, '');
}

export async function invoicesPublicRoutes(app: FastifyInstance) {
  /**
   * POST /v1/invoices/:id/paylink?ttl=<minutes>
   * -> { url, token, exp_minutes }
   */
  app.post('/invoices/:id/paylink', async (req, reply) => {
    const id = (req.params as any).id as string;
    const ttlMin = parseInt((req.query as any)?.ttl ?? '60', 10);

    const inv = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true }
    });
    if (!inv) return reply.code(404).send({ error: 'invoice_not_found' });

    const token = signPayLink(id, ttlMin);
    return reply.send({ url: `${PUBLIC_BASE_URL}/pay/${token}`, token, exp_minutes: ttlMin });
  });

  /**
   * GET /v1/public/invoices/:token
   * Also accepts:
   *   - Authorization: Bearer <token>
   *   - ?t=<token>
   */
  app.get('/public/invoices/:token', async (req, reply) => {
    try {
      // Prefer Authorization header to avoid path/query encoding issues
      const auth = (req.headers['authorization'] || '') as string;
      let token = '';
      if (auth.toLowerCase().startsWith('bearer ')) {
        token = auth.slice(7).trim();
      } else {
        const p = req.params as any;
        const q = req.query  as any;
        token = cleanToken(p?.token || q?.t);
      }
      if (!token) return reply.code(400).send({ error: 'missing_token' });

      // quick shape check (3 dot-separated parts)
      const parts = token.split('.');
      if (parts.length !== 3) {
        req.log.warn({ tokenPreview: token.slice(0, 25) + '...' }, 'jwt_parts_not_3');
        return reply.code(401).send({ error: 'invalid_or_expired', reason: 'jwt malformed (parts != 3)' });
      }

      const { invoiceId } = verifyPayLink(token); // throws on invalid/expired

      const inv = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { items: true, customer: true },
      });
      if (!inv) return reply.code(404).send({ error: 'invoice_not_found' });

      const subtotal = inv.items.reduce((s, it) => s + it.amount, 0);
      return reply.send({
        invoice: {
          id: inv.id, number: inv.number, currency: inv.currency,
          issueDate: inv.issueDate, dueDate: inv.dueDate, term: inv.term, status: inv.status,
          subtotal,
          customer: inv.customer ? {
            company: inv.customer.company, firstName: inv.customer.firstName, lastName: inv.customer.lastName,
            email: inv.customer.email, address1: inv.customer.address1, address2: inv.customer.address2,
            city: inv.customer.city, state: inv.customer.state, postal: inv.customer.postal, country: inv.customer.country
          } : null,
          items: inv.items.map(it => ({
            description: it.description,
            quantity:    it.quantity,
            unitPrice:   it.unitPrice,
            amount:      it.amount
          })),
        }
      });
    } catch (e: any) {
      req.log.warn({ name: e?.name, message: e?.message }, 'paylink.verify_failed');
      const reason =
        e?.name === 'TokenExpiredError' ? 'expired' :
        e?.name === 'JsonWebTokenError' ? (e?.message || 'invalid') :
        'invalid';
      return reply.code(401).send({ error: 'invalid_or_expired', reason });
    }
  });

  /**
   * POST /v1/public/invoices/refresh
   * body: { token }
   * -> { token, url, exp_minutes }
   * Verify signature ignoring exp; ensure invoice still payable; mint new short-lived token.
   */
  app.post('/public/invoices/refresh', async (req, reply) => {
    try {
      const body = (req.body as any) || {};
      const raw =
        (body.token as string | undefined) ||
        (req.headers['authorization']?.toString().toLowerCase().startsWith('bearer ')
          ? req.headers['authorization']!.slice(7)
          : undefined);

      if (!raw) return reply.code(400).send({ error: 'missing_token' });

      const token = cleanToken(raw);
      // verify signature but ignore expiration (to allow refresh)
      const SECRET = process.env.PUBLIC_LINK_SECRET!;
      const jwt = await import('jsonwebtoken');
      const decoded: any = jwt.verify(token, SECRET, { algorithms: ['HS256'], ignoreExpiration: true });

      const invoiceId = decoded?.invoiceId as string | undefined;
      if (!invoiceId) return reply.code(401).send({ error: 'invalid_or_expired', reason: 'invalid payload' });

      // Invoice must still be payable
      const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true } });
      if (!inv) return reply.code(404).send({ error: 'invoice_not_found' });
      if (!['open', 'partial', 'draft'].includes(inv.status)) {
        return reply.code(403).send({ error: 'not_payable', status: inv.status });
      }

      const ttlMin = parseInt(process.env.PUBLIC_LINK_TTL_MIN || '60', 10);
      const fresh = signPayLink(invoiceId, ttlMin);
      const url = `${PUBLIC_BASE_URL}/pay/${fresh}`;
      return reply.send({ token: fresh, url, exp_minutes: ttlMin });
    } catch (e: any) {
      req.log.warn({ name: e?.name, message: e?.message }, 'paylink.refresh_failed');
      return reply.code(401).send({ error: 'invalid_or_expired', reason: e?.message || 'invalid' });
    }
  });
}