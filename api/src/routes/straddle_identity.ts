// api/src/routes/straddle_identity.ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

const STRADDLE_BASE = process.env.STRADDLE_API_BASE!;
const STRADDLE_KEY  = process.env.STRADDLE_API_KEY!;

/**
 * Minimal Straddle POST helper
 * - Adds Bearer auth
 * - Adds Straddle-Account-Id when embeddedAccountId is provided (embedded/platform mode)
 * - Throws Error(message) containing status + body on non-2xx so logs show validation details
 */
async function straddlePost(path: string, body: any, embeddedAccountId?: string) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${STRADDLE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (embeddedAccountId) {
    headers['Straddle-Account-Id'] = embeddedAccountId; // scope to the embedded merchant (platform)  // docs: Platform API / header
  }

  const res = await fetch(`${STRADDLE_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Straddle ${path} ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

/** Convert an arbitrary phone string to E.164 (US fallback) */
function toE164(raw?: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (s.startsWith('+')) {
    const digits = s.slice(1).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  // strip all non-digits
  const digitsOnly = s.replace(/\D/g, '');
  // US fallback: exactly 10 digits => +1 + digits
  if (digitsOnly.length === 10) return `+1${digitsOnly}`;
  // 11 digits starting with 1 => +<digits>
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) return `+${digitsOnly}`;
  return null;
}

export async function straddleIdentityRoutes(app: FastifyInstance) {
  /**
   * Create/attach a Straddle customer (Identity) for a local Customer
   * Body: {
   *   merchantId: string,
   *   customerId: string,
   *   embeddedAccountId?: string | null,  // set to the embedded merchant account id
   *   overrideEmail?: string | null       // (optional) use this email instead of DB one
   * }
   */
  app.post('/straddle/customers', async (req, reply) => {
    try {
      const b = req.body as {
        merchantId: string;
        customerId: string;
        embeddedAccountId?: string | null;
        overrideEmail?: string | null;
      };

      if (!b?.merchantId || !b?.customerId) {
        return reply.code(400).send({ error: 'missing_fields' });
      }

      // Look up local Customer
      const customer = await prisma.customer.findUnique({ where: { id: b.customerId } });
      if (!customer) return reply.code(404).send({ error: 'customer_not_found' });

      // If already mapped to Straddle, return that id
      const existing = await prisma.customerExternal.findFirst({
        where: { customerId: b.customerId, provider: 'straddle' },
      });
      if (existing) {
        return reply.code(200).send({ straddleCustomerId: existing.externalId, reused: true });
      }

      // Resolve client IP for Straddle Identity (required field)
      // Prefer first X-Forwarded-For, else Fastify's req.ip, else a safe public IP in sandbox.
      const xfwd = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
      let ip = xfwd || (req as any).ip || '';
      if (!ip || ip === '::1' || ip.startsWith('127.')) ip = '1.1.1.1';

      // Build payload Straddle expects for Create Customer:
      // name (single string), type ('individual'|'business'), phone (E.164), email?, device.ip_address
      const fullName =
        `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() ||
        (customer.company ?? 'Unknown Name');

      const type = customer.company ? 'business' : 'individual';

      // Normalize phone to E.164 (fallback to a valid US demo number for sandbox)
      let phoneE164 = toE164(customer.phone);
      if (!phoneE164) phoneE164 = '+15555550100';

      // Allow overriding email from request (useful in sandbox if the email already exists)
      const emailToUse = (b.overrideEmail && b.overrideEmail.trim()) || (customer.email || undefined);

      const payload = {
        name: fullName,
        type,                          // 'individual' | 'business'
        email: emailToUse,
        phone: phoneE164,              // must be E.164
        device: { ip_address: ip }     // required
        // Optional: include address here if desired
        // address: {
        //   address1: customer.address1 ?? undefined,
        //   city: customer.city ?? undefined,
        //   state: customer.state ?? undefined,
        //   zip: customer.postal ?? undefined
        // }
      };

      // POST /v1/customers (Straddle Identity)
      const created = await straddlePost('/v1/customers', payload, b.embeddedAccountId || undefined);

      // Accept either { id } or { data: { id } }
      const straddleId: string | undefined =
        (created && (created.id as string)) ||
        (created && created.data && (created.data.id as string));

      if (!straddleId) {
        throw new Error(`Create Customer returned unexpected body: ${JSON.stringify(created)}`);
      }

      // Persist mapping (provider='straddle', externalId = straddleId)
      await prisma.customerExternal.create({
        data: {
          customerId: b.customerId,
          provider: 'straddle',
          externalId: straddleId
        },
      });

      return reply.code(201).send({ straddleCustomerId: straddleId });
    } catch (err: any) {
      const msg = String(err?.message || '');

      // Map Straddle "Email already exists" (uniqueness) to 409 for your UI
      if (msg.includes(' 422 ') && /Email .* already exists/i.test(msg)) {
        return reply.code(409).send({
          error: 'email_in_use',
          message: 'This email already exists in Straddle for this embedded merchant. Use a different email or map the existing Straddle customer.',
          hint: 'Send overrideEmail in the request body (e.g., test+timestamp@example.com) or map the existing customer id.'
        });
      }

      // Map E.164 phone errors to 400 for clarity
      if (msg.includes(' 422 ') && /phone.*E\.164/i.test(msg)) {
        return reply.code(400).send({
          error: 'invalid_phone',
          message: 'Phone must be E.164 (e.g., +13054444444). We attempt to normalize; please verify the stored phone.'
        });
      }

      req.log.error({ err }, 'straddle identity failed');
      return reply.code(500).send({ error: 'server_error', message: msg || 'identity_failed' });
    }
  });
}