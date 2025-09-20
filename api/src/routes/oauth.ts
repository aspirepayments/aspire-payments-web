import type { FastifyInstance } from 'fastify';

export async function oauthRoutes(app: FastifyInstance) {
  // Minimal stub: returns a fake token for client_credentials
  app.post('/oauth/token', async (req, reply) => {
    return { access_token: 'dev-token', token_type: 'bearer', expires_in: 3600 };
  });
}
