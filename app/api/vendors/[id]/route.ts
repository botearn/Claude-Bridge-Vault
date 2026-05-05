import { NextRequest, NextResponse } from 'next/server';
import {
  deleteCompatVendor,
  getCompatVendorById,
  listCompatVendorsMapped,
  loadCompatModels,
  mapCompatVendor,
} from '@/lib/compat-models';
import { requireCompatAdmin, unauthorized } from '@/lib/console-compat';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const { id } = await context.params;
  const entry = await getCompatVendorById(Number(id));
  if (!entry) {
    return NextResponse.json({ success: false, message: 'Vendor not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: mapCompatVendor(entry.vendor, entry.index),
  });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const { id } = await context.params;
  const entry = await getCompatVendorById(Number(id));
  if (!entry) {
    return NextResponse.json({ success: false, message: 'Vendor not found' }, { status: 404 });
  }

  const models = await loadCompatModels();
  if (models.some((model) => model.vendorKey === entry.vendor.id)) {
    return NextResponse.json(
      { success: false, message: 'Vendor is still referenced by existing models' },
      { status: 409 }
    );
  }

  await deleteCompatVendor(entry.vendor.id);
  return NextResponse.json({ success: true, message: 'OK' });
}
