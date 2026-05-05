import { NextRequest, NextResponse } from 'next/server';
import { getMissingModelNames } from '@/lib/compat-models';
import { requireCompatAdmin, unauthorized } from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  return NextResponse.json({
    success: true,
    data: await getMissingModelNames(),
  });
}
