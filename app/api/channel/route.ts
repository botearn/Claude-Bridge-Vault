import { NextRequest, NextResponse } from 'next/server';
import {
  loadCompatChannels,
  mapCompatChannel,
  requireCompatAdmin,
  unauthorized,
} from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const items = (await loadCompatChannels()).map(mapCompatChannel);

  return NextResponse.json({
    success: true,
    data: {
      items,
      total: items.length,
      page: 1,
      page_size: items.length || 10,
      type_counts: {},
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
