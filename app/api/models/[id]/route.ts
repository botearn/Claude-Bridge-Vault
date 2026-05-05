import { NextRequest, NextResponse } from 'next/server';
import {
  deleteCompatModel,
  getCompatModelById,
  mapCompatModel,
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
  const entry = await getCompatModelById(Number(id));
  if (!entry) {
    return NextResponse.json({ success: false, message: 'Model not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: await mapCompatModel(entry.model, entry.index),
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
  const entry = await getCompatModelById(Number(id));
  if (!entry) {
    return NextResponse.json({ success: false, message: 'Model not found' }, { status: 404 });
  }

  await deleteCompatModel(entry.model.id);
  return NextResponse.json({ success: true, message: 'OK' });
}
