/* ===== THE PEOPLE'S UNION — Client App ===== */

// ── Utilities ──────────────────────────────────────────────────────────────
function fmt(n) {
  return Number(n || 0).toLocaleString();
}

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
document.getElementById('btn-print-poster')?.addEventListener('click', () => {
  const headline = document.getElementById('poster-headline')?.value || '';
  const sub = document.getElementById('poster-sub')?.value || '';
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>Poster</title>
    <style>body{font-family:sans-serif;text-align:center;padding:60px;background:#111;color:#fff;}
    h1{font-size:3rem;margin-bottom:1rem;}p{font-size:1.5rem;}img{width:200px;margin-top:2rem;}</style>
    </head><body>
    <h1>${headline.replace(/</g,'&lt;')}</h1>
    <p>${sub.replace(/</g,'&lt;')}</p>
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

// Close kiosk on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeKiosk();
});
