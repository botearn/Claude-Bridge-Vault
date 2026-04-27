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

  // Determine format from incoming path if provided, else fall back to vendor default
  let isAnthropicFormat: boolean;
  let url: string;

  if (incomingPath === 'v1/messages') {
    isAnthropicFormat = true;
    url = `${config.baseUrl}/v1/messages`;
  } else if (incomingPath === 'v1/chat/completions') {
    isAnthropicFormat = false;
    url = `${config.baseUrl}/v1/chat/completions`;
  } else {
    isAnthropicFormat = config.authStyle === 'x-api-key';
    url = config.endpoint;
  }

  if (isAnthropicFormat) {
    return {
      url,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': masterKey,
        'anthropic-version': '2023-06-01',
      },
      body: rawBody,
      isAnthropicFormat: true,
    };
  }

  return {
    url,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${masterKey}`,
    },
    body: rawBody,
    isAnthropicFormat: false,
  };
}
