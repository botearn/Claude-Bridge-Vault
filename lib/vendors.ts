import type { VendorId, VendorConfig } from './types';

export const VENDOR_CONFIG: Record<VendorId, VendorConfig> = {
  claude: {
    label: 'Claude',
    endpoint: 'https://api.anthropic.com/v1/messages',
    authStyle: 'x-api-key',
    envKey: 'CLAUDE_MASTER_KEY',
    keyPrefix: 'claude',
    basePath: '/api/v1/claude',
  },
  youragent: {
    label: 'YourAgent',
    endpoint: 'https://your-agent.cc/api/v1/messages',
    authStyle: 'x-api-key',
    envKey: 'YOURAGENT_MASTER_KEY',
    keyPrefix: 'youragent',
    basePath: '/api/v1/youragent',
  },
  yunwu: {
    label: 'Yunwu',
    endpoint: 'https://yunwu.ai/v1/chat/completions',
    authStyle: 'bearer',
    envKey: 'YUNWU_MASTER_KEY',
    keyPrefix: 'yunwu',
    basePath: '/api/v1/yunwu',
  },
};

// Available models per vendor (label shown in UI, value sent to upstream API)
// Verified against live APIs on 2026-03-18
export const VENDOR_MODELS: Record<VendorId, { label: string; value: string; group?: string }[]> = {
  claude: [
    { label: 'Claude Opus 4.6', value: 'claude-opus-4-6' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
    { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
    { label: 'Claude Opus 4', value: 'claude-opus-4-20250514' },
  ],
  youragent: [
    { label: 'Claude Opus 4.6', value: 'claude-opus-4-6' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
    { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
  ],
  yunwu: [
    // Claude (via Yunwu)
    { label: 'Claude Opus 4.6', value: 'claude-opus-4-6', group: 'Claude' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6', group: 'Claude' },
    { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001', group: 'Claude' },
    { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514', group: 'Claude' },
    { label: 'Claude Opus 4', value: 'claude-opus-4-20250514', group: 'Claude' },
    // OpenAI
    { label: 'GPT-4.1', value: 'gpt-4.1', group: 'OpenAI' },
    { label: 'GPT-4.1 mini', value: 'gpt-4.1-mini', group: 'OpenAI' },
    { label: 'GPT-4.1 nano', value: 'gpt-4.1-nano', group: 'OpenAI' },
    { label: 'GPT-4o', value: 'gpt-4o', group: 'OpenAI' },
    { label: 'GPT-4o mini', value: 'gpt-4o-mini', group: 'OpenAI' },
    { label: 'o3', value: 'o3', group: 'OpenAI' },
    { label: 'o4-mini', value: 'o4-mini', group: 'OpenAI' },
    { label: 'o3-mini', value: 'o3-mini', group: 'OpenAI' },
    { label: 'o1', value: 'o1', group: 'OpenAI' },
    { label: 'o1-mini', value: 'o1-mini', group: 'OpenAI' },
    { label: 'GPT-4 Turbo', value: 'gpt-4-turbo', group: 'OpenAI' },
    // Google
    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro', group: 'Google' },
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash', group: 'Google' },
    { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash', group: 'Google' },
    // xAI
    { label: 'Grok 3', value: 'grok-3', group: 'xAI' },
    { label: 'Grok 3 mini', value: 'grok-3-mini', group: 'xAI' },
    // DeepSeek
    { label: 'DeepSeek Chat', value: 'deepseek-chat', group: 'DeepSeek' },
    { label: 'DeepSeek Reasoner', value: 'deepseek-reasoner', group: 'DeepSeek' },
  ],
};

export function isValidVendor(v: unknown): v is VendorId {
  return v === 'claude' || v === 'youragent' || v === 'yunwu';
}
