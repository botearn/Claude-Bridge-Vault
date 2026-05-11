import type { VendorId } from './types';
import { VENDOR_CONFIG } from './vendors';

export interface UpstreamRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  isAnthropicFormat: boolean;
}

export function buildUpstreamRequest(
  vendor: VendorId,
  masterKey: string,
  rawBody: string,
  incomingPath?: string,
): UpstreamRequest {
  const config = VENDOR_CONFIG[vendor];

  // Pass through explicit upstream paths so OpenAI-compatible image/response
  // endpoints can coexist with Anthropic-style vendors on the same base URL.
  const normalizedPath = incomingPath?.replace(/^\/+/, '');
  const url = normalizedPath ? `${config.baseUrl}/${normalizedPath}` : config.endpoint;
  const isAnthropicFormat =
    normalizedPath === 'v1/messages' ||
    (!normalizedPath && config.endpoint.endsWith('/v1/messages'));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.authStyle === 'x-api-key') {
    headers['x-api-key'] = masterKey;
  } else {
    headers.Authorization = `Bearer ${masterKey}`;
  }

  if (isAnthropicFormat) {
    headers['anthropic-version'] = '2023-06-01';
    return {
      url,
      headers,
      body: rawBody,
      isAnthropicFormat: true,
    };
  }

  return {
    url,
    headers,
    body: rawBody,
    isAnthropicFormat: false,
  };
}
