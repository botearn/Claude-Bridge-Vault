import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  calculateUsageCostNanoUsd,
  constrainBotEarnRequestBody,
  estimateMaxCostNanoUsd,
  getExplicitModelPrice,
} from '../lib/billing.ts';

test('BotEarn Key 合同显式要求 AI Balance 计费模式', () => {
  const route = readFileSync(
    new URL('../app/api/v1/botearn/keys/route.ts', import.meta.url),
    'utf8',
  );
  assert.match(route, /body\.billingMode === 'botearn_ai_balance'/);
});

test('按纳美元精确计算输入、缓存写入与输出费用', () => {
  const price = getExplicitModelPrice('claude', 'claude-opus-5');
  assert.ok(price);
  assert.equal(calculateUsageCostNanoUsd(price, {
    inputTokens: 1_000,
    cachedInputTokens: 500,
    cacheWriteTokens: 200,
    outputTokens: 100,
    reasoningTokens: 0,
  }), 9_000_000n);
});

test('预授权前写回安全输出上限', () => {
  const constrained = constrainBotEarnRequestBody(JSON.stringify({
    model: 'claude-opus-5',
    messages: [{ role: 'user', content: 'hello' }],
    max_tokens: 120_000,
  }));
  assert.equal(constrained.errorCode, null);
  assert.equal(JSON.parse(constrained.body).max_tokens, 65_536);
});

test('拒绝尚未建模的一小时缓存写入', () => {
  const constrained = constrainBotEarnRequestBody(JSON.stringify({
    model: 'claude-opus-5',
    messages: [{
      role: 'user',
      content: [{
        type: 'text',
        text: 'hello',
        cache_control: { type: 'ephemeral', ttl: '1h' },
      }],
    }],
  }));
  assert.equal(constrained.errorCode, 'AI_CACHE_TTL_NOT_SUPPORTED');
});

test('图片输入会增加最大预留费用', () => {
  const price = getExplicitModelPrice('claude', 'claude-haiku-4-5-20251001');
  assert.ok(price);
  const textBody = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    messages: [{ role: 'user', content: 'hello' }],
    max_tokens: 16,
  });
  const imageBody = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    messages: [{
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'https://example.com/a.png' } }],
    }],
    max_tokens: 16,
  });
  assert.ok(
    estimateMaxCostNanoUsd(imageBody, price)
      > estimateMaxCostNanoUsd(textBody, price),
  );
});

test('拒绝尚未建模的 provider 付费工具', () => {
  const constrained = constrainBotEarnRequestBody(JSON.stringify({
    model: 'claude-sonnet-5',
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
    }],
    messages: [{ role: 'user', content: 'search' }],
  }));
  assert.equal(constrained.errorCode, 'AI_BILLING_UNIT_NOT_SUPPORTED');
});

test('保留 OpenAI-compatible 自定义 function tools', () => {
  const constrained = constrainBotEarnRequestBody(JSON.stringify({
    model: 'claude-sonnet-5',
    tools: [{
      type: 'function',
      function: {
        name: 'lookup',
        parameters: { type: 'object', properties: {} },
      },
    }],
    messages: [{ role: 'user', content: 'lookup' }],
  }));
  assert.equal(constrained.errorCode, null);
});

test('拒绝可能进入超长上下文阶梯价格的请求', () => {
  const constrained = constrainBotEarnRequestBody(JSON.stringify({
    model: 'claude-sonnet-5',
    messages: [{ role: 'user', content: 'x'.repeat(180_001) }],
  }));
  assert.equal(constrained.errorCode, 'AI_INPUT_LIMIT_EXCEEDED');
});
