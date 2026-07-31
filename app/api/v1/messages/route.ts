import { NextRequest } from 'next/server';
import { proxyUnifiedRequest } from '@/lib/unified-proxy';

export async function POST(req: NextRequest) {
  return proxyUnifiedRequest(req, 'v1/messages');
}
