import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  // Clear cookie
  const res = new NextResponse(null, { status: 302 });
  res.cookies.set('staging_auth', '', { path: '/', maxAge: 0 });

  // Redirect back to the sign-in page
  const url = new URL('/auth/signin', req.url);
  res.headers.set('Location', url.toString());
  return res;
}