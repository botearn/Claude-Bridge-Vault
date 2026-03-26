import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getChannels, getChannelsWithHealth, addChannel, updateChannel, deleteChannel } from '@/lib/channels';
import { isValidVendor } from '@/lib/vendors';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session || session.role !== 'admin') return null;
  return session;
}

/** GET /api/v1/manage/channels?vendor=claude */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const vendor = req.nextUrl.searchParams.get('vendor') ?? undefined;
  if (vendor && !isValidVendor(vendor)) {
    return NextResponse.json({ error: 'Invalid vendor' }, { status: 400 });
  }
  const channels = await getChannels(vendor as Parameters<typeof getChannels>[0]);
  // Mask apiKey — return last 6 chars only
  const masked = channels.map(c => ({ ...c, apiKey: maskKey(c.apiKey) }));
  return NextResponse.json({ channels: masked });
}

/** POST /api/v1/manage/channels — create channel */
export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { vendor, label, apiKey, enabled = true, weight = 1 } = body ?? {};

  if (!isValidVendor(vendor)) return NextResponse.json({ error: 'Invalid vendor' }, { status: 400 });
  if (typeof label !== 'string' || !label.trim()) return NextResponse.json({ error: 'label required' }, { status: 400 });
  if (typeof apiKey !== 'string' || !apiKey.trim()) return NextResponse.json({ error: 'apiKey required' }, { status: 400 });

  const channel = await addChannel({ vendor, label: label.trim(), apiKey: apiKey.trim(), enabled: Boolean(enabled), weight: Number(weight) || 1 });
  return NextResponse.json({ channel: { ...channel, apiKey: maskKey(channel.apiKey) } }, { status: 201 });
}

/** PATCH /api/v1/manage/channels — update channel */
export async function PATCH(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { vendor, id, ...patch } = body ?? {};

  if (!isValidVendor(vendor) || typeof id !== 'string') {
    return NextResponse.json({ error: 'vendor and id required' }, { status: 400 });
  }

  const allowed: Record<string, unknown> = {};
  if (typeof patch.label === 'string') allowed.label = patch.label.trim();
  if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) allowed.apiKey = patch.apiKey.trim();
  if (typeof patch.enabled === 'boolean') allowed.enabled = patch.enabled;
  if (typeof patch.weight === 'number') allowed.weight = patch.weight;

  const updated = await updateChannel(vendor, id, allowed);
  if (!updated) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  return NextResponse.json({ channel: { ...updated, apiKey: maskKey(updated.apiKey) } });
}

/** DELETE /api/v1/manage/channels?vendor=claude&id=xxx */
export async function DELETE(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const vendor = req.nextUrl.searchParams.get('vendor') ?? '';
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!isValidVendor(vendor) || !id) {
    return NextResponse.json({ error: 'vendor and id required' }, { status: 400 });
  }
  await deleteChannel(vendor, id);
  return NextResponse.json({ ok: true });
}

function maskKey(key: string): string {
  if (!key || key.length <= 8) return '***';
  return `${key.slice(0, 4)}...${key.slice(-6)}`;
}
