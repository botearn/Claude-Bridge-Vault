const express = require('express');
const cors = require('cors');
const proxy = require('express-http-proxy');
const { nanoid } = require('nanoid');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // 启用静态页面

const PORT = process.env.PORT || 3000;

const vault = {
  active_master_key: process.env.CLAUDE_MASTER_KEY || '',
  keys: {}
};

const createSubKey = (track, host) => {
  const subKey = `sk-vault-${track}-${nanoid(10)}`;
  vault.keys[subKey] = { master: vault.active_master_key, track };
  return subKey;
};

app.use('/v1/botearn', proxy('https://api.anthropic.com', {
  proxyReqOptDecorator: function(proxyReqOpts, srcReq) {
    const subKey = srcReq.headers['x-api-key'];
    if (vault.keys[subKey] && vault.keys[subKey].track === 'botearn') {
      proxyReqOpts.headers['x-api-key'] = vault.keys[subKey].master;
      return proxyReqOpts;
    }
    throw new Error('Unauthorized');
  }
}));

app.use('/v1/private', proxy('https://api.anthropic.com', {
  proxyReqOptDecorator: function(proxyReqOpts, srcReq) {
    const subKey = srcReq.headers['x-api-key'];
    if (vault.keys[subKey] && vault.keys[subKey].track === 'private') {
      proxyReqOpts.headers['x-api-key'] = vault.keys[subKey].master;
      return proxyReqOpts;
    }
    throw new Error('Unauthorized');
  }
}));

app.post('/admin/keys', (req, res) => {
  const { track } = req.body;
  if (!['botearn', 'private'].includes(track)) return res.status(400).send('Invalid');
  const key = createSubKey(track);
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  res.json({ sub_key: key, base_url: `${protocol}://${req.get('host')}/v1/${track}` });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/', (req, res) => res.send('💎 Claude Bridge Vault is Live.'));

app.listen(PORT, () => console.log(`Refinery running on port ${PORT}`));
