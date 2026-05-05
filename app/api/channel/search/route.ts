import { NextRequest, NextResponse } from 'next/server';
import {
  includesLike,
  loadCompatChannels,
  mapCompatChannel,
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
  const model = req.nextUrl.searchParams.get('model')?.trim() ?? '';
  const status = req.nextUrl.searchParams.get('status')?.trim() ?? '';
  const type = req.nextUrl.searchParams.get('type')?.trim() ?? '';
  const p = Number(req.nextUrl.searchParams.get('p') ?? '1');
  const pageSize = Number(req.nextUrl.searchParams.get('page_size') ?? '20');
  const idSort = req.nextUrl.searchParams.get('id_sort') === 'true';

  const items = (await loadCompatChannels())
    .map(mapCompatChannel)
    .filter((item) => {
      if (keyword && ![item.name, item.key, item.other_info, item.models].some((v) => includesLike(v, keyword))) {
        return false;
      }
      if (model && !includesLike(item.models, model)) {
        return false;
      }
      if (group && item.group !== group) {
        return false;
      }
      if (status === 'enabled' && item.status !== 1) {
        return false;
      }
      if (status === 'disabled' && item.status === 1) {
        return false;
      }
      if (type && String(item.type) !== type) {
        return false;
      }
      return true;
    });

  const sorted = [...items].sort((a, b) => {
    if (idSort) return a.id - b.id;
    return b.created_time - a.created_time;
  });
  const typeCounts = sorted.reduce<Record<string, number>>((acc, item) => {
    acc[String(item.type)] = (acc[String(item.type)] ?? 0) + 1;
    return acc;
  }, {});
  const page = Math.max(1, p);
  const size = Math.max(1, pageSize);
  const start = (page - 1) * size;

  return NextResponse.json({
    success: true,
    data: {
      items: sorted.slice(start, start + size),
      total: sorted.length,
      type_counts: typeCounts,
    },
  });
}
