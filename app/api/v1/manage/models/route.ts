import { NextRequest, NextResponse } from 'next/server';
import { isValidVendor, VENDOR_CONFIG, VENDOR_MODELS } from '@/lib/vendors';
import type { VendorId } from '@/lib/types';

export async function GET(req: NextRequest) {
  const vendor = req.nextUrl.searchParams.get('vendor') as string;

  if (!vendor || !isValidVendor(vendor)) {
    return NextResponse.json({ error: 'Invalid vendor' }, { status: 400 });
  }

  return NextResponse.json({
    models: VENDOR_MODELS[vendor as VendorId],
    cached: false,
  });
}
