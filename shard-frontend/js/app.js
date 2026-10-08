/* ============================================================
   SHARD — app.js  (main page: rail, chat list, self-chat, search, profile)
   ============================================================ */
'use strict';

Shard.ready(() => {
  if (!Shard.session.require()) return;

  /* ---------- state ---------- */
  let me = Shard.session.user;
  const refreshMe = () => {
    const dbUser = Shard.store.get('users', []).find(u => u.id === me.id);
    if (dbUser) {
      const { passwordHash, ...safe } = dbUser;
      me = { ...safe, token: me.token, ts: me.ts };
      Shard.store.set('session', me);
    }
  };
  refreshMe();

  const initials = (name) => name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const getMessages = () => Shard.store.get('selfchat.' + me.id, []);
  const setMessages = (m) => Shard.store.set('selfchat.' + me.id, m);

  /* ---------- DOM refs ---------- */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const railEl = $('#rail');
  const chatListEl = $('#chat-list');
  const messagesEl = $('#messages');
  const composerInput = $('#composer-input');
  const sendBtn = $('#send-btn');
  const searchInput = $('#search-input');
  const searchClear = $('#search-clear');
  const searchResults = $('#search-results');
  const drawer = $('#profile-drawer');
  const scrim = $('#drawer-scrim');
  const profileAvatarBtn = $('#profile-btn');
  const headerAvatar = $('#header-avatar');
  const selfNameEl = $('#self-name');

  /* ---------- theme toggle ---------- */
  const themeBtn = $('#theme-toggle');
  const paintTheme = () => {
    themeBtn.innerHTML = Shard.icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon');
  };
  paintTheme();
  document.addEventListener('shard:theme', paintTheme);
  themeBtn.addEventListener('click', () => Shard.theme.toggle());

  /* ---------- left rail ---------- */
  const RAIL_ITEMS = [
    { id: 'chats', label: 'Чаты', icon: 'chat' },
    { id: 'calls', label: 'Звонки', icon: 'call' },
    { id: 'groups', label: 'Группы', icon: 'groups' },
    { id: 'channels', label: 'Каналы', icon: 'channel' },
    { id: 'notes', label: 'Заметки', icon: 'notes' },
  ];
  const railBottom = [
    { id: 'settings', label: 'Настройки', icon: 'settings' },
  ];

  function buildRail() {
    railEl.innerHTML = `<div class="rail-logo">${Shard.icon('shard_logo', 26)}</div>`;
    const mk = (item) => {
      const b = document.createElement('button');
      b.className = 'rail-btn' + (item.id === activeSection ? ' active' : '');
      b.dataset.section = item.id;
      b.innerHTML = Shard.icon(item.icon, 23) + `<span class="rail-label">${item.label}</span>`;
      if (item.id === 'notes') b.innerHTML += '<span class="badge">1</span>';
      b.addEventListener('click', () => selectSection(item.id));
      return b;
    };
    RAIL_ITEMS.forEach(i => railEl.appendChild(mk(i)));
    const sp = document.createElement('div');
    sp.className = 'rail-spacer';
    railEl.appendChild(sp);
    railBottom.forEach(i => railEl.appendChild(mk(i)));
  }

  let activeSection = 'chats';
  function selectSection(id) {
    activeSection = id;
    $('#section-title').textContent = SECTION_TITLE[id] || 'Чаты';
    $$('.rail-btn').forEach(b => b.classList.toggle('active', b.dataset.section === id));
    renderChatList();
    if (id !== 'chats' && id !== 'notes') {
      const title = RAIL_ITEMS.find(r => r.id === id)?.label || 'Раздел';
      Shard.toast(`«${title}» — скоро здесь появится интерфейс`);
    }
    // on mobile, opening a section shows the list column
    document.body.classList.add('list-open-mobile');
  }

  /* ---------- chat list (empty for now, by design) ---------- */
  const SECTION_TITLE = { chats: 'Чаты', calls: 'Звонки', groups: 'Группы', channels: 'Каналы', notes: 'Заметки', settings: 'Настройки' };

  const SECTION_EMPTY = {
    chats:    { text: 'Пока нет чатов. Найдите собеседника через поиск наверху.', icon: 'chat' },
    calls:    { text: 'Звонки ещё не реализованы — они появятся здесь.', icon: 'call' },
    groups:   { text: 'Создавайте группы с друзьями. Функция в разработке.', icon: 'groups' },
    channels: { text: 'Каналы и трансляции — совсем скоро.', icon: 'channel' },
    notes:    { text: 'Ваши заметки будут храниться здесь.', icon: 'notes' },
    settings: { text: 'Откройте профиль кнопкой справа вверху панели поиска.', icon: 'settings' },
  };

  function renderChatList() {
    chatListEl.innerHTML = '';
    // pinned "saved messages" (chat with yourself) always visible in chats/notes
    if (activeSection === 'chats' || activeSection === 'notes') {
      const item = document.createElement('div');
      item.className = 'chat-item selected';
      item.style.animationDelay = '40ms';
      const last = getMessages().slice(-1)[0];
      item.innerHTML = `
        <div class="avatar round" style="background:var(--md-tertiary-container);color:var(--md-on-tertiary-container)">
          ${Shard.icon('notes', 22)}
        </div>
        <div class="meta">
          <div class="name">Избранное · вы</div>
          <div class="preview">${last ? escapeHtml(last.text) : 'Ваши личные заметки и пересылки'}</div>
        </div>
        <span class="time">${last ? timeStr(last.ts) : ''}</span>`;
      item.addEventListener('click', () => scrollToChat());
      chatListEl.appendChild(item);
    }

    const info = SECTION_EMPTY[activeSection] || SECTION_EMPTY.chats;
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-icon">${Shard.icon(info.icon, 38)}</div>
      <div class="body">${info.text}</div>`;
    chatListEl.appendChild(empty);
  }

  function scrollToChat() {
    document.body.classList.remove('list-open-mobile');
    messagesEl.scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------- collapse / expand chat list ---------- */
  $('#collapse-btn').addEventListener('click', () => {
    document.body.classList.add('list-collapsed');
    document.body.classList.remove('list-open-mobile');
  });
  $('#expand-fab').addEventListener('click', () => {
    document.body.classList.remove('list-collapsed');
  });

  /* ---------- self-chat ---------- */
  function timeStr(ts) {
    return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  function dayStr(ts) {
    const d = new Date(ts), n = new Date();
    if (d.toDateString() === n.toDateString()) return 'Сегодня';
    const y = new Date(n); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderMessages() {
    const msgs = getMessages();
    messagesEl.innerHTML = '';

    if (!msgs.length) {
      const hello = document.createElement('div');
      hello.className = 'msg in';
      hello.style.maxWidth = 'min(80%, 520px)';
      hello.innerHTML = `Это чат с самим собой — «Избранное».<br>
        Записывайте мысли, сохраняйте ссылки, тренируйтесь отправлять сообщения. 💜
        <span class="msg-time">${timeStr(Date.now())}</span>`;
      messagesEl.appendChild(hello);
      return;
    }

    let lastDay = '';
    msgs.forEach((m, i) => {
      const day = dayStr(m.ts);
      if (day !== lastDay) {
        lastDay = day;
        const div = document.createElement('div');
        div.className = 'day-divider';
        div.textContent = day;
        messagesEl.appendChild(div);
      }
      const el = document.createElement('div');
      el.className = 'msg out';
      el.style.animationDelay = Math.min(i * 25, 250) + 'ms';
      el.innerHTML = `${escapeHtml(m.text).replace(/\n/g, '<br>')}<span class="msg-time">${timeStr(m.ts)} ✓✓</span>`;
      messagesEl.appendChild(el);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function sendMessage() {
    const text = composerInput.value.trim();
    if (!text) return;
    const msgs = getMessages();
    msgs.push({ id: 'm_' + Date.now(), text, ts: Date.now() });
    setMessages(msgs);
    composerInput.value = '';
    composerInput.style.height = 'auto';
    sendBtn.disabled = true;
    renderMessages();
    renderChatList();

    // playful auto-reply from "yourself"
    setTimeout(() => {
      const t = document.createElement('div');
      t.className = 'typing';
      t.innerHTML = '<i></i><i></i><i></i>';
      messagesEl.appendChild(t);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      setTimeout(() => {
        t.remove();
        const replies = ['Принято ✦', 'Записал в шард памяти 🧠', 'Хорошая мысль!', 'Держится в безопасности 🔒', 'Ещё бы кому…'];
        const all = getMessages();
        all.push({ id: 'm_' + Date.now(), text: replies[Math.floor(Math.random() * replies.length)], ts: Date.now() });
        setMessages(all);
        renderMessages();
      }, 1200 + Math.random() * 900);
      setTimeout(() => { messagesEl.scrollTop = messagesEl.scrollHeight; }, 50);
    }, 400);
  }

  sendBtn.disabled = true;
  sendBtn.addEventListener('click', sendMessage);
  composerInput.addEventListener('input', () => {
    sendBtn.disabled = !composerInput.value.trim();
    composerInput.style.height = 'auto';
    composerInput.style.height = Math.min(composerInput.scrollHeight, 140) + 'px';
  });
  composerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  /* ---------- search (users / chats / channels / groups) ---------- */
  const DEMO_DIR = {
    users: [
      { name: 'alice_wave', sub: '@alice_wave · в сети' },
      { name: 'miranda_dev', sub: '@miranda_dev · был(а) недавно' },
      { name: 'kir_illuminati', sub: '@kir_illuminati · не беспокоить' },
      { name: 'shard_fan_42', sub: '@shard_fan_42 · в сети' },
      { name: 'nova_rust', sub: '@nova_rust · пишет код' },
    ],
    chats: [{ name: 'Рабочая группа', sub: '12 участников' }],
    groups: [
      { name: 'Rust Devs', sub: 'группа · 348 участников' },
      { name: 'Material Design Fans', sub: 'группа · 91 участник' },
    ],
    channels: [
      { name: 'Shard News', sub: 'канал · 1 204 подписчика' },
      { name: 'Кристаллы дня', sub: 'канал · 77 подписчиков' },
    ],
  };

  let searchTimer = null;
  function closeSearch() { searchResults.classList.add('hidden'); }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim().toLowerCase();
    searchClear.classList.toggle('show', !!q);
    if (!q) { closeSearch(); return; }
    searchTimer = setTimeout(() => runSearch(q), 160);
  });
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) runSearch(searchInput.value.trim().toLowerCase());
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.remove('show');
    closeSearch();
    searchInput.focus();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap') && !e.target.closest('.search-results')) closeSearch();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSearch(); closeDrawer(); } });

  function runSearch(q) {
    const sections = [];
    const match = (x) => x.name.toLowerCase().includes(q) || x.sub.toLowerCase().includes(q);
    const filter = (arr) => arr.filter(match).slice(0, 4);

    const found = {
      'Пользователи': filter(DEMO_DIR.users.concat(me ? [{ name: me.username, sub: '@' + me.username + ' · это вы' }] : [])),
      'Чаты': filter(DEMO_DIR.chats),
      'Группы': filter(DEMO_DIR.groups),
      'Каналы': filter(DEMO_DIR.channels),
    };
    const icons = { 'Пользователи': 'person', 'Чаты': 'chat', 'Группы': 'groups', 'Каналы': 'channel' };

    searchResults.innerHTML = '';
    let total = 0;
    for (const [label, items] of Object.entries(found)) {
      if (!items.length) continue;
      total += items.length;
      const h = document.createElement('div');
      h.className = 'sr-group-label';
      h.textContent = label;
      searchResults.appendChild(h);
      items.forEach((it, idx) => {
        const row = document.createElement('div');
        row.className = 'sr-item';
        row.style.animation = `item-in var(--dur-m) var(--ease-spring) both`;
        row.style.animationDelay = idx * 40 + 'ms';
        row.innerHTML = `
          <div class="avatar sm">${Shard.icon(icons[label], 18)}</div>
          <div style="min-width:0"><div class="sr-name">${escapeHtml(it.name)}</div>
          <div class="sr-sub">${escapeHtml(it.sub)}</div></div>`;
        row.addEventListener('click', () => {
          closeSearch();
          searchInput.value = it.name;
          searchClear.classList.add('show');
          Shard.toast(`«${it.name}» — диалоги с другими пользователями появятся после подключения Rust-сервера`);
        });
        searchResults.appendChild(row);
      });
    }
    if (!total) {
      searchResults.innerHTML = `<div class="sr-empty">Ничего не найдено по запросу «${escapeHtml(q)}»</div>`;
    }
    searchResults.classList.remove('hidden');
  }

  /* ---------- profile button & drawer ---------- */
  function paintProfile() {
    profileAvatarBtn.innerHTML = `<div class="avatar round">${initials(me.displayName || me.username)}</div><span class="status-dot"></span>`;
    headerAvatar.innerHTML = `<div class="avatar sm round" style="width:42px;height:42px">${initials(me.displayName || me.username)}</div>`;
    selfNameEl.textContent = me.displayName || me.username;
    $('.chat-header .status').textContent = '@' + me.username + ' · Избранное';
    $('#drawer-avatar').textContent = initials(me.displayName || me.username);
    $('#drawer-name').textContent = me.displayName || me.username;
    $('#drawer-user').textContent = '@' + me.username;
  }

  function openDrawer() {
    $('#pf-display').value = me.displayName || '';
    $('#pf-username').value = me.username;
    $('#pf-bio').value = me.bio || '';
    updateBioCount();
    drawer.classList.add('open');
    scrim.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#pf-display').focus(), 350);
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    scrim.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }
  profileAvatarBtn.addEventListener('click', openDrawer);
  $('#drawer-close').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);

  const bioEl = $('#pf-bio');
  function updateBioCount() { $('#bio-count').textContent = bioEl.value.length + ' / 160'; }
  bioEl.addEventListener('input', updateBioCount);

  /* save profile */
  $('#pf-save').addEventListener('click', () => {
    const display = $('#pf-display').value.trim();
    const err = Shard.validate.displayName(display);
    if (err) { Shard.fieldSetError($('#pf-display').closest('.field'), err); return; }
    const bio = bioEl.value.slice(0, 160);
    const updated = UserDB_update(me.id, { displayName: display, bio });
    if (updated) me = { ...me, ...updated };
    Shard.session.login(me);
    paintProfile();
    const btn = $('#pf-save');
    btn.classList.add('save-pulse');
    setTimeout(() => btn.classList.remove('save-pulse'), 700);
    Shard.toast('Профиль сохранён', 'ok');
  });
  function UserDB_update(userId, patch) {
    const users = Shard.store.get('users', []);
    const i = users.findIndex(u => u.id === userId);
    if (i === -1) return null;
    users[i] = { ...users[i], ...patch };
    Shard.store.set('users', users);
    return patch;
  }

  $('#pf-logout').addEventListener('click', () => Shard.session.logout());

  /* settings rail button opens profile too (until real settings exist) */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.rail-btn[data-section="settings"]');
    if (b) setTimeout(openDrawer, 250);
  });

  /* ---------- init ---------- */
  buildRail();
  renderChatList();
  renderMessages();
  paintProfile();

  // greeting
  const hour = new Date().getHours();
  const greet = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  setTimeout(() => Shard.toast(`${greet}, ${me.displayName || me.username} ✦`), 700);
});
