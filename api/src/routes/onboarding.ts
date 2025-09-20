import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { hash } from 'bcryptjs';

const STRADDLE_BASE = process.env.STRADDLE_API_BASE!;
const STRADDLE_KEY  = process.env.STRADDLE_API_KEY!;
const STRADDLE_ORG  = process.env.STRADDLE_ORG_ID!; // set in .env

async function straddleCreateAccount(businessName: string, website: string, email?: string) {
  const body: any = {
    organization_id: STRADDLE_ORG,
    account_type: 'business',
    business_profile: { name: businessName, website },
    access_level: 'standard'
  };
  if (email) body.contact_profile = { email };

  const res = await fetch(`${STRADDLE_BASE}/v1/accounts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRADDLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Straddle /v1/accounts ${res.status} ${text}`);
  const json = text ? JSON.parse(text) : {};
  return (json.id as string) || (json.data && json.data.id as string);
}

export async function onboardingRoutes(app: FastifyInstance) {
  // POST /v1/onboarding/signup
  app.post('/onboarding/signup', async (req, reply) => {
    try {
      const { businessName, website, email, password } = req.body as {
        businessName: string, website: string, email: string, password: string
      };
      if (!businessName || !website || !email || !password) {
        return reply.code(400).send({ error: 'missing_fields' });
      }

      // 1) create Merchant
      const merchant = await prisma.merchant.create({
        data: { name: businessName }
      });

      // 2) create owner User with hashed password
      const pwdHash = await hash(password, 12);
      await prisma.user.create({
        data: {
          merchantId: merchant.id,
          firstName: 'Owner',
          lastName:  'Account',
          email,
          role: 'admin',
          // store password hash in an auth table if you separate concerns later
          // for MVP we can keep it here or add a UsersAuth table
          mobile: null
        }
      });

      // 3) call Straddle: POST /v1/accounts (embedded) and save id
      //   – Straddle docs: authenticate with Bearer token; create account; platform model uses
      //     Straddle-Account-Id header for later merchant-scoped calls.  [oai_citation:6‡docs.straddle.io](https://docs.straddle.io/api-reference/authentication?utm_source=chatgpt.com) [oai_citation:7‡straddle.dev](https://straddle.dev/?utm_source=chatgpt.com)
      const embeddedId = await straddleCreateAccount(businessName, website, email);

      if (!embeddedId) throw new Error('No embedded account id returned');
      await prisma.merchant.update({
        where: { id: merchant.id },
        data: { straddleAccountId: embeddedId }
      });

      return reply.code(201).send({
        ok: true,
        merchantId: merchant.id,
        embeddedAccountId: embeddedId
      });
    } catch (err: any) {
      req.log.error({ err }, 'onboarding signup failed');
      return reply.code(500).send({ error: 'server_error', message: err?.message || 'signup_failed' });
    }
  });
}