import { NextRequest, NextResponse } from 'next/server';
import { deletePrefillGroup, getPrefillGroupById } from '@/lib/compat-models';
import { requireCompatAdmin, unauthorized } from '@/lib/console-compat';

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const { id } = await context.params;
  const entry = await getPrefillGroupById(Number(id));
  if (!entry) {
    return NextResponse.json({ success: false, message: 'Prefill group not found' }, { status: 404 });
  }

  await deletePrefillGroup(entry.group.id);
  return NextResponse.json({ success: true, message: 'OK' });
}
