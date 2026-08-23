const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const QRCode = require('qrcode');
const path = require('path');
const { getCount, pledgeExists, insertPledge } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- SSE Clients ---
const clients = new Set();

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(msg); } catch (_) { clients.delete(res); }
  }
}

// Broadcast live user count every 10 s
setInterval(() => {
  broadcast({ type: 'users', count: clients.size });
}, 10000);

// --- SSE endpoint ---
app.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  // Send initial state
  res.write(`data: ${JSON.stringify({ type: 'init', count: getCount(), users: clients.size })}\n\n`);

  clients.add(res);

  // Heartbeat
  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) { clearInterval(hb); }
  }, 25000);

  req.on('close', () => {
    clients.delete(res);
    clearInterval(hb);
  });
});

// --- Pledge endpoint ---
app.post('/pledge', (req, res) => {
  const { alias, email, phone } = req.body || {};

  if (!alias || typeof alias !== 'string' || alias.trim().length < 2) {
    return res.status(400).json({ error: 'Alias must be at least 2 characters.' });
  }
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Valid email required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanAlias = alias.trim().slice(0, 60);
  const cleanPhone = phone ? phone.trim().slice(0, 20) : null;

  if (pledgeExists(cleanEmail)) {
    return res.status(409).json({ error: 'This email has already pledged. Thank you!' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '';
  const ip_hash = crypto.createHash('sha256').update(ip).digest('hex');

  const id = insertPledge({ alias: cleanAlias, email: cleanEmail, phone: cleanPhone, ip_hash });
  const count = getCount();

  broadcast({ type: 'pledge', count });

  res.json({ id, count, alias: cleanAlias });
});

// --- Count endpoint ---
app.get('/count', (_req, res) => {
  res.json({ count: getCount(), users: clients.size });
});

// --- QR Code endpoint ---
app.get('/qr', async (req, res) => {
  const url = req.query.url || `${req.protocol}://${req.get('host')}`;
  try {
    const png = await QRCode.toBuffer(url, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 400,
      color: { dark: '#000000', light: '#ffffff' },
    });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (e) {
    res.status(500).json({ error: 'QR generation failed.' });
  }
});

app.listen(PORT, () => {
  console.log(`The People's Union server running on port ${PORT}`);
});
