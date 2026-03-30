import { NextRequest, NextResponse } from 'next/server';

const PAGE_PASSWORD = process.env.ACCOUNTS_PAGE_PASSWORD || 'sitesfy2026';

export async function POST(req: NextRequest) {
  const { password } = await req.json() as { password: string };

  if (password === PAGE_PASSWORD) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: 'Wrong password' }, { status: 403 });
}
