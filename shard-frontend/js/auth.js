/* ============================================================
   SHARD — auth.js
   Demo backend: локальное хранилище в стиле "crate" + SHA-256.
   На боевом Rust-сервере пароли хэшируются Argon2id на сервере;
   здесь фронт эмулирует этот слой до подключения API.
   ============================================================ */
'use strict';

const API_BASE = 'http://localhost:8080'; // будущий Rust (actix-web/axum) сервер

/* ---------- demo crypto layer (SHA-256, НЕ Argon2 — см. README) ---------- */
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* salt как у argon2: $argon2id$v=19$m=65536,t=3,p=4$salt$hash — формат для совместимости */
async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = [...saltBytes].map(b => b.toString(16).padStart(2, '0')).join('');
  const h = await sha256Hex(`argon2id-demo:${salt}:${password}`);
  return `$argon2id$v=19$m=65536,t=3,p=4$${salt}$${h}`;
}
async function verifyPassword(password, stored) {
  try {
    const [pre, salt, h] = stored.split('$');
    if (!salt || !h) return false;
    const check = await sha256Hex(`argon2id-demo:${salt}:${password}`);
    // constant-time-ish compare
    if (check.length !== h.length) return false;
    let diff = 0;
    for (let i = 0; i < h.length; i++) diff |= check.charCodeAt(i) ^ h.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

/* ---------- local user DB ("crate"-like store) ---------- */
const UserDB = {
  all() { return Shard.store.get('users', []); },
  save(list) { Shard.store.set('users', list); },
  find(username) {
    return this.all().find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
  },
  async create({ username, password, displayName }) {
    const users = this.all();
    if (this.find(username)) return { ok: false, error: 'Этот юзернейм уже занят' };
    const hash = await hashPassword(password);
    const user = {
      id: 'u_' + Date.now().toString(36),
      username,
      displayName: displayName || username,
      bio: '',
      passwordHash: hash,
      createdAt: Date.now(),
    };
    users.push(user);
    this.save(users);
    return { ok: true, user };
  },
  async login(username, password) {
    const user = this.find(username);
    if (!user) return { ok: false, error: 'Неверный юзернейм или пароль' };
    const good = await verifyPassword(password, user.passwordHash);
    if (!good) return { ok: false, error: 'Неверный юзернейм или пароль' };
    const { passwordHash, ...safe } = user;
    return { ok: true, user: safe };
  },
  update(userId, patch) {
    const users = this.all();
    const i = users.findIndex(u => u.id === userId);
    if (i === -1) return null;
    users[i] = { ...users[i], ...patch };
    this.save(users);
    const { passwordHash, ...safe } = users[i];
    return safe;
  },
};

/* ---------- session helpers ---------- */
function publicUser(u) {
  const { passwordHash, ...safe } = u;
  return safe;
}

/* ============================================================
   UI wiring
   ============================================================ */
Shard.ready(() => {
  const page = document.body.dataset.page; // 'login' | 'register'
  if (!page) return;

  /* already logged in? */
  if (Shard.session.user) { location.href = 'index.html'; return; }

  /* init password-eye icons */
  document.querySelectorAll('.pw-toggle').forEach(b => b.innerHTML = Shard.icon('eye', 20));

  /* theme toggle button */
  const themeBtn = document.getElementById('theme-toggle');
  const paintThemeIcon = () => {
    themeBtn.innerHTML = Shard.icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon');
  };
  paintThemeIcon();
  document.addEventListener('shard:theme', paintThemeIcon);
  themeBtn.addEventListener('click', () => Shard.theme.toggle());

  /* form switching animation */
  const forms = {
    login: document.getElementById('form-login'),
    register: document.getElementById('form-register'),
  };
  function showForm(name) {
    const cur = Object.entries(forms).find(([, el]) => !el.classList.contains('hidden'));
    if (cur && cur[0] === name) return;
    history.pushState(null, '', name + '.html');
    if (cur) {
      cur[1].style.animation = 'none';
      cur[1].classList.add('hidden');
    }
    const next = forms[name];
    next.classList.remove('hidden');
    next.style.animation = '';
    next.classList.remove('rise'); void next.offsetWidth; next.classList.add('rise');
    document.getElementById('auth-subtitle').textContent =
      name === 'login' ? 'Войдите, чтобы продолжить общение' : 'Создайте аккаунт — это займёт минуту';
    document.querySelectorAll('.tab-pill').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === name));
  }
  window.addEventListener('popstate', () => {
    const n = location.pathname.includes('register') ? 'register' : 'login';
    Object.values(forms).forEach(f => f.classList.add('hidden'));
    forms[n].classList.remove('hidden');
  });
  document.querySelectorAll('[data-goto]').forEach(a =>
    a.addEventListener('click', (e) => { e.preventDefault(); showForm(a.dataset.goto); }));

  /* password visibility toggles */
  document.querySelectorAll('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const shown = input.type === 'text';
      input.type = shown ? 'password' : 'text';
      btn.innerHTML = Shard.icon(shown ? 'eye' : 'eye_off', 20);
      input.focus();
    });
  });

  /* captchas */
  const capLogin = Shard.captcha.create(document.getElementById('captcha-login-mount'));
  const capReg = Shard.captcha.create(document.getElementById('captcha-register-mount'));
  const checkCaptcha = (ctrl, input) => {
    const ok = input.value.trim().toUpperCase() === ctrl.code;
    if (!ok) { ctrl.refresh(); input.value = ''; }
    return ok;
  };

  /* password strength meter (register) */
  const pwInput = document.getElementById('r-password');
  const meter = document.getElementById('pw-strength');
  const meterLabel = document.getElementById('pw-strength-label');
  const LABELS = ['', 'слабый', 'средний', 'хороший', 'отличный'];
  pwInput.addEventListener('input', () => {
    const lvl = Shard.pwStrength(pwInput.value);
    meter.dataset.level = lvl;
    [...meter.children].forEach((bar, i) => bar.classList.toggle('on', i < lvl));
    meterLabel.textContent = pwInput.value ? LABELS[lvl] : '';
  });

  /* live validation on blur */
  function liveValidate(input, fn) {
    input.addEventListener('blur', () => {
      const field = input.closest('.field');
      if (!input.value) { field.classList.remove('invalid'); return; }
      const err = fn(input.value);
      Shard.fieldSetError(field, err);
    });
    input.addEventListener('input', () => {
      input.closest('.field').classList.remove('invalid');
    });
  }
  liveValidate(document.getElementById('l-username'), Shard.validate.username);
  liveValidate(document.getElementById('r-username'), Shard.validate.username);
  liveValidate(document.getElementById('r-password'), Shard.validate.password);

  /* submit buttons loading state */
  function withLoading(btn, fn) {
    return async (e) => {
      e.preventDefault();
      if (btn.classList.contains('loading')) return;
      btn.classList.add('loading');
      try { await fn(); } finally { btn.classList.remove('loading'); }
    };
  }

  const shakeCard = () => {
    const card = document.querySelector('.auth-card');
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
  };

  /* ---------------- LOGIN ---------------- */
  const loginBtn = document.getElementById('l-submit');
  forms.login.addEventListener('submit', withLoading(loginBtn, async () => {
    const username = document.getElementById('l-username').value.trim();
    const password = document.getElementById('l-password').value;
    const capInput = document.getElementById('l-captcha');

    let bad = false;
    if (Shard.validate.username(username)) {
      Shard.fieldSetError(document.getElementById('l-username').closest('.field'), 'Введите корректный юзернейм');
      bad = true;
    }
    if (!password) {
      Shard.fieldSetError(document.getElementById('l-password').closest('.field'), 'Введите пароль');
      bad = true;
    }
    if (!checkCaptcha(capLogin, capInput)) {
      Shard.fieldSetError(capInput.closest('.field'), 'Неверная капча, попробуйте ещё раз');
      bad = true;
    }
    if (bad) { shakeCard(); return; }

    let res;
    try {
      res = await apiLogin(username, password);
    } catch {
      res = await UserDB.login(username, password); // offline demo fallback
    }
    if (!res.ok) {
      Shard.fieldSetError(document.getElementById('l-password').closest('.field'), res.error);
      capLogin.refresh();
      shakeCard();
      return;
    }
    Shard.session.login(res.user);
    Shard.toast('С возвращением, ' + res.user.displayName + '!', 'ok');
    setTimeout(() => location.href = 'index.html', 600);
  }));

  /* ---------------- REGISTER ---------------- */
  const regBtn = document.getElementById('r-submit');
  forms.register.addEventListener('submit', withLoading(regBtn, async () => {
    const username = document.getElementById('r-username').value.trim();
    const password = document.getElementById('r-password').value;
    const password2 = document.getElementById('r-password2').value;
    const display = document.getElementById('r-display').value.trim();
    const capInput = document.getElementById('r-captcha');

    let bad = false;
    const uErr = Shard.validate.username(username);
    if (uErr) { Shard.fieldSetError(document.getElementById('r-username').closest('.field'), uErr); bad = true; }
    const pErr = Shard.validate.password(password);
    if (pErr) { Shard.fieldSetError(document.getElementById('r-password').closest('.field'), pErr); bad = true; }
    if (password2 !== password) {
      Shard.fieldSetError(document.getElementById('r-password2').closest('.field'), 'Пароли не совпадают');
      bad = true;
    }
    if (display && Shard.validate.displayName(display)) {
      Shard.fieldSetError(document.getElementById('r-display').closest('.field'), Shard.validate.displayName(display));
      bad = true;
    }
    if (!checkCaptcha(capReg, capInput)) {
      Shard.fieldSetError(capInput.closest('.field'), 'Неверная капча, попробуйте ещё раз');
      bad = true;
    }
    if (bad) { shakeCard(); return; }

    let res;
    try {
      res = await apiRegister({ username, password, displayName: display });
    } catch {
      res = await UserDB.create({ username, password, displayName: display });
    }
    if (!res.ok) {
      Shard.fieldSetError(document.getElementById('r-username').closest('.field'), res.error);
      capReg.refresh();
      shakeCard();
      return;
    }
    Shard.session.login(publicUser(res.user));
    Shard.toast('Аккаунт создан. Добро пожаловать в Shard!', 'ok');
    setTimeout(() => location.href = 'index.html', 700);
  }));

  /* ---------------- real API (when Rust server is up) ---------------- */
  async function apiPost(path, body) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) throw new Error('api');
    return r.json();
  }
  async function apiLogin(username, password) {
    return apiPost('/api/auth/login', { username, password });
  }
  async function apiRegister(payload) {
    return apiPost('/api/auth/register', payload);
  }
});
