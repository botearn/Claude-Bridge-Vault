import { NextRequest, NextResponse } from 'next/server';
import {
  buildVendorCounts,
  createCompatModelRecord,
  filterModelStatus,
  filterSyncStatus,
  getCompatModelById,
  listCompatModelsMapped,
  loadCompatModels,
  saveCompatModel,
} from '@/lib/compat-models';
import { includesLike, requireCompatAdmin, unauthorized } from '@/lib/console-compat';

function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export async function GET(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const p = Number(req.nextUrl.searchParams.get('p') ?? '1');
  const pageSize = Number(req.nextUrl.searchParams.get('page_size') ?? '20');
  const status = req.nextUrl.searchParams.get('status')?.trim() ?? '';
  const syncOfficial = req.nextUrl.searchParams.get('sync_official')?.trim() ?? '';

  const items = (await listCompatModelsMapped()).filter(
    (item) =>
      filterModelStatus(item.status, status) &&
      filterSyncStatus(item.sync_official, syncOfficial)
  );
  const page = Math.max(1, p);
  const size = Math.max(1, pageSize);

  return NextResponse.json({
    success: true,
    data: {
      items: paginate(items, page, size),
      total: items.length,
      page,
      page_size: size,
      vendor_counts: buildVendorCounts(items),
    },
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const record = await createCompatModelRecord(body);
  if (!record) {
    return NextResponse.json({ success: false, message: 'Model name is required' }, { status: 400 });
  }

  const models = await loadCompatModels();
  if (models.some((item) => item.modelName === record.modelName)) {
    return NextResponse.json({ success: false, message: 'Model already exists' }, { status: 409 });
  }

  await saveCompatModel(record);
  const updated = await loadCompatModels();
  const index = updated.findIndex((item) => item.id === record.id);

  return NextResponse.json({
    success: true,
    data: index >= 0 ? await listCompatModelsMapped().then((items) => items[index]) : undefined,
  });
}

export async function PUT(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const statusOnly = req.nextUrl.searchParams.get('status_only') === 'true';
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, message: 'Invalid model id' }, { status: 400 });
  }

  const entry = await getCompatModelById(id);
  if (!entry) {
    return NextResponse.json({ success: false, message: 'Model not found' }, { status: 404 });
  }

  const payload = statusOnly ? { status: body?.status } : body;
  const record = await createCompatModelRecord(payload, entry.model);
  if (!record) {
    return NextResponse.json({ success: false, message: 'Model name is required' }, { status: 400 });
  }

  const models = await loadCompatModels();
  if (models.some((item) => item.id !== entry.model.id && item.modelName === record.modelName)) {
    return NextResponse.json({ success: false, message: 'Model already exists' }, { status: 409 });
  }

  await saveCompatModel(record);
  const mapped = await listCompatModelsMapped();
  const index = mapped.findIndex((item) => item.id === id);

  return NextResponse.json({
    success: true,
    data: index >= 0 ? mapped[index] : undefined,
  });
}
