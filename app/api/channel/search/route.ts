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
  const status = req.nextUrl.searchParams.get('status')?.trim() ?? '';
  const type = req.nextUrl.searchParams.get('type')?.trim() ?? '';

  const items = (await loadCompatChannels())
    .map(mapCompatChannel)
    .filter((item) => {
      if (keyword && ![item.name, item.key, item.other_info].some((v) => includesLike(v, keyword))) {
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

  return NextResponse.json({
    success: true,
    data: {
      items,
      total: items.length,
      type_counts: {},
    },
  });
}
