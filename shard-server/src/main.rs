//! Shard messenger — Rust server.
//!
//! Пока что: регистрация/вход с Argon2id, серверная капча, хранение юзеров
//! в JSON-файле `data/users.json` (аналог creite — простая сериализация
//! структур в файлы). Позже заменим на настоящую БД и добавим чаты/ws.

mod api;
mod auth;
mod captcha_service;
mod db;

use axum::{routing::get, Router};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

pub struct AppState {
    pub db: Arc<db::JsonDb>,
    pub captchas: Arc<captcha_service::CaptchaStore>,
}

#[tokio::main]
async fn main() {
    let db = Arc::new(db::JsonDb::open("data/users.json").expect("failed to open data/users.json"));
    let state = AppState {
        db,
        captchas: Arc::new(captcha_service::CaptchaStore::new()),
    };

    // чистим протухшие капчи фоном
    {
        let c = state.captchas.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                c.sweep();
            }
        });
    }

    let cors = CorsLayer::new()
        .allow_origin(Any) // TODO: сузить до домена сайта
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/health", get(|| async { "shard ok ✦" }))
        .merge(api::routes())
        .with_state(state)
        .layer(cors)
        // раздача фронтенда в проде: cargo run из shard-server, сайт рядом
        .nest_service("/", ServeDir::new("../shard-frontend"));

    let addr = "0.0.0.0:8080";
    println!("Shard server listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
