import jwt from 'jsonwebtoken';

const SECRET = process.env.PUBLIC_LINK_SECRET!;
const TTL_MIN = parseInt(process.env.PUBLIC_LINK_TTL_MIN || '60', 10);

export type PayLinkClaims = { invoiceId: string; exp: number };

export function signPayLink(invoiceId: string, ttlMin = TTL_MIN) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlMin * 60;
  return jwt.sign({ invoiceId, exp }, SECRET, { algorithm: 'HS256' });
}

export function verifyPayLink(token: string): PayLinkClaims {
  return jwt.verify(token, SECRET, { algorithms: ['HS256'] }) as PayLinkClaims;
}
