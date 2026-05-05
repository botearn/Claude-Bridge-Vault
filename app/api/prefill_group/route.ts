import { NextRequest, NextResponse } from 'next/server';
import {
  createPrefillGroupRecord,
  getPrefillGroupById,
  listPrefillGroupsMapped,
  loadPrefillGroups,
  savePrefillGroup,
} from '@/lib/compat-models';
import { requireCompatAdmin, unauthorized } from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const type = req.nextUrl.searchParams.get('type')?.trim() ?? '';
  const items = (await listPrefillGroupsMapped()).filter((item) => !type || item.type === type);
  return NextResponse.json({ success: true, data: items });
}

export async function POST(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const record = createPrefillGroupRecord(body);
  if (!record) {
    return NextResponse.json({ success: false, message: 'Invalid prefill group payload' }, { status: 400 });
  }

  await savePrefillGroup(record);
  return NextResponse.json({ success: true, message: 'OK' });
}

export async function PUT(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, message: 'Invalid prefill group id' }, { status: 400 });
  }

  const entry = await getPrefillGroupById(id);
  if (!entry) {
    return NextResponse.json({ success: false, message: 'Prefill group not found' }, { status: 404 });
  }

  const record = createPrefillGroupRecord(body, entry.group);
  if (!record) {
    return NextResponse.json({ success: false, message: 'Invalid prefill group payload' }, { status: 400 });
  }

  await savePrefillGroup(record);
  return NextResponse.json({ success: true, message: 'OK' });
}
