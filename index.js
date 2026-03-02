const express = require('express');
const cors = require('cors');
const proxy = require('express-http-proxy');
const { nanoid } = require('nanoid');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 模拟内存数据库 (后续挂载 SQLite)
// master_key 为原始 Claude Key
// sub_keys 映射: sub_key -> { master_key, track, limit }
const vault = {
  active_master_key: process.env.CLAUDE_MASTER_KEY || '',
  keys: {
    /* "sk-sub-123": { master: "sk-ant-xxx", track: "botearn" } */
  }
};

// 工具：生成 Sub-key
const createSubKey = (track) => {
  const subKey = `sk-vault-${track}-${nanoid(10)}`;
  vault.keys[subKey] = { master: vault.active_master_key, track };
  return subKey;
};

// 路由 A: BotEarn 专用通道 (隔离审计)
app.use('/v1/botearn', proxy('https://api.anthropic.com', {
  proxyReqOptDecorator: function(proxyReqOpts, srcReq) {
    const subKey = srcReq.headers['x-api-key'];
    if (vault.keys[subKey] && vault.keys[subKey].track === 'botearn') {
      proxyReqOpts.headers['x-api-key'] = vault.keys[subKey].master;
      console.log(`[Vault] BotEarn Request authorized via SubKey: ${subKey}`);
      return proxyReqOpts;
    }
    throw new Error('Unauthorized: Invalid BotEarn Sub-Key');
  }
}));

// 路由 B: Private/Team 专用通道
app.use('/v1/private', proxy('https://api.anthropic.com', {
  proxyReqOptDecorator: function(proxyReqOpts, srcReq) {
    const subKey = srcReq.headers['x-api-key'];
    if (vault.keys[subKey] && vault.keys[subKey].track === 'private') {
      proxyReqOpts.headers['x-api-key'] = vault.keys[subKey].master;
      console.log(`[Vault] Private Request authorized via SubKey: ${subKey}`);
      return proxyReqOpts;
    }
    throw new Error('Unauthorized: Invalid Private Sub-Key');
  }
}));

// 管理端接口：生成 Sub-key
app.post('/admin/keys', (req, res) => {
  const { track } = req.body; // 'botearn' 或 'private'
  if (!['botearn', 'private'].includes(track)) return res.status(400).send('Invalid track');
  const key = createSubKey(track);
  res.json({ sub_key: key, base_url: `${req.protocol}://${req.get('host')}/v1/${track}` });
});

app.get('/', (req, res) => res.send('💎 Claude Bridge Vault Refinery is Live. Use /v1/tracks.'));

app.listen(PORT, () => console.log(`Refinery running on port ${PORT}`));
