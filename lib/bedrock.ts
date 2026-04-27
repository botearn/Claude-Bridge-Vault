type ChatMessage = {
  role?: unknown;
  content?: unknown;
};

type ChatBody = {
  model?: unknown;
  messages?: unknown;
  max_tokens?: unknown;
  maxTokens?: unknown;
  temperature?: unknown;
  top_p?: unknown;
  topP?: unknown;
  stop?: unknown;
  stop_sequences?: unknown;
  stream?: unknown;
  additionalModelRequestFields?: unknown;
};

type BedrockContentBlock = { text: string };

export interface BedrockUpstreamRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  model: string;
  streamRequested: boolean;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === 'string');
    return strings.length > 0 ? strings : undefined;
  }
  return undefined;
}

function toTextBlocks(content: unknown): BedrockContentBlock[] {
  if (typeof content === 'string') return content ? [{ text: content }] : [];

  if (!Array.isArray(content)) return [];

  const blocks: BedrockContentBlock[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const record = block as Record<string, unknown>;
    if (typeof record.text === 'string') blocks.push({ text: record.text });
    if (typeof record.input_text === 'string') blocks.push({ text: record.input_text });
  }
  return blocks;
}

function toBedrockRole(role: unknown): 'user' | 'assistant' | null {
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'assistant';
  return null;
}

export function buildBedrockConverseRequest(
  masterKey: string,
  rawBody: string,
  baseUrl: string,
): BedrockUpstreamRequest {
  const parsed = JSON.parse(rawBody) as ChatBody;
  const model = typeof parsed.model === 'string' && parsed.model ? parsed.model : '';
  if (!model) throw new Error('Missing model');
  if (!Array.isArray(parsed.messages)) throw new Error('Missing messages');

  const system: BedrockContentBlock[] = [];
  const messages: { role: 'user' | 'assistant'; content: BedrockContentBlock[] }[] = [];

  for (const message of parsed.messages as ChatMessage[]) {
    if (!message || typeof message !== 'object') continue;
    const content = toTextBlocks(message.content);
    if (content.length === 0) continue;

    if (message.role === 'system') {
      system.push(...content);
      continue;
    }

    const role = toBedrockRole(message.role);
    if (role) messages.push({ role, content });
  }

  if (messages.length === 0) throw new Error('Missing messages');

  const inferenceConfig: Record<string, unknown> = {};
  const maxTokens = asNumber(parsed.max_tokens) ?? asNumber(parsed.maxTokens);
  const temperature = asNumber(parsed.temperature);
  const topP = asNumber(parsed.top_p) ?? asNumber(parsed.topP);
  const stopSequences = asStringArray(parsed.stop) ?? asStringArray(parsed.stop_sequences);
  if (maxTokens != null) inferenceConfig.maxTokens = maxTokens;
  if (temperature != null) inferenceConfig.temperature = temperature;
  if (topP != null) inferenceConfig.topP = topP;
  if (stopSequences) inferenceConfig.stopSequences = stopSequences;

  const body: Record<string, unknown> = { messages };
  if (system.length > 0) body.system = system;
  if (Object.keys(inferenceConfig).length > 0) body.inferenceConfig = inferenceConfig;
  if (parsed.additionalModelRequestFields != null) {
    body.additionalModelRequestFields = parsed.additionalModelRequestFields;
  }

  return {
    url: `${baseUrl}/model/${encodeURIComponent(model)}/converse`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${masterKey}`,
    },
    body: JSON.stringify(body),
    model,
    streamRequested: parsed.stream === true,
  };
}

function textFromBedrockResponse(data: Record<string, unknown>): string {
  const output = data.output as Record<string, unknown> | undefined;
  const message = output?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (!Array.isArray(content)) return '';

  return content
    .map((block) => {
      if (!block || typeof block !== 'object') return '';
      const text = (block as Record<string, unknown>).text;
      return typeof text === 'string' ? text : '';
    })
    .join('');
}

function finishReason(stopReason: unknown): string {
  if (stopReason === 'max_tokens') return 'length';
  if (stopReason === 'tool_use') return 'tool_calls';
  if (stopReason === 'content_filtered' || stopReason === 'guardrail_intervened') return 'content_filter';
  return 'stop';
}

export function bedrockConverseToOpenAI(data: Record<string, unknown>, model: string): Record<string, unknown> {
  const usage = data.usage as Record<string, unknown> | undefined;
  const inputTokens = asNumber(usage?.inputTokens) ?? 0;
  const outputTokens = asNumber(usage?.outputTokens) ?? 0;
  const totalTokens = asNumber(usage?.totalTokens) ?? inputTokens + outputTokens;
  const created = Math.floor(Date.now() / 1000);

  return {
    id: `chatcmpl-bedrock-${created}`,
    object: 'chat.completion',
    created,
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: textFromBedrockResponse(data),
        },
        finish_reason: finishReason(data.stopReason),
      },
    ],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: totalTokens,
    },
  };
}

export function openAICompletionToSSE(data: Record<string, unknown>): Response {
  const encoder = new TextEncoder();
  const id = data.id;
  const created = data.created;
  const model = data.model;
  const choice = Array.isArray(data.choices) ? data.choices[0] as Record<string, unknown> | undefined : undefined;
  const message = choice?.message as Record<string, unknown> | undefined;
  const content = typeof message?.content === 'string' ? message.content : '';
  const finish = choice?.finish_reason ?? 'stop';
  const usage = data.usage;

  const chunks = [
    { id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] },
    { id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content }, finish_reason: null }] },
    { id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: finish }], usage },
  ];

  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(encoder.encode(body), {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
