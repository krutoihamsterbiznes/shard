# Shard ✦ — мессенджер

Фронтенд: **HTML / CSS / JS** (Material 3 Expressive + liquid glass)
Бэкенд (в разработке): **Rust** (`shard-server`, axum) — пароли: **Argon2id**
Хранилище пока: простое, «как creite» — JSON-файл `data/users.json` на сервере
(на фронте для демо — localStorage).

## Структура

```
shard-frontend/          # сайт
├── start.html           # роутер: сессия есть → index.html, нет → login.html
├── login.html           # вход: юзернейм + пароль + капча
├── register.html        # регистрация: юзернейм(4–20, латиница) + пароль(10–32) + капча
├── index.html           # главная (когда залогинен)
│                        #   • слева рельс: Чаты / Звонки / Группы / Каналы / Заметки / Настройки
│                        #   • панель сверху: поиск (люди, чаты, группы, каналы) + аватар профиля
│                        #   • список чатов (пока пустой) — сворачивается, чат становится почти во весь экран
│                        #   • по центру — чат с самим собой («Избранное»)
│                        #   • профиль открывается drawer'ом справа и редактируется
├── css/  base.css auth.css app.css
└── js/   common.js auth.js app.js

shard-server/            # Rust backend (скелет API)
├── Cargo.toml           # axum, argon2, captcha, serde, uuid…
└── src/
    ├── main.rs          # запуск, CORS, раздача фронтенда со :8080
    ├── api.rs           # GET /api/captcha, POST /api/auth/register, POST /api/auth/login
    ├── auth.rs          # Argon2id (m=64MiB, t=3, p=4) + валидация юзернейма/пароля (+тесты)
    ├── captcha_service.rs  # серверная капча: PNG + captcha_id, TTL 5 мин, одноразовая
    └── db.rs            # JsonDb — сериализация юзеров в data/users.json
```

## Запуск сайта (демо-режим, без сервера)

Демо-бэкенд живёт в браузере (localStorage), капча рисуется на canvas:

```bash
cd shard-frontend
python3 -m http.server 5500     # или любой статический сервер
# открыть http://localhost:5500/start.html
```

⚠️ `crypto.subtle` (хэширование демо-паролей) требует `http://localhost`
или https — не открывайте файлы через `file://`.

Регистрация → автологин → главная. Выход: профиль → «Выйти».

## Запуск Rust-сервера (когда будете готовы)

```bash
cd shard-server
cargo run              # http://localhost:8080 — раздаёт и сайт, и API
cargo test             # тесты Argon2id и валидации
```

API уже совпадает с ожиданиями фронта (`/api/auth/register`, `/api/auth/login`).
Фронт сейчас при недоступности сервера падает на локальное демо-хранилище.

## Важно про пароли 🔐

* **Argon2id — только на сервере** (`shard-server/src/auth.rs`, crate `argon2`).
  Хэш вида `$argon2id$v=19$m=65536,t=3,p=4$salt$hash` кладётся в базу; пароль
  никогда не покидает браузер в открытом виде даже в демо.
* Клиентский SHA-256 в `js/auth.js` — **временная заглушка демо-режима**, её надо
  убрать при подключении к серверу (пароль должен уходить по TLS на бэк и
  хэшироваться там).
* Капча на проде должна быть серверной — эндпоинт `GET /api/captcha` уже готов.

## Дальше по плану

- [ ] Чаты/сообщения: WebSocket (tokio-tungstenite) + хранение
- [ ] JWT/сессии вместо `dev-token`
- [ ] Настоящая БД (SQLite/Postgres) вместо JSON-файла
- [ ] Профили других пользователей, группы, каналы, заметки
- [ ] Серверная капча в фронтах login/register (замена canvas-демо)
