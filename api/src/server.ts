// api/src/server.ts
import type { FastifyInstance } from 'fastify';

// Route groups (extension-less so tsx resolves .ts files)
import { paymentsRoutes }          from './routes/payments.ts';
import { webhooksRoutes }          from './routes/webhooks.ts';
import { bankRoutes }              from './routes/bank.ts';
import { oauthRoutes }             from './routes/oauth.ts';
import { merchantsRoutes }         from './routes/merchants.ts';
import { customersRoutes }         from './routes/customers.ts';
import { itemsRoutes }             from './routes/items.ts';
// ❌ removed: import { invoicesCreateRoutes }  from './routes/invoices_create.ts';
import { invoicesRoutes }          from './routes/invoices.ts';
import { settingsRoutes }          from './routes/settings.ts';
import { usersRoutes }             from './routes/users.ts';
import paymentMethodsRoutes        from './routes/payment_methods.ts';
import { chargesRoutes }           from './routes/charges.ts';
import { straddleIdentityRoutes }  from './routes/straddle_identity.ts';
import { straddlePaykeysRoutes }   from './routes/straddle_paykeys.ts';
import { straddlePaymentsRoutes }  from './routes/straddle_payments.ts';
import { straddleBridgeRoutes }    from './routes/straddle_bridge.ts';
import { straddleWebhooksRoutes }  from './routes/straddle_webhooks.ts';
import { straddlePayoutsRoutes }   from './routes/straddle_payouts.ts';
import { straddleAccountsRoutes }  from './routes/straddle_accounts.ts';
import { onboardingRoutes }        from './routes/onboarding.ts';
import { settingsTermsRoutes }     from './routes/settings_terms.ts';
import { invoicesPublicRoutes }    from './routes/invoices_public.ts';

export async function registerRoutes(app: FastifyInstance) {
  // Health
  app.get('/health', async () => ({ ok: true }));

  // OAuth / Bank
  await app.register(oauthRoutes,           { prefix: '/v1' });
  await app.register(bankRoutes,            { prefix: '/v1' });

  await app.register(straddleIdentityRoutes,{ prefix: '/v1' });
  await app.register(straddlePaykeysRoutes, { prefix: '/v1' });
  await app.register(straddlePaymentsRoutes,{ prefix: '/v1' });
  await app.register(straddleBridgeRoutes,  { prefix: '/v1' });
  await app.register(straddleWebhooksRoutes,{ prefix: '/v1' });
  await app.register(straddlePayoutsRoutes, { prefix: '/v1' });
  await app.register(straddleAccountsRoutes,{ prefix: '/v1' });
  await app.register(onboardingRoutes,      { prefix: '/v1' });
 
  // Core resources
  await app.register(paymentsRoutes,        { prefix: '/v1' });
  await app.register(webhooksRoutes,        { prefix: '/v1' });
  await app.register(merchantsRoutes,       { prefix: '/v1' });
  await app.register(customersRoutes,       { prefix: '/v1' });
  await app.register(itemsRoutes,           { prefix: '/v1' });

  // Invoices (create + list/detail/edit)
  // ❌ removed: await app.register(invoicesCreateRoutes,  { prefix: '/v1' });
  await app.register(invoicesRoutes,        { prefix: '/v1' });

  // Settings + Users
  await app.register(settingsRoutes,        { prefix: '/v1' });
  await app.register(usersRoutes,           { prefix: '/v1' });
  await app.register(paymentMethodsRoutes,  { prefix: '/v1' });
  await app.register(chargesRoutes,         { prefix: '/v1' });

  // Terms + public invoice helpers
  await app.register(settingsTermsRoutes,   { prefix: '/v1' });
  await app.register(invoicesPublicRoutes,  { prefix: '/v1' });
}