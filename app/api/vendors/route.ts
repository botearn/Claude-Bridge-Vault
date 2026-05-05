import { NextRequest, NextResponse } from 'next/server';
import {
  createCompatVendorRecord,
  getCompatVendorById,
  listCompatVendorsMapped,
  loadCompatModels,
  loadCompatVendors,
  saveCompatVendor,
} from '@/lib/compat-models';
import { requireCompatAdmin, unauthorized } from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const p = Number(req.nextUrl.searchParams.get('p') ?? '1');
  const pageSize = Number(req.nextUrl.searchParams.get('page_size') ?? '1000');
  const page = Math.max(1, p);
  const size = Math.max(1, pageSize);
  const items = await listCompatVendorsMapped();
  const start = (page - 1) * size;

  return NextResponse.json({
    success: true,
    data: {
      items: items.slice(start, start + size),
      total: items.length,
      page,
      page_size: size,
    },
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const record = createCompatVendorRecord(body);
  if (!record) {
    return NextResponse.json({ success: false, message: 'Vendor name is required' }, { status: 400 });
  }

  const vendors = await loadCompatVendors();
  if (vendors.some((item) => item.name.toLowerCase() === record.name.toLowerCase())) {
    return NextResponse.json({ success: false, message: 'Vendor already exists' }, { status: 409 });
  }

  await saveCompatVendor(record);
  const mapped = await listCompatVendorsMapped();
  const index = mapped.findIndex((item) => item.name === record.name);

  return NextResponse.json({
    success: true,
    data: index >= 0 ? mapped[index] : undefined,
  });
}

export async function PUT(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, message: 'Invalid vendor id' }, { status: 400 });
  }

  const entry = await getCompatVendorById(id);
  if (!entry) {
    return NextResponse.json({ success: false, message: 'Vendor not found' }, { status: 404 });
  }

  const record = createCompatVendorRecord(body, entry.vendor);
  if (!record) {
    return NextResponse.json({ success: false, message: 'Vendor name is required' }, { status: 400 });
  }

  const vendors = await loadCompatVendors();
  if (
    vendors.some(
      (item) => item.id !== entry.vendor.id && item.name.toLowerCase() === record.name.toLowerCase()
    )
  ) {
    return NextResponse.json({ success: false, message: 'Vendor already exists' }, { status: 409 });
  }

  await saveCompatVendor(record);
  const mapped = await listCompatVendorsMapped();

  return NextResponse.json({
    success: true,
    data: mapped[id - 1],
  });
}
