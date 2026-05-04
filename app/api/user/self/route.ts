import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    data: {
      id: Number(session.userId) || 1,
      username: session.email,
      display_name: session.name,
      email: session.email,
      role: session.role === 'admin' ? 10 : 1,
      status: 1,
      group: session.role === 'admin' ? 'admin' : 'default',
      quota: 0,
      used_quota: 0,
      request_count: 0,
      aff_code: '',
      aff_count: 0,
      aff_quota: 0,
      aff_history_quota: 0,
      inviter_id: 0,
      setting: {},
      permissions: {
        sidebar_settings: true,
      },
    },
  });
}
