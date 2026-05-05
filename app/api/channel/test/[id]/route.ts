import { NextRequest, NextResponse } from 'next/server';
import { buildBedrockConverseRequest } from '@/lib/bedrock';
import {
  getCompatChannelById,
  requireCompatAdmin,
  unauthorized,
} from '@/lib/console-compat';
import {
  recordChannelFailure,
  recordChannelSuccess,
} from '@/lib/channels';
import { buildUpstreamRequest } from '@/lib/proxy';

function getProbeModel(channel: { vendor: string; testModel?: string | null }) {
  if (channel.testModel) return channel.testModel;
  if (channel.vendor === 'amazon') {
    return 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
  }
  if (channel.vendor === 'palebluedot') {
    return 'anthropic/claude-haiku-4.5';
  }
  if (channel.vendor === 'clawos' || channel.vendor === 'clawos-overseas') {
    return 'qwen3.5-flash';
  }
  return 'claude-haiku-4-5-20251001';
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  const { id } = await context.params;
  const entry = await getCompatChannelById(Number(id));
  if (!entry) {
    return NextResponse.json({ success: false, message: 'Channel not found' }, { status: 404 });
  }

  const model = req.nextUrl.searchParams.get('model')?.trim() || getProbeModel(entry.channel);
  const startedAt = Date.now();
  const probeBody = JSON.stringify({
    model,
    max_tokens: 1,
    messages: [{ role: 'user', content: 'hi' }],
  });

  try {
    const upstream =
      entry.channel.vendor === 'amazon'
        ? buildBedrockConverseRequest(
            entry.channel.apiKey,
            probeBody,
            entry.channel.baseUrl || undefined
          )
        : buildUpstreamRequest(entry.channel.vendor, entry.channel.apiKey, probeBody);

    const res = await fetch(upstream.url, {
      method: 'POST',
      headers: upstream.headers,
      body: upstream.body,
      signal: AbortSignal.timeout(10000),
    });

    const responseTime = Date.now() - startedAt;
    if (res.ok || res.status === 400) {
      await recordChannelSuccess(entry.channel.id);
      return NextResponse.json({
        success: true,
        data: { response_time: responseTime },
      });
    }

    await recordChannelFailure(entry.channel.id, `HTTP ${res.status}`);
    return NextResponse.json({
      success: false,
      message: `Upstream responded with HTTP ${res.status}`,
      error_code: String(res.status),
      data: { response_time: responseTime, error: `HTTP ${res.status}` },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Probe failed';
    await recordChannelFailure(entry.channel.id, message);
    return NextResponse.json({
      success: false,
      message,
      data: { error: message },
    });
  }
}
