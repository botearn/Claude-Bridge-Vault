import type { VendorId, VendorConfig } from './types';

export const VENDOR_CONFIG: Record<VendorId, VendorConfig> = {
  claude: {
    label: 'Claude',
    baseUrl: 'https://api.anthropic.com',
    endpoint: 'https://api.anthropic.com/v1/messages',
    authStyle: 'x-api-key',
    envKey: 'CLAUDE_MASTER_KEY',
    keyPrefix: 'claude',
    basePath: '/api/v1/claude',
  },
  yunwu: {
    label: 'Yunwu',
    baseUrl: 'https://yunwu.ai',
    endpoint: 'https://yunwu.ai/v1/chat/completions',
    authStyle: 'bearer',
    envKey: 'YUNWU_MASTER_KEY',
    keyPrefix: 'yunwu',
    basePath: '/api/v1/yunwu',
  },
  tokenutopia: {
    label: 'TokenUtopia',
    baseUrl: 'https://tokenutopia.ai',
    endpoint: 'https://tokenutopia.ai/v1/messages',
    authStyle: 'x-api-key',
    envKey: 'TOKENUTOPIA_MASTER_KEY',
    keyPrefix: 'tokenutopia',
    basePath: '/api/v1/tokenutopia',
  },
  palebluedot: {
    label: 'PaleBlueDot',
    baseUrl: 'https://open.palebluedot.ai',
    endpoint: 'https://open.palebluedot.ai/v1/messages',
    authStyle: 'x-api-key',
    envKey: 'PALEBLUEDOT_MASTER_KEY',
    keyPrefix: 'palebluedot',
    basePath: '/api/v1/palebluedot',
  },
  clawos: {
    label: 'Clawos (CN)',
    baseUrl: 'https://token-gateway.clawos.metacarbon-inc.com',
    endpoint: 'https://token-gateway.clawos.metacarbon-inc.com/v1/chat/completions',
    authStyle: 'bearer',
    envKey: 'CLAWOS_MASTER_KEY',
    keyPrefix: 'clawos',
    basePath: '/api/v1/clawos',
  },
  'clawos-overseas': {
    label: 'Clawos (Global)',
    baseUrl: 'https://token-gateway.clawos.agentclawos.com',
    endpoint: 'https://token-gateway.clawos.agentclawos.com/v1/chat/completions',
    authStyle: 'bearer',
    envKey: 'CLAWOS_OVERSEAS_MASTER_KEY',
    keyPrefix: 'clawos-overseas',
    basePath: '/api/v1/clawos-overseas',
  },
  amazon: {
    label: 'Amazon Bedrock',
    baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai',
    endpoint: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/chat/completions',
    authStyle: 'bearer',
    envKey: 'AMAZON_MASTER_KEY',
    keyPrefix: 'amazon',
    basePath: '/api/v1/amazon',
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
  tokenutopia: [
    { label: 'Claude Opus 4.6', value: 'claude-opus-4-6' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
    { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
    { label: 'Claude Opus 4', value: 'claude-opus-4-20250514' },
  ],
  palebluedot: [
    { label: 'Claude Opus 4.6', value: 'anthropic/claude-opus-4.6' },
    { label: 'Claude Sonnet 4.6', value: 'anthropic/claude-sonnet-4.6' },
    { label: 'Claude Opus 4.5', value: 'anthropic/claude-opus-4.5' },
    { label: 'Claude Sonnet 4.5', value: 'anthropic/claude-sonnet-4.5' },
    { label: 'Claude Haiku 4.5', value: 'anthropic/claude-haiku-4.5' },
    { label: 'Claude Sonnet 4', value: 'anthropic/claude-sonnet-4' },
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
  clawos: [
    // Claude
    { label: 'Claude Opus 4.7', value: 'claude-opus-4-7', group: 'Claude' },
    { label: 'Claude Opus 4.6', value: 'claude-opus-4-6', group: 'Claude' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6', group: 'Claude' },
    // OpenAI
    { label: 'GPT-5.4', value: 'gpt-5.4', group: 'OpenAI' },
    { label: 'GPT-5.4 mini', value: 'gpt-5.4-mini', group: 'OpenAI' },
    // Google
    { label: 'Gemini 3.1 Pro (preview)', value: 'gemini-3.1-pro-preview', group: 'Google' },
    { label: 'Gemini 3.1 Flash Lite (preview)', value: 'gemini-3.1-flash-lite-preview', group: 'Google' },
    // Qwen
    { label: 'Qwen 3.6 Plus', value: 'qwen3.6-plus', group: 'Qwen' },
    { label: 'Qwen 3.5 Plus', value: 'qwen3.5-plus', group: 'Qwen' },
    { label: 'Qwen 3.5 Flash', value: 'qwen3.5-flash', group: 'Qwen' },
    { label: 'Qwen3 Coder Plus', value: 'qwen3-coder-plus', group: 'Qwen' },
    // Kimi / MiniMax / GLM / DeepSeek
    { label: 'Kimi K2.5', value: 'kimi-k2.5', group: 'Moonshot' },
    { label: 'MiniMax M2.5', value: 'MiniMax-M2.5', group: 'MiniMax' },
    { label: 'GLM 5.1', value: 'glm-5.1', group: 'Zhipu' },
    { label: 'GLM 5', value: 'glm-5', group: 'Zhipu' },
    { label: 'DeepSeek V3.2', value: 'deepseek-v3.2', group: 'DeepSeek' },
  ],
  'clawos-overseas': [
    // Claude
    { label: 'Claude Opus 4.7', value: 'claude-opus-4-7', group: 'Claude' },
    { label: 'Claude Opus 4.6', value: 'claude-opus-4-6', group: 'Claude' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6', group: 'Claude' },
    // OpenAI
    { label: 'GPT-5.4', value: 'gpt-5.4', group: 'OpenAI' },
    { label: 'GPT-5.4 mini', value: 'gpt-5.4-mini', group: 'OpenAI' },
    // Google
    { label: 'Gemini 3.1 Pro (preview)', value: 'gemini-3.1-pro-preview', group: 'Google' },
    { label: 'Gemini 3.1 Flash Lite (preview)', value: 'gemini-3.1-flash-lite-preview', group: 'Google' },
    // Qwen
    { label: 'Qwen 3.6 Plus', value: 'qwen3.6-plus', group: 'Qwen' },
    { label: 'Qwen 3.5 Plus', value: 'qwen3.5-plus', group: 'Qwen' },
    { label: 'Qwen 3.5 Flash', value: 'qwen3.5-flash', group: 'Qwen' },
    { label: 'Qwen3 Coder Plus', value: 'qwen3-coder-plus', group: 'Qwen' },
    // Kimi / MiniMax / GLM / DeepSeek
    { label: 'Kimi K2.5', value: 'kimi-k2.5', group: 'Moonshot' },
    { label: 'MiniMax M2.5', value: 'MiniMax-M2.5', group: 'MiniMax' },
    { label: 'GLM 5.1', value: 'glm-5.1', group: 'Zhipu' },
    { label: 'GLM 5', value: 'glm-5', group: 'Zhipu' },
    { label: 'DeepSeek V3.2', value: 'deepseek-v3.2', group: 'DeepSeek' },
  ],
  amazon: [
    // Anthropic on Bedrock (us. = cross-region inference profile)
    { label: 'Claude Opus 4.1', value: 'us.anthropic.claude-opus-4-1-20250805-v1:0', group: 'Claude' },
    { label: 'Claude Opus 4', value: 'us.anthropic.claude-opus-4-20250514-v1:0', group: 'Claude' },
    { label: 'Claude Sonnet 4', value: 'us.anthropic.claude-sonnet-4-20250514-v1:0', group: 'Claude' },
    { label: 'Claude 3.7 Sonnet', value: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0', group: 'Claude' },
    { label: 'Claude 3.5 Sonnet v2', value: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0', group: 'Claude' },
    { label: 'Claude 3.5 Haiku', value: 'us.anthropic.claude-3-5-haiku-20241022-v1:0', group: 'Claude' },
    // Amazon Nova
    { label: 'Nova Pro', value: 'amazon.nova-pro-v1:0', group: 'Amazon Nova' },
    { label: 'Nova Lite', value: 'amazon.nova-lite-v1:0', group: 'Amazon Nova' },
    { label: 'Nova Micro', value: 'amazon.nova-micro-v1:0', group: 'Amazon Nova' },
  ],
};

export function isValidVendor(v: unknown): v is VendorId {
  return v === 'claude' || v === 'yunwu' || v === 'tokenutopia' || v === 'palebluedot' || v === 'clawos' || v === 'clawos-overseas' || v === 'amazon';
}
