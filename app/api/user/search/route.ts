import { NextRequest, NextResponse } from 'next/server';
import {
  includesLike,
  loadCompatUsers,
  mapCompatUser,
  requireCompatAdmin,
  unauthorized,
} from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  const keyword = req.nextUrl.searchParams.get('keyword')?.trim() ?? '';
  const group = req.nextUrl.searchParams.get('group')?.trim() ?? '';
  const p = Number(req.nextUrl.searchParams.get('p') ?? '1');
  const pageSize = Number(req.nextUrl.searchParams.get('page_size') ?? '10');

  const filtered = (await loadCompatUsers())
    .filter((user) => {
      if (keyword && ![user.email, user.name, user.id].some((v) => includesLike(String(v), keyword))) {
        return false;
      }
      if (group) {
        const mappedGroup = user.role === 'admin' ? 'admin' : 'default';
        if (mappedGroup !== group) {
          return false;
        }
      }
      return true;
    })
    .map((user, index) => mapCompatUser(user, index));

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
