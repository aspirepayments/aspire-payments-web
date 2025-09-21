// api/src/routes/onboarding.ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { hash } from 'bcryptjs';

// Optional Straddle embedded account creation (skips if envs missing)
async function straddleCreateAccount(businessName: string, website: string, email?: string) {
  const STRADDLE_BASE = process.env.STRADDLE_API_BASE;
  const STRADDLE_KEY  = process.env.STRADDLE_API_KEY;
  const STRADDLE_ORG  = process.env.STRADDLE_ORG_ID;
  if (!STRADDLE_BASE || !STRADDLE_KEY || !STRADDLE_ORG) return null;

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
  return (json.id as string) || (json.data && json.data.id as string) || null;
}

export async function onboardingRoutes(app: FastifyInstance) {
  // GET /v1/health
  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  // POST /v1/onboarding/signup
  app.post('/onboarding/signup', async (req, reply) => {
    try {
      const { businessName, website, email, password } = req.body as {
        businessName: string; website: string; email: string; password: string;
      };
      if (!businessName || !website || !email || !password) {
        return reply.code(400).send({ error: 'missing_fields' });
      }

      // 1) Merchant
      const merchant = await prisma.merchant.create({ data: { name: businessName } });

      // 2) Admin user
      const pwdHash = await hash(password, 12);
      await prisma.user.create({
        data: {
          merchantId: merchant.id,
          firstName: 'Owner',
          lastName: 'Account',
          email,
          role: 'admin',
          passwordHash: pwdHash,
          mobile: null
        }
      });

      // 3) Optional Straddle account
      let embeddedId: string | null = null;
      try {
        embeddedId = await straddleCreateAccount(businessName, website, email);
        if (embeddedId) {
          await prisma.merchant.update({
            where: { id: merchant.id },
            data: { straddleAccountId: embeddedId }
          });
        }
      } catch (e) {
        req.log?.warn?.({ err: e }, 'Straddle account creation failed; continuing without embedded id');
      }

      return reply.code(201).send({ ok: true, merchantId: merchant.id, embeddedAccountId: embeddedId });
    } catch (err: any) {
      req.log?.error?.({ err }, 'onboarding signup failed');
      return reply.code(500).send({ error: 'server_error', message: err?.message || 'signup_failed' });
    }
  });
}