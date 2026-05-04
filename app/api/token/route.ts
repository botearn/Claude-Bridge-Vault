import { NextRequest, NextResponse } from 'next/server';
import {
  loadCompatTokens,
  mapCompatToken,
  requireCompatSession,
  unauthorized,
} from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }

  const p = Number(req.nextUrl.searchParams.get('p') ?? '1');
  const size = Number(req.nextUrl.searchParams.get('size') ?? '10');
  const isAdmin = session.role === 'admin';

  const items = (await loadCompatTokens())
    .map(({ storedKey, key }, idx) => mapCompatToken(storedKey, key, idx, isAdmin, session))
    .filter((item) => item !== null);

  const page = Math.max(1, p);
  const pageSize = Math.max(1, size);
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);

  return NextResponse.json({
    success: true,
    data: {
      items: paged,
      total: items.length,
      page,
      page_size: pageSize,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }
  return NextResponse.json({ success: false, message: 'Not implemented in compatibility mode' }, { status: 501 });
}

export async function PUT(req: NextRequest) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }
  return NextResponse.json({ success: false, message: 'Not implemented in compatibility mode' }, { status: 501 });
}
