import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    if (!password) {
      return new NextResponse('Missing password', { status: 400 });
    }

    if (password !== process.env.STAGING_PASSWORD) {
      return new NextResponse('Invalid password', { status: 401 });
    }

    const res = new NextResponse(null, { status: 200 });
    res.cookies.set('staging_auth', '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours
    });
    return res;

  } catch {
    return new NextResponse('Bad request', { status: 400 });
  }
}
