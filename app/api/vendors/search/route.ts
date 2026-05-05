import { NextRequest, NextResponse } from 'next/server';
import { listCompatVendorsMapped } from '@/lib/compat-models';
import { includesLike, requireCompatAdmin, unauthorized } from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const keyword = req.nextUrl.searchParams.get('keyword')?.trim() ?? '';
  const p = Number(req.nextUrl.searchParams.get('p') ?? '1');
  const pageSize = Number(req.nextUrl.searchParams.get('page_size') ?? '1000');
  const filtered = (await listCompatVendorsMapped()).filter((item) => {
    if (!keyword) return true;
    return [item.name, item.description, item.icon].some((value) => includesLike(value, keyword));
  });
  const page = Math.max(1, p);
  const size = Math.max(1, pageSize);
  const start = (page - 1) * size;

  return NextResponse.json({
    success: true,
    data: {
      items: filtered.slice(start, start + size),
      total: filtered.length,
      page,
      page_size: size,
    },
  });
}
