// api/src/routes/straddle_bridge.ts
import type { FastifyInstance } from 'fastify';

const STRADDLE_BASE = process.env.STRADDLE_API_BASE!;
const STRADDLE_KEY  = process.env.STRADDLE_API_KEY!;

/**
 * Helper: POST to Straddle with optional embedded account scoping
 */
async function straddlePost(path: string, body: any, embeddedAccountId: string) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${STRADDLE_KEY}`,
    'Content-Type': 'application/json',
    'Straddle-Account-Id': embeddedAccountId, // required when acting for a merchant
  };

  const res = await fetch(`${STRADDLE_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bridge ${path} ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

/**
 * POST /v1/straddle/bridge/session
 * Body: { embeddedAccountId: string, straddleCustomerId: string }
 * Calls Straddle Bridge initialize to get widget config (session) for this customer.
 *
 * Straddle API reference lists Bridge operations under /v1/bridge/* including /v1/bridge/initialize.  [oai_citation:1‡Straddle](https://straddle.dev/)
 */
export async function straddleBridgeRoutes(app: FastifyInstance) {
  app.post('/straddle/bridge/session', async (req, reply) => {
    try {
      const { embeddedAccountId, straddleCustomerId } = req.body as {
        embeddedAccountId: string;
        straddleCustomerId: string;
      };
      if (!embeddedAccountId || !straddleCustomerId) {
        return reply.code(400).send({ error: 'missing_fields' });
      }

      // Minimal working payload; your tenant may allow/require additional fields (e.g., redirect URLs)
      const body = {
        customer_id: straddleCustomerId
        // e.g., you could add:
        // success_url: 'https://yourapp.example/bridge/success',
        // cancel_url:  'https://yourapp.example/bridge/cancel'
      };

      // Correct endpoint per Straddle API reference
      const session = await straddlePost('/v1/bridge/initialize', body, embeddedAccountId); //  [oai_citation:2‡Straddle](https://straddle.dev/)
      return reply.code(200).send(session);
    } catch (err: any) {
      req.log.error({ err }, 'bridge session init failed');
      return reply.code(500).send({ error: 'server_error', message: err?.message || 'bridge_session_failed' });
    }
  });
}