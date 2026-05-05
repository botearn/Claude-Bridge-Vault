import { NextRequest, NextResponse } from 'next/server';
import { requireCompatAdmin, unauthorized } from '@/lib/console-compat';

export async function POST(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  await req.json().catch(() => ({}));

  return NextResponse.json({
    success: true,
    message: 'Upstream sync placeholder completed',
    data: {
      created_models: 0,
      updated_models: 0,
      created_vendors: 0,
      skipped_models: [],
    },
  });
}
