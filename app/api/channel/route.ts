import { NextRequest, NextResponse } from 'next/server';
import {
  compatChannelPayloadToRecord,
  getCompatChannelById,
  includesLike,
  loadCompatChannels,
  mapCompatChannel,
  requireCompatAdmin,
  unauthorized,
} from '@/lib/console-compat';
import { addChannel, updateChannel } from '@/lib/channels';

export async function GET(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const p = Number(req.nextUrl.searchParams.get('p') ?? '1');
  const pageSize = Number(req.nextUrl.searchParams.get('page_size') ?? '20');
  const group = req.nextUrl.searchParams.get('group')?.trim() ?? '';
  const status = req.nextUrl.searchParams.get('status')?.trim() ?? '';
  const type = req.nextUrl.searchParams.get('type')?.trim() ?? '';
  const keyword = req.nextUrl.searchParams.get('keyword')?.trim() ?? '';
  const idSort = req.nextUrl.searchParams.get('id_sort') === 'true';

  const items = (await loadCompatChannels())
    .map(mapCompatChannel)
    .filter((item) => {
      if (keyword && ![item.name, item.key, item.other_info, item.models].some((v) => includesLike(v, keyword))) {
        return false;
      }
      if (group && item.group !== group) {
        return false;
      }
      if (status === 'enabled' && item.status !== 1) {
        return false;
      }
      if (status === 'disabled' && item.status === 1) {
        return false;
      }
      if (type && String(item.type) !== type) {
        return false;
      }
      return true;
    });

  const sorted = [...items].sort((a, b) => {
    if (idSort) return a.id - b.id;
    return b.created_time - a.created_time;
  });
  const page = Math.max(1, p);
  const size = Math.max(1, pageSize);
  const start = (page - 1) * size;
  const typeCounts = sorted.reduce<Record<string, number>>((acc, item) => {
    acc[String(item.type)] = (acc[String(item.type)] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    success: true,
    data: {
      items: sorted.slice(start, start + size),
      total: sorted.length,
      page,
      page_size: size,
      type_counts: typeCounts,
    },
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const channelPayload = body?.channel ?? body;
  const record = compatChannelPayloadToRecord(channelPayload);
  if (!record || !record.apiKey) {
    return NextResponse.json(
      { success: false, message: 'Unsupported channel type or missing key' },
      { status: 400 }
    );
  }

  const created = await addChannel(record);
  const channels = await loadCompatChannels();
  const index = channels.findIndex((item) => item.id === created.id);
  const withHealth = channels[index];

  return NextResponse.json({
    success: true,
    data: withHealth ? mapCompatChannel(withHealth, index) : undefined,
  });
}

export async function PUT(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, message: 'Invalid channel id' }, { status: 400 });
  }

  const entry = await getCompatChannelById(id);
  if (!entry) {
    return NextResponse.json({ success: false, message: 'Channel not found' }, { status: 404 });
  }

  const record = compatChannelPayloadToRecord(body, entry.channel);
  if (!record) {
    return NextResponse.json({ success: false, message: 'Unsupported channel type' }, { status: 400 });
  }

  const updated = await updateChannel(entry.channel.vendor, entry.channel.id, {
    label: record.label,
    apiKey: record.apiKey,
    enabled: record.enabled,
    weight: record.weight,
    type: record.type,
    baseUrl: record.baseUrl,
    openaiOrganization: record.openaiOrganization,
    testModel: record.testModel,
    models: record.models,
    group: record.group,
    modelMapping: record.modelMapping,
    statusCodeMapping: record.statusCodeMapping,
    priority: record.priority,
    autoBan: record.autoBan,
    other: record.other,
    tag: record.tag,
    setting: record.setting,
    paramOverride: record.paramOverride,
    headerOverride: record.headerOverride,
    remark: record.remark,
    maxInputTokens: record.maxInputTokens,
    settings: record.settings,
  });

  if (!updated) {
    return NextResponse.json({ success: false, message: 'Channel not found' }, { status: 404 });
  }

  const channels = await loadCompatChannels();
  const index = channels.findIndex((item) => item.id === entry.channel.id);
  return NextResponse.json({
    success: true,
    data: index >= 0 ? mapCompatChannel(channels[index], index) : undefined,
  });
}
