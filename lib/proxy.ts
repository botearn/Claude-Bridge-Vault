import type { VendorId } from './types';
import { VENDOR_CONFIG } from './vendors';

interface UpstreamRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export function buildUpstreamRequest(
  vendor: VendorId,
  masterKey: string,
  rawBody: string
): UpstreamRequest {
  const config = VENDOR_CONFIG[vendor];

  if (vendor === 'claude') {
    return {
      url: config.endpoint,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': masterKey,
        'anthropic-version': '2023-06-01',
      },
      body: rawBody,
    };
  }

  // yunwu (OpenAI-compatible)
  return {
    url: config.endpoint,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${masterKey}`,
    },
    body: rawBody,
  };
}
