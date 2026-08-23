/* ===== THE PEOPLE'S UNION — Client App ===== */

// ── Utilities ──────────────────────────────────────────────────────────────
function fmt(n) {
  return Number(n || 0).toLocaleString();
}

// ── Donation modal ─────────────────────────────────────────────────────────
document.getElementById('btn-donate')?.addEventListener('click', () => {
  document.getElementById('donate-modal')?.classList.remove('hidden');
});

document.getElementById('donate-modal-close')?.addEventListener('click', () => {
  document.getElementById('donate-modal')?.classList.add('hidden');
});

document.getElementById('donate-modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('donate-modal')) {
    document.getElementById('donate-modal').classList.add('hidden');
  }
});

document.querySelectorAll('.btn-copy-addr').forEach(btn => {
  btn.addEventListener('click', () => {
    const addr = btn.dataset.addr;
    navigator.clipboard?.writeText(addr).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    });
  });
});

function randomAlias() {
  const adj = ['Solidarity', 'United', 'Rising', 'Steelwork', 'Farmhand', 'Nightshift', 'Redline', 'Ironclad', 'Bayshore', 'Highline'];
  const noun = ['Worker', 'Organizer', 'Advocate', 'Delegate', 'Member', 'Striker', 'Builder', 'Voice', 'Union', 'Force'];
  const num = String(Math.floor(Math.random() * 9000) + 1000);
  return adj[Math.floor(Math.random() * adj.length)] + '_' + noun[Math.floor(Math.random() * noun.length)] + '_' + num;
}

// ── Confetti ───────────────────────────────────────────────────────────────
(function () {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let pieces = [];
  let running = false;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function spawn(n) {
    const colors = ['#e53e3e', '#dd6b20', '#d69e2e', '#38a169', '#3182ce', '#805ad5'];
    for (let i = 0; i < n; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: -10,
        w: Math.random() * 10 + 4,
        h: Math.random() * 6 + 3,
        r: Math.random() * Math.PI * 2,
        dr: (Math.random() - 0.5) * 0.2,
        vy: Math.random() * 3 + 2,
        vx: (Math.random() - 0.5) * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  function tick() {
    if (!running) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces = pieces.filter(p => p.y < canvas.height + 20);
    for (const p of pieces) {
      p.x += p.vx; p.y += p.vy; p.r += p.dr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (pieces.length === 0) { running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    requestAnimationFrame(tick);
  }

  window.launchConfetti = function () {
    spawn(180);
    if (!running) { running = true; requestAnimationFrame(tick); }
  };
})();

// ── Odometer / counter ─────────────────────────────────────────────────────
let displayedTotal = 0;

function animateTo(target) {
  const el = document.getElementById('odometer');
  if (!el) return;
  const step = Math.ceil(Math.abs(target - displayedTotal) / 40) || 1;
  (function tick() {
    if (displayedTotal < target) {
      displayedTotal = Math.min(displayedTotal + step, target);
      el.textContent = fmt(displayedTotal);
      requestAnimationFrame(tick);
    } else if (displayedTotal > target) {
      displayedTotal = Math.max(displayedTotal - step, target);
      el.textContent = fmt(displayedTotal);
      requestAnimationFrame(tick);
    }
  })();
}

function updateMilestoneBar(total) {
  const fill = document.getElementById('milestone-fill');
  if (!fill) return;
  const pct = Math.min((total / 30000000) * 100, 100);
  fill.style.width = pct + '%';
}

function applyStats(stats) {
  if (stats.total_pledges !== undefined) {
    animateTo(stats.total_pledges);
    updateMilestoneBar(stats.total_pledges);
  }
  const liveEl = document.getElementById('live-users');
  if (liveEl && stats.online_users !== undefined) {
    liveEl.textContent = fmt(stats.online_users);
  }
}

// ── SSE ────────────────────────────────────────────────────────────────────
(function connectSSE() {
  const es = new EventSource('/api/events');

  es.addEventListener('initial', e => {
    try { applyStats(JSON.parse(e.data)); } catch (_) {}
  });

  es.addEventListener('heartbeat', e => {
    try { applyStats(JSON.parse(e.data)); } catch (_) {}
  });

  es.addEventListener('new_pledge', e => {
    try { applyStats(JSON.parse(e.data)); } catch (_) {}
  });

  es.onerror = () => {
    es.close();
    setTimeout(connectSSE, 5000);
  };
})();

// ── Random alias button ────────────────────────────────────────────────────
document.getElementById('btn-alias')?.addEventListener('click', () => {
  const inp = document.getElementById('f-alias');
  if (inp) inp.value = randomAlias();
});

// ── Pledge form ────────────────────────────────────────────────────────────
document.getElementById('pledge-form')?.addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('form-msg');
  const btn = this.querySelector('.btn-submit');

  const alias = document.getElementById('f-alias')?.value.trim();
  const email = document.getElementById('f-email')?.value.trim();
  const phone = document.getElementById('f-phone')?.value.trim();

  if (!alias && !email) {
    msg.textContent = 'Please enter at least a name/alias or email address.';
    msg.className = 'form-msg error';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting…';
  msg.textContent = '';

  try {
    const res = await fetch('/api/pledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias, email, phone }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');

    msg.textContent = data.message || 'Pledge recorded!';
    msg.className = 'form-msg success';

    // Show strike pass
    const passSection = document.getElementById('strike-pass-section');
    const passNumber = document.getElementById('pass-number');
    const passAlias = document.getElementById('pass-alias');
    if (passSection) passSection.classList.remove('hidden');
    if (passNumber) passNumber.textContent = '#' + String(data.pledge?.member_number || 0).padStart(8, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (passAlias) passAlias.textContent = data.pledge?.alias || alias;

    window.launchConfetti && window.launchConfetti();
    passSection?.scrollIntoView({ behavior: 'smooth' });
    this.reset();
  } catch (err) {
    msg.textContent = err.message || 'Something went wrong. Please try again.';
    msg.className = 'form-msg error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'ENTER ↵   TAKE THE PLEDGE';
  }
});

// ── Strike pass share buttons ──────────────────────────────────────────────
document.getElementById('btn-copy-link')?.addEventListener('click', () => {
  navigator.clipboard?.writeText(window.location.href).then(() => {
    const btn = document.getElementById('btn-copy-link');
    const orig = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
});

document.getElementById('btn-share-twitter')?.addEventListener('click', () => {
  const text = encodeURIComponent("I just joined The People's Union. 30 million workers. One collective pause. Join me:");
  const url = encodeURIComponent(window.location.href);
  window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'noopener,width=600,height=400');
});

// ── Print QR ───────────────────────────────────────────────────────────────
document.getElementById('btn-print-qr')?.addEventListener('click', () => {
  window.print();
});

// ── Poster generator ───────────────────────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.getElementById('btn-print-poster')?.addEventListener('click', () => {
  const headline = document.getElementById('poster-headline')?.value || '';
  const sub = document.getElementById('poster-sub')?.value || '';
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>Poster</title>
    <style>body{font-family:sans-serif;text-align:center;padding:60px;background:#111;color:#fff;}
    h1{font-size:3rem;margin-bottom:1rem;}p{font-size:1.5rem;}img{width:200px;margin-top:2rem;}</style>
    </head><body>
    <h1>${escapeHtml(headline)}</h1>
    <p>${escapeHtml(sub)}</p>
    <img src="/qr" alt="QR Code" />
    <p style="margin-top:1rem;font-size:1rem;opacity:.7;">ThePeoplesUnion.art</p>
    <script>window.onload=()=>window.print();<\/script>
    </body></html>`);
  win.document.close();
});

// ── Kiosk mode ─────────────────────────────────────────────────────────────
function openKiosk() {
  const overlay = document.getElementById('kiosk-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Populate kiosk counter
  const kioskCount = document.getElementById('kiosk-count');
  if (kioskCount) kioskCount.textContent = fmt(displayedTotal) + ' pledged';

  document.getElementById('kiosk-celebrate')?.classList.add('hidden');
  document.getElementById('kiosk-form')?.classList.remove('hidden');
  document.getElementById('kiosk-form')?.reset();
  document.getElementById('kiosk-msg') && (document.getElementById('kiosk-msg').textContent = '');
  document.getElementById('k-alias')?.focus();

  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}

function closeKiosk() {
  const overlay = document.getElementById('kiosk-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  document.body.style.overflow = '';
  if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

document.getElementById('btn-kiosk')?.addEventListener('click', openKiosk);
document.getElementById('btn-kiosk-mob')?.addEventListener('click', openKiosk);
document.getElementById('kiosk-close')?.addEventListener('click', closeKiosk);

document.getElementById('kiosk-form')?.addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('kiosk-msg');
  const btn = this.querySelector('.btn-kiosk-submit');
  const alias = document.getElementById('k-alias')?.value.trim();
  const email = document.getElementById('k-email')?.value.trim();

  if (!alias || !email) {
    msg.textContent = 'Please enter your name and email.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    const res = await fetch('/api/pledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias, email, notes: 'Kiosk Mode' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');

    const num = document.getElementById('kiosk-pass-num');
    if (num) num.textContent = '#' + String(data.pledge?.member_number || 0).padStart(8, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    this.classList.add('hidden');
    document.getElementById('kiosk-celebrate')?.classList.remove('hidden');
    window.launchConfetti && window.launchConfetti();

    // Auto-reset after 3 seconds
    setTimeout(() => {
      document.getElementById('kiosk-celebrate')?.classList.add('hidden');
      this.classList.remove('hidden');
      this.reset();
      msg.textContent = '';
      btn.disabled = false;
      btn.textContent = 'PLEDGE ↵';
      document.getElementById('k-alias')?.focus();
    }, 3000);
  } catch (err) {
    msg.textContent = err.message || 'Something went wrong.';
    btn.disabled = false;
    btn.textContent = 'PLEDGE ↵';
  }
});

// Close kiosk or donate modal on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeKiosk();
    document.getElementById('donate-modal')?.classList.add('hidden');
  }
});

// ── Demands ────────────────────────────────────────────────────────────────
async function loadDemands() {
  const list = document.getElementById('demands-list');
  if (!list) return;
  try {
    const res = await fetch('/api/demands');
    const data = await res.json();
    if (!data.success) return;
    list.innerHTML = '';
    for (const d of data.demands) {
      const item = document.createElement('div');
      item.className = 'demand-item';
      item.innerHTML = `<span class="demand-text">${escapeHtml(d.title)}</span>
        <button class="btn-secondary btn-vote" data-id="${escapeHtml(String(d.id))}">▲ ${fmt(d.votes)}</button>`;
      list.appendChild(item);
    }
  } catch (err) { console.error('Demands load error:', err); }
}

document.getElementById('demands-list')?.addEventListener('click', async e => {
  const btn = e.target.closest('.btn-vote');
  if (!btn) return;
  const demandId = btn.dataset.id;
  try {
    const res = await fetch('/api/demands/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demandId }),
    });
    const data = await res.json();
    if (data.success) {
      btn.textContent = `▲ ${fmt(data.demand.votes)}`;
    }
  } catch (err) { console.error('Vote error:', err); }
});

loadDemands();

// ── Community board ────────────────────────────────────────────────────────
async function loadCommunityPosts() {
  const list = document.getElementById('community-list');
  if (!list) return;
  try {
    const res = await fetch('/api/community');
    const data = await res.json();
    if (!data.success) return;
    list.innerHTML = '';
    for (const p of data.posts) {
      const card = document.createElement('div');
      card.className = 'community-post';
      card.dataset.id = p.id;
      card.innerHTML = `<div class="post-header">
          <span class="post-alias">${escapeHtml(p.author_alias)}</span>
          <span class="post-chapter">${escapeHtml(p.author_chapter || '')}</span>
          <span class="post-category">${escapeHtml(p.category || '')}</span>
        </div>
        <h4 class="post-title">${escapeHtml(p.title)}</h4>
        <p class="post-content">${escapeHtml(p.content)}</p>
        <button class="btn-secondary btn-upvote" data-id="${escapeHtml(String(p.id))}">▲ ${fmt(p.upvotes)}</button>`;
      list.appendChild(card);
    }
  } catch (err) { console.error('Community load error:', err); }
}

document.getElementById('community-list')?.addEventListener('click', async e => {
  const btn = e.target.closest('.btn-upvote');
  if (!btn) return;
  const postId = btn.dataset.id;
  try {
    const res = await fetch('/api/community/upvote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId }),
    });
    const data = await res.json();
    if (data.success) btn.textContent = `▲ ${fmt(data.post.upvotes)}`;
  } catch (err) { console.error('Upvote error:', err); }
});

document.getElementById('community-post-form')?.addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('community-msg');
  const btn = this.querySelector('.btn-post-submit');
  const author_email = document.getElementById('cp-email')?.value.trim();
  const title = document.getElementById('cp-title')?.value.trim();
  const content = document.getElementById('cp-content')?.value.trim();
  const category = document.getElementById('cp-category')?.value.trim();

  if (!author_email || !title || !content) {
    if (msg) { msg.textContent = 'Email, title, and content are required.'; msg.className = 'form-msg error'; }
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Posting…';
  try {
    const res = await fetch('/api/community', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author_email, title, content, category }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
    if (msg) { msg.textContent = 'Post published!'; msg.className = 'form-msg success'; }
    this.reset();
    loadCommunityPosts();
  } catch (err) {
    if (msg) { msg.textContent = err.message || 'Something went wrong.'; msg.className = 'form-msg error'; }
  } finally {
    btn.disabled = false;
    btn.textContent = 'POST';
  }
});

loadCommunityPosts();

// ── Tier 2 registration modal ──────────────────────────────────────────────
document.getElementById('btn-open-tier2')?.addEventListener('click', () => {
  document.getElementById('tier2-modal')?.classList.remove('hidden');
});

document.getElementById('tier2-modal-close')?.addEventListener('click', () => {
  document.getElementById('tier2-modal')?.classList.add('hidden');
});

document.getElementById('tier2-form')?.addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('tier2-msg');
  const btn = this.querySelector('.btn-tier2-submit');
  const alias = document.getElementById('t2-alias')?.value.trim();
  const email = document.getElementById('t2-email')?.value.trim();
  const phone = document.getElementById('t2-phone')?.value.trim();
  const state = document.getElementById('t2-state')?.value.trim();
  const chapter = document.getElementById('t2-chapter')?.value.trim();
  const invite_code = document.getElementById('t2-invite')?.value.trim();

  if (!alias || !email) {
    if (msg) { msg.textContent = 'Alias and email are required.'; msg.className = 'form-msg error'; }
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Verifying…';
  try {
    const res = await fetch('/api/register-tier2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias, email, phone, state, chapter, invite_code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
    if (msg) { msg.textContent = data.message || 'Tier 2 verified!'; msg.className = 'form-msg success'; }
    this.reset();
  } catch (err) {
    if (msg) { msg.textContent = err.message || 'Something went wrong.'; msg.className = 'form-msg error'; }
  } finally {
    btn.disabled = false;
    btn.textContent = 'VERIFY';
  }
});
