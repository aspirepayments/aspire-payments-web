// api/src/routes/straddle_accounts.ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

const STRADDLE_BASE = process.env.STRADDLE_API_BASE!;
const STRADDLE_KEY  = process.env.STRADDLE_API_KEY!;
const STRADDLE_ORG  = process.env.STRADDLE_ORG_ID!;

async function postStraddle(path: string, body: any) {
  const res = await fetch(`${STRADDLE_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRADDLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body ?? {})
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Straddle ${path} ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

async function getStraddle(path: string, embeddedAccountId: string) {
  const res = await fetch(`${STRADDLE_BASE}${path}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${STRADDLE_KEY}`,
      'Content-Type': 'application/json',
      'Straddle-Account-Id': embeddedAccountId // scope as the merchant account
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Straddle ${path} ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

/**
 * POST /v1/straddle/accounts
 * body: { merchantId, businessName, website, email? }
 * Creates an embedded account via Straddle POST /v1/accounts and saves the returned id.
 */
export async function straddleAccountsRoutes(app: FastifyInstance) {
  app.post('/straddle/accounts', async (req, reply) => {
    try {
      const { merchantId, businessName, website, email } = req.body as {
        merchantId: string; businessName: string; website: string; email?: string;
      };
      if (!merchantId || !businessName || !website) {
        return reply.code(400).send({ error: 'missing_fields' });
      }

      const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
      if (!merchant) return reply.code(404).send({ error: 'merchant_not_found' });

      // If it already exists, short-circuit
      if (merchant.straddleAccountId) {
        return reply.code(200).send({ embeddedAccountId: merchant.straddleAccountId, reused: true });
      }

      // Straddle create account (docs: POST /v1/accounts). Provide organization_id + business_profile.
      const body = {
        organization_id: STRADDLE_ORG,
        account_type: 'business',
        business_profile: {
          name: businessName,
          website
        },
        // Optional contact profile
        contact_profile: email ? { email } : undefined,
        access_level: 'standard'
      };

      const created = await postStraddle('/v1/accounts', body); //  [oai_citation:2‡docs.straddle.io](https://docs.straddle.io/api-reference/accounts/create?utm_source=chatgpt.com)

      // Accept either { id } or { data: { id } }
      const acctId =
        (created && created.id) ||
        (created && created.data && created.data.id);

      if (!acctId) throw new Error(`Unexpected create-account response: ${JSON.stringify(created)}`);

      await prisma.merchant.update({
        where: { id: merchantId },
        data: { straddleAccountId: acctId }
      });

      return reply.code(201).send({ embeddedAccountId: acctId });
    } catch (err: any) {
      req.log.error({ err }, 'create embedded account failed');
      return reply.code(500).send({ error: 'server_error', message: err?.message || 'create_failed' });
    }
  });

  /**
   * GET /v1/straddle/accounts/:merchantId
   * Returns the embedded account id stored locally and a lightweight capability snapshot from Straddle (if available).
   */
  app.get('/straddle/accounts/:merchantId', async (req, reply) => {
    try {
      const { merchantId } = req.params as { merchantId: string };
      const m = await prisma.merchant.findUnique({ where: { id: merchantId } });
      if (!m) return reply.code(404).send({ error: 'merchant_not_found' });
      if (!m.straddleAccountId) return reply.code(200).send({ embeddedAccountId: null });

      // Example: hit a small account/capability endpoint (if exposed) or return local-only if none.
      // If Straddle has an account-read endpoint you can use: adjust path accordingly.
      // const acct = await getStraddle('/v1/accounts/current', m.straddleAccountId);
      // For now return the id; UI can still show “Connected” with this.
      return reply.code(200).send({ embeddedAccountId: m.straddleAccountId });
    } catch (err: any) {
      req.log.error({ err }, 'read embedded account failed');
      return reply.code(500).send({ error: 'server_error', message: err?.message || 'read_failed' });
    }
  });
}