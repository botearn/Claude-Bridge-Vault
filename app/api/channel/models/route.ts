import { NextRequest, NextResponse } from 'next/server';
import {
  getAllCompatModels,
  requireCompatAdmin,
  unauthorized,
} from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  return NextResponse.json({
    success: true,
    data: getAllCompatModels(),
  });
}
