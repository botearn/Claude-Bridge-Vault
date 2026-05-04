import { NextRequest, NextResponse } from 'next/server';
import {
  includesLike,
  loadCompatTokens,
  mapCompatToken,
  requireCompatSession,
  unauthorized,
} from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }

  const keyword = req.nextUrl.searchParams.get('keyword')?.trim() ?? '';
  const tokenQuery = req.nextUrl.searchParams.get('token')?.trim() ?? '';
  const isAdmin = session.role === 'admin';

  const items = (await loadCompatTokens())
    .map(({ storedKey, key }, index) => mapCompatToken(storedKey, key, index, isAdmin, session))
    .filter((item) => item !== null)
    .filter((item) => {
      if (keyword && !includesLike(item.name, keyword)) {
        return false;
      }
      if (tokenQuery && !includesLike(item.key, tokenQuery)) {
        return false;
      }
      return true;
    });

  return NextResponse.json({
    success: true,
    data: items,
  });
}
