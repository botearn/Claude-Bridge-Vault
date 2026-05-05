import { NextRequest, NextResponse } from 'next/server';
import {
  compatChannelTypeToVendor,
  getCompatModelsForVendor,
  requireCompatAdmin,
  unauthorized,
} from '@/lib/console-compat';

export async function POST(req: NextRequest) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const type = Number(body?.type);
  const vendor = compatChannelTypeToVendor(type);

  if (!vendor) {
    return NextResponse.json(
      { success: false, message: 'Unsupported channel type in compatibility mode' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: getCompatModelsForVendor(vendor),
  });
}
