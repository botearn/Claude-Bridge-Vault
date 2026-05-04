import { NextRequest, NextResponse } from 'next/server';
import {
  loadCompatUsers,
  mapCompatUser,
  requireCompatAdmin,
  unauthorized,
} from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const p = Number(req.nextUrl.searchParams.get('p') ?? '1');
  const pageSize = Number(req.nextUrl.searchParams.get('page_size') ?? '10');
  const users = (await loadCompatUsers()).map(mapCompatUser);

  const page = Math.max(1, p);
  const size = Math.max(1, pageSize);
  const start = (page - 1) * size;

  return NextResponse.json({
    success: true,
    data: {
      items: users.slice(start, start + size),
      total: users.length,
      page,
      page_size: size,
    },
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }
  return NextResponse.json({ success: false, message: 'Not implemented in compatibility mode' }, { status: 501 });
}

export async function PUT(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }
  return NextResponse.json({ success: false, message: 'Not implemented in compatibility mode' }, { status: 501 });
}
