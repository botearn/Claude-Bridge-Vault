import assert from 'node:assert/strict';
import test from 'node:test';
import { getVaultCatalog } from '../lib/model-catalog.ts';

test('公开目录只包含当前 Claude 稳定模型与完整计费快照', () => {
  const catalog = getVaultCatalog();
  assert.deepEqual(
    catalog.map(model => model.id),
    [
      'claude/claude-fable-5',
      'claude/claude-haiku-4-5-20251001',
      'claude/claude-opus-5',
      'claude/claude-sonnet-5',
    ],
  );
  for (const model of catalog) {
    assert.equal(model.status, 'stable');
    assert.ok(model.capabilities.includes('vision'));
    assert.ok(model.capabilities.includes('tools'));
    assert.ok(model.capabilities.includes('structured_output'));
    assert.match(model.pricing.snapshotId, /^price:claude:/);
    assert.equal(model.pricing.billingStatus, 'active');
    assert.ok(BigInt(model.pricing.outputPerToken) > 0n);
  }
});

test('目录没有旧版固定 token 商品模型', () => {
  const ids = getVaultCatalog().map(model => model.id).join('\n').toLowerCase();
  assert.doesNotMatch(ids, /gpt-4o|gemini-2\.5|claude-3-5/);
});
