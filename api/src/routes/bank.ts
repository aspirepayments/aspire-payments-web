import type { FastifyInstance } from 'fastify';

export async function bankRoutes(app: FastifyInstance) {
  app.post('/bank-accounts/link-token', async (req, reply) => {
    // TODO: call Plaid link token create
    return { link_token: 'plaid-link-token-stub', expiration: new Date(Date.now()+3600_000).toISOString() };
  });
}
