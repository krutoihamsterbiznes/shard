/* ============================================================
   SHARD — common.js
   Theme, ripple, snackbar, storage helpers, validation, captcha
   ============================================================ */
'use strict';

const Shard = {};

/* ---------- Storage (local "crate"-like persistence until Rust server) ---------- */
Shard.store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem('shard.' + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('shard.' + key, JSON.stringify(value)); } catch {}
  },
  del(key) {
    try { localStorage.removeItem('shard.' + key); } catch {}
  },
};

/* ---------- Session ---------- */
Shard.session = {
  get user() { return Shard.store.get('session', null); },
  login(user) { Shard.store.set('session', { ...user, token: 'dev-token-' + Date.now(), ts: Date.now() }); },
  logout() { Shard.store.del('session'); location.href = 'login.html'; },
  require() {
    if (!this.user) { location.href = 'login.html'; return false; }
    return true;
  },
};

/* ---------- Theme ---------- */
Shard.theme = {
  apply(t) {
    document.documentElement.dataset.theme = t;
    Shard.store.set('theme', t);
  },
  toggle() {
    const cur = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    this.apply(cur);
    document.dispatchEvent(new CustomEvent('shard:theme', { detail: cur }));
  },
  init() {
    let t = Shard.store.get('theme', null);
    if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    this.apply(t);
  },
};
Shard.theme.init();

/* ---------- Icons ---------- */
Shard.icon = (name, size = 22) => {
  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eye_off: '<path d="M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A16.7 16.7 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    chat: '<path d="M21 12a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.9-.9L3.5 21l1.4-4.1A8.5 8.5 0 1 1 21 12Z"/>',
    call: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.9Z"/>',
    groups: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    channel: '<path d="M4 10v4a1 1 0 0 0 1 1h3l5 4V5L8 9H5a1 1 0 0 0-1 1Z"/><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"/>',
    notes: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V22a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H2a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V2a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H22a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>',
    collapse: '<path d="M15 6l-6 6 6 6"/><path d="M20 4v16"/>',
    expand: '<path d="M9 6l6 6-6 6"/><path d="M4 4v16"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
    more: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
    video: '<path d="M23 7 16 12 23 17Z"/><rect x="1" y="5" width="15" height="14" rx="3"/>',
    person: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    shard_logo: '<path d="M12 2 4 9l8 13 8-13Z" fill="currentColor" stroke="none" opacity=".9"/><path d="M12 2 4 9l8 4 8-4Z" fill="#fff" stroke="none" opacity=".35"/>',
  };
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
};

/* ---------- Ripple ---------- */
Shard.rippleInit = () => {
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.btn, .icon-btn, .rail-btn, .chat-item, .sr-item, .collapse-btn');
    if (!el || el.disabled) return;
    const rect = el.getBoundingClientRect();
    const d = Math.max(rect.width, rect.height);
    const r = document.createElement('span');
    r.className = 'ripple';
    r.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - rect.left - d / 2}px;top:${e.clientY - rect.top - d / 2}px`;
    el.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
  });
};

/* ---------- Snackbar ---------- */
Shard.toast = (text, kind = '') => {
  let root = document.getElementById('snackbar-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'snackbar-root';
    document.body.appendChild(root);
  }
  const s = document.createElement('div');
  s.className = 'snackbar ' + kind;
  s.textContent = text;
  root.appendChild(s);
  setTimeout(() => {
    s.classList.add('out');
    s.addEventListener('animationend', () => s.remove());
  }, 3200);
};

/* ---------- Validation ---------- */
Shard.validate = {
  username(v) {
    if (!/^[a-zA-Z]{4,20}$/.test(v)) {
      return 'Юзернейм: 4–20 символов, только латиница (a–z, A–Z), без пробелов и спецсимволов';
    }
    return '';
  },
  password(v) {
    if (v.length < 10 || v.length > 32) return 'Пароль должен содержать от 10 до 32 символов';
    return '';
  },
  displayName(v) {
    if (!v.trim()) return 'Имя не может быть пустым';
    if (v.trim().length > 40) return 'Имя слишком длинное (макс. 40)';
    return '';
  },
};

Shard.pwStrength = (pw) => {
  let score = 0;
  if (pw.length >= 10) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (pw.length < 10) score = Math.min(score, 1);
  return score; // 0..4
};

/* ---------- Captcha (canvas-based challenge) ---------- */
Shard.captcha = {
  makeId: () => Math.random().toString(36).slice(2, 10).toUpperCase().replace(/[^A-Z0-9]/g, 'X').slice(0, 6),

  create(mountEl) {
    /* mountEl contains: canvas + hidden refresh button; returns controller */
    const canvas = mountEl.querySelector('canvas') || (() => {
      const c = document.createElement('canvas');
      c.width = 150; c.height = 46;
      c.title = 'Обновить капчу';
      c.style.cssText = 'border-radius:var(--r-md);cursor:pointer;touch-action:manipulation;width:150px;height:46px;flex:none;box-shadow:inset 0 0 0 1.5px var(--md-outline-variant);transition:transform var(--dur-m) var(--ease-spring)';
      mountEl.prepend(c);
      return c;
    })();

    const ctrl = { canvas, code: '', refresh };
    refresh();
    canvas.addEventListener('click', refresh);

    function refresh() {
      ctrl.code = Shard.captcha.makeId();
      draw(ctrl.code, canvas);
    }
    return ctrl;

    function draw(text, cv) {
      const ctx = cv.getContext('2d');
      const W = cv.width, H = cv.height;
      const dark = document.documentElement.dataset.theme === 'dark';

      ctx.clearRect(0, 0, W, H);
      // background
      const bg = ctx.createLinearGradient(0, 0, W, H);
      if (dark) { bg.addColorStop(0, '#2B2930'); bg.addColorStop(1, '#211F26'); }
      else { bg.addColorStop(0, '#EFEAF9'); bg.addColorStop(1, '#E3E0F5'); }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // noise dots
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(${Math.random() > .5 ? '108,92,232' : '255,138,101'},${Math.random() * .35})`;
        ctx.beginPath();
        ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 1.8, 0, 7);
        ctx.fill();
      }
      // wavy lines
      for (let l = 0; l < 3; l++) {
        ctx.strokeStyle = `rgba(108,92,232,${.18 + Math.random() * .2})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 4) {
          const y = H / 2 + Math.sin(x / 14 + l * 2.2 + Math.random() * .4) * (H / 3.4);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // characters
      const colors = ['#6C5CE8', '#8E44AD', '#FF7043', '#5E35B1', '#A78BFA'];
      for (let i = 0; i < text.length; i++) {
        ctx.save();
        const x = 16 + i * ((W - 30) / text.length);
        const y = H / 2 + (Math.random() * 10 - 5);
        ctx.translate(x, y);
        ctx.rotate((Math.random() * 36 - 18) * Math.PI / 180);
        ctx.font = `900 ${24 + Math.random() * 8}px "Courier New", monospace`;
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillText(text[i], 0, 8);
        ctx.restore();
      }
    }
  },
};

/* ---------- Field helper: attach error messages ---------- */
Shard.fieldSetError = (fieldEl, msg) => {
  const hint = fieldEl.querySelector('.hint');
  fieldEl.classList.toggle('invalid', !!msg);
  if (hint) hint.textContent = msg || (hint.dataset.default || '');
};

/* ---------- DOM ready ---------- */
Shard.ready = (fn) => {
  if (document.readyState !== 'loading') fn();
  else document.addEventListener('DOMContentLoaded', fn);
};

Shard.ready(() => Shard.rippleInit());
