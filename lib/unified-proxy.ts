import { NextRequest, NextResponse } from 'next/server';
import { isValidVendor } from './vendors';

export async function proxyUnifiedRequest(req: NextRequest, upstreamPath: string) {
  const rawBody = await req.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const modelId = typeof parsed.model === 'string' ? parsed.model : '';
  const separator = modelId.indexOf('/');
  const vendor = separator > 0 ? modelId.slice(0, separator) : '';
  const upstreamModel = separator > 0 ? modelId.slice(separator + 1) : '';
  if (!isValidVendor(vendor) || !upstreamModel) {
    return NextResponse.json(
      { error: 'Model must use the catalog id format provider/model' },
      { status: 400 },
    );
  }

  parsed.model = upstreamModel;
  const target = new URL(`/api/v1/${vendor}/${upstreamPath}`, req.nextUrl.origin);
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  const authorization = req.headers.get('authorization');
  const apiKey = req.headers.get('x-api-key');
  if (authorization) headers.set('Authorization', authorization);
  if (apiKey) headers.set('x-api-key', apiKey);

  const response = await fetch(target, {
    method: 'POST',
    headers,
    body: JSON.stringify(parsed),
  });
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
