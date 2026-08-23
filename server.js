const express = require('express');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// SSE clients
const sseClients = new Set();

let activeOnlineUsers = 4812;
setInterval(() => {
  const delta = Math.floor(Math.random() * 19) - 9;
  activeOnlineUsers = Math.max(3500, activeOnlineUsers + delta);
}, 4000);

function broadcastSSE(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.res.write(payload); } catch (e) { sseClients.delete(client); }
  }
}

setInterval(async () => {
  if (sseClients.size > 0) {
    try {
      const stats = await db.getStats();
      broadcastSSE('heartbeat', { total_pledges: stats.total_pledges, online_users: activeOnlineUsers, percent_to_strike: stats.percent_to_strike });
    } catch (e) { console.error('Heartbeat error:', e); }
  }
}, 3000);

// SSE endpoint
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const client = { id: Date.now(), res };
  sseClients.add(client);

  db.getStats()
    .then(stats => {
      res.write(`event: initial\ndata: ${JSON.stringify({ ...stats, online_users: activeOnlineUsers })}\n\n`);
    })
    .catch(err => {
      console.error('SSE initial stats error:', err);
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'Failed to load initial stats' })}\n\n`);
    });

  req.on('close', () => sseClients.delete(client));
});

// Stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json({ success: true, ...stats, online_users: activeOnlineUsers });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Pledge (Tier 1)
app.post('/api/pledge', async (req, res) => {
  try {
    const { alias, email, phone, state, notes } = req.body;
    if (!alias && !email && !phone) {
      return res.status(400).json({ error: 'Please provide at least an alias, email, or phone number to pledge.' });
    }
    const pledge = await db.addPledge({
      alias: alias || (email ? email.split('@')[0] : 'Solidarity Worker'),
      email: email || `alias_${Date.now()}@peoplesunion.local`,
      phone: phone || null,
      state: state || 'US',
      tier: 1,
      sms_opt_in: 1,
      notes: notes || 'Street / QR Mobilization'
    });
    const currentStats = await db.getStats();
    broadcastSSE('new_pledge', { member_number: pledge.member_number, alias: pledge.alias, state: pledge.state, tier: 1, total_pledges: currentStats.total_pledges, online_users: activeOnlineUsers });
    res.json({ success: true, message: "Pledge recorded. You are officially counted in The People's Union!", pledge, stats: currentStats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Tier 2 registration
app.post('/api/register-tier2', async (req, res) => {
  try {
    const { alias, email, phone, state, chapter, invite_code } = req.body;
    if (process.env.TIER2_INVITE_CODE && invite_code !== process.env.TIER2_INVITE_CODE) {
      return res.status(403).json({ error: 'Tier 2 invite code required.' });
    }
    if (!email || !alias) return res.status(400).json({ error: 'Alias and valid email are required for Tier 2 verification.' });
    const user = await db.registerTier2({ alias, email, phone, state, chapter });
    const currentStats = await db.getStats();
    broadcastSSE('new_pledge', { member_number: user.member_number, alias: user.alias, state: user.state, tier: 2, total_pledges: currentStats.total_pledges, online_users: activeOnlineUsers });
    res.json({ success: true, message: 'Tier 2 Account Verified. Welcome to the Organizer Caucus.', user, stats: currentStats });
  } catch (err) {
    const status = err.message === 'Email already registered.' ? 409 : 500;
    res.status(status).json({ error: err.message });
  }
});

// Demands
app.get('/api/demands', async (req, res) => {
  try {
    const demands = await db.getDemands();
    res.json({ success: true, demands });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/demands/vote', async (req, res) => {
  try {
    const { demandId } = req.body;
    if (!demandId) return res.status(400).json({ error: 'Demand ID required' });
    const updated = await db.voteDemand(demandId);
    broadcastSSE('demand_voted', updated);
    res.json({ success: true, demand: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Community board
app.get('/api/community', async (req, res) => {
  try {
    const posts = await db.getCommunityPosts();
    res.json({ success: true, posts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/community', async (req, res) => {
  try {
    const { author_email, author_chapter, category, title, content } = req.body;
    if (!title || !content || !author_email) return res.status(400).json({ error: 'Email, Title and Content are required' });
    const verifiedUser = await db.getUserByEmail(author_email);
    if (!verifiedUser) return res.status(403).json({ error: 'Tier 2 verification required to publish community posts.' });
    const newPost = await db.addCommunityPost({ author_alias: verifiedUser.alias, author_chapter: verifiedUser.chapter || 'National Solidarity Chapter', category: category || 'General Organizing', title, content, author_tier: 2 });
    broadcastSSE('new_post', newPost);
    res.json({ success: true, post: newPost });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/community/upvote', async (req, res) => {
  try {
    const { postId } = req.body;
    if (!postId) return res.status(400).json({ error: 'Post ID required' });
    const updated = await db.upvotePost(postId);
    if (!updated) return res.status(404).json({ error: 'Post not found' });
    broadcastSSE('post_upvoted', updated);
    res.json({ success: true, post: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// QR Code (JSON)
app.get('/api/qr', async (req, res) => {
  try {
    const targetUrl = req.query.url || `${req.protocol}://${req.get('host')}`;
    const qrDataUrl = await QRCode.toDataURL(targetUrl, { errorCorrectionLevel: 'H', margin: 1, color: { dark: '#111827', light: '#FFFFFF' }, width: 400 });
    res.json({ success: true, qr: qrDataUrl, url: targetUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// QR Code (PNG image for <img src="/qr">)
app.get('/qr', async (req, res) => {
  try {
    const targetUrl = req.query.url || `${req.protocol}://${req.get('host')}`;
    const png = await QRCode.toBuffer(targetUrl, { errorCorrectionLevel: 'H', margin: 1, color: { dark: '#111827', light: '#FFFFFF' }, width: 400 });
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    res.status(500).send('QR generation failed');
  }
});

// Start
db.initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`  THE PEOPLE'S UNION PLATFORM RUNNING`);
    console.log(`  Live Server: http://0.0.0.0:${PORT}`);
    console.log(`=================================================`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

