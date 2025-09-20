import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import { registerRoutes } from './server.js'; // ESM wants an extension; tsx maps .js -> .ts

const app = Fastify({ logger: true, maxParamLength: 2048 });

await app.register(cors, {
  origin: 'http://localhost:3031',
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
});

await app.register(cookie);
await app.register(formbody);
await registerRoutes(app);

await app.ready();
app.printRoutes(); // prints actual URLs and any /v1 prefix after routes are loaded

const port = Number(process.env.PORT || 3000);
app.listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`API listening at http://localhost:${port}`))
  .catch((err) => { app.log.error(err); process.exit(1); });
