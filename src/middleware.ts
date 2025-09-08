import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;

const WHITELIST = [
  '/auth/signin',
  '/api/auth/staging',         // sign-in API
  '/api/auth/staging/logout',  // sign-out API
  '/favicon.ico',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_FILE.test(pathname) || WHITELIST.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get('staging_auth');
  if (cookie?.value === '1') return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/auth/signin';
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}
