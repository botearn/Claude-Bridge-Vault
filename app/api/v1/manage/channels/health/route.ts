import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import {
  getChannelsWithHealth,
  resetChannelHealth,
  recordChannelSuccess,
  recordChannelFailure,
} from '@/lib/channels';
import { buildBedrockConverseRequest } from '@/lib/bedrock';
import { buildUpstreamRequest } from '@/lib/proxy';
import { isValidVendor, VENDOR_CONFIG } from '@/lib/vendors';

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  return session?.role === 'admin' ? session : null;
}

/** GET /api/v1/manage/channels/health?vendor=claude
 *  Returns all channels with their health data.
 */
export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const vendor = req.nextUrl.searchParams.get('vendor') ?? undefined;
  if (vendor && !isValidVendor(vendor)) return NextResponse.json({ error: 'Invalid vendor' }, { status: 400 });

  const channels = await getChannelsWithHealth(vendor as Parameters<typeof getChannelsWithHealth>[0]);
  return NextResponse.json({ channels: channels.map(maskKey) });
}

/** POST /api/v1/manage/channels/health
 *  Body: { action: 'reset', id: string }           — reset circuit breaker
 *      | { action: 'probe', id: string }            — send one test request
 */
export async function POST(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { action, id } = body ?? {};

  if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  if (action === 'reset') {
    await resetChannelHealth(id);
    return NextResponse.json({ ok: true, message: 'Circuit breaker reset' });
  }

  if (action === 'probe') {
    const channels = await getChannelsWithHealth();
    const ch = channels.find(c => c.id === id);
    if (!ch) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

    // Minimal probe: send a tiny message to the vendor (model varies by vendor ID scheme)
    const probeModel =
      ch.vendor === 'palebluedot' ? 'anthropic/claude-haiku-4.5' :
      ch.vendor === 'clawos'      ? 'qwen3.5-flash' :
      ch.vendor === 'clawos-overseas' ? 'qwen3.5-flash' :
      ch.vendor === 'amazon'      ? 'us.anthropic.claude-haiku-4-5-20251001-v1:0' :
      'claude-haiku-4-5-20251001';
    const probeBody = JSON.stringify({
      model: probeModel,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    });

    try {
      const upstream = ch.vendor === 'amazon'
        ? buildBedrockConverseRequest(ch.apiKey, probeBody, VENDOR_CONFIG.amazon.baseUrl)
        : buildUpstreamRequest(ch.vendor, ch.apiKey, probeBody);

      const res = await fetch(upstream.url, {
        method: 'POST',
        headers: upstream.headers,
        body: upstream.body,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok || res.status === 400) {
        // 400 = bad request but key is valid/reachable
        await recordChannelSuccess(id);
        return NextResponse.json({ ok: true, status: res.status, healthy: true });
      } else {
        await recordChannelFailure(id, `HTTP ${res.status}`);
        return NextResponse.json({ ok: true, status: res.status, healthy: false });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'timeout';
      await recordChannelFailure(id, msg);
      return NextResponse.json({ ok: true, status: null, healthy: false, error: msg });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

function maskKey<T extends { apiKey: string }>(ch: T): T {
  const k = ch.apiKey;
  return { ...ch, apiKey: k.length > 8 ? `${k.slice(0, 4)}...${k.slice(-6)}` : '***' };
}
