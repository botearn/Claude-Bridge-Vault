import { NextRequest, NextResponse } from 'next/server';
import {
  buildVendorCounts,
  filterModelStatus,
  filterSyncStatus,
  listCompatModelsMapped,
} from '@/lib/compat-models';
import { includesLike, requireCompatAdmin, unauthorized } from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const keyword = req.nextUrl.searchParams.get('keyword')?.trim() ?? '';
  const vendor = req.nextUrl.searchParams.get('vendor')?.trim() ?? '';
  const status = req.nextUrl.searchParams.get('status')?.trim() ?? '';
  const syncOfficial = req.nextUrl.searchParams.get('sync_official')?.trim() ?? '';
  const p = Number(req.nextUrl.searchParams.get('p') ?? '1');
  const pageSize = Number(req.nextUrl.searchParams.get('page_size') ?? '20');

  const filtered = (await listCompatModelsMapped()).filter((item) => {
    if (
      keyword &&
      ![item.model_name, item.description, item.tags, item.icon].some((value) => includesLike(value, keyword))
    ) {
      return false;
    }
    if (vendor && String(item.vendor_id ?? '') !== vendor) {
      return false;
    }
    if (!filterModelStatus(item.status, status)) {
      return false;
    }
    if (!filterSyncStatus(item.sync_official, syncOfficial)) {
      return false;
    }
    return true;
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
      vendor_counts: buildVendorCounts(filtered),
    },
  });
}
