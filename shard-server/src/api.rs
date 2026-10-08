//! HTTP-эндпоинты: /api/captcha, /api/auth/register, /api/auth/login.

use crate::auth;
use crate::db::UserRecord;
use crate::AppState;
use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/captcha", get(get_captcha))
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
}

/* ---------------- captcha ---------------- */

#[derive(Serialize)]
struct CaptchaResp {
    captcha_id: Uuid,
    /// data:image/png;base64,...
    image: String,
}

async fn get_captcha(State(st): State<AppState>) -> Json<CaptchaResp> {
    let (id, png) = st.captchas.issue();
    Json(CaptchaResp {
        captcha_id: id,
        image: format!("data:image/png;base64,{}", base64(&png)),
    })
}

fn base64(bytes: &[u8]) -> String {
    // компактный base64 без зависимостей
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            chunk.get(1).copied().unwrap_or(0),
            chunk.get(2).copied().unwrap_or(0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(T[(n >> 18 & 63) as usize] as char);
        out.push(T[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6 & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[(n & 63) as usize] as char } else { '=' });
    }
    out
}

/* ---------------- register ---------------- */

#[derive(Deserialize)]
struct RegisterReq {
    username: String,
    password: String,
    #[serde(default)]
    display_name: Option<String>,
    captcha_id: Uuid,
    captcha: String,
}

#[derive(Serialize)]
struct PublicUser {
    id: Uuid,
    username: String,
    display_name: String,
    bio: String,
}

impl From<&UserRecord> for PublicUser {
    fn from(u: &UserRecord) -> Self {
        Self {
            id: u.id,
            username: u.username.clone(),
            display_name: u.display_name.clone(),
            bio: u.bio.clone(),
        }
    }
}

async fn register(
    State(st): State<AppState>,
    Json(req): Json<RegisterReq>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, Json<serde_json::Value>)> {
    let err = |code, msg: &str| {
        (
            code,
            Json(serde_json::json!({ "ok": false, "error": msg })),
        )
    };

    if !auth::valid_username(&req.username) {
        return Err(err(StatusCode::BAD_REQUEST, "invalid_username"));
    }
    if !auth::valid_password(&req.password) {
        return Err(err(StatusCode::BAD_REQUEST, "invalid_password"));
    }
    if !st.captchas.verify(req.captcha_id, &req.captcha) {
        return Err(err(StatusCode::BAD_REQUEST, "bad_captcha"));
    }
    if st.db.find_by_username(&req.username).is_some() {
        return Err(err(StatusCode::CONFLICT, "username_taken"));
    }

    let hash = auth::hash_password(&req.password)
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "hash_failed"))?;

    let rec = UserRecord {
        id: Uuid::new_v4(),
        username: req.username.clone(),
        display_name: req
            .display_name
            .filter(|d| !d.trim().is_empty())
            .unwrap_or_else(|| req.username.clone()),
        bio: String::new(),
        password_hash: hash,
        created_at_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis(),
    };

    st.db
        .insert_user(rec.clone())
        .map_err(|_| err(StatusCode::CONFLICT, "username_taken"))?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "ok": true,
            "user": PublicUser::from(&rec),
            "token": format!("dev-{}", Uuid::new_v4()), // TODO: JWT / session cookie
        })),
    ))
}

/* ---------------- login ---------------- */

#[derive(Deserialize)]
struct LoginReq {
    username: String,
    password: String,
    captcha_id: Uuid,
    captcha: String,
}

async fn login(
    State(st): State<AppState>,
    Json(req): Json<LoginReq>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let bad = |msg: &str| {
        (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "ok": false, "error": msg })),
        )
    };

    if !st.captchas.verify(req.captcha_id, &req.captcha) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "ok": false, "error": "bad_captcha" })),
        ));
    }
    let user = st.db.find_by_username(&req.username).ok_or_else(|| bad("bad_credentials"))?;
    if !auth::verify_password(&req.password, &user.password_hash) {
        return Err(bad("bad_credentials"));
    }

    Ok(Json(serde_json::json!({
        "ok": true,
        "user": PublicUser::from(&user),
        "token": format!("dev-{}", Uuid::new_v4()), // TODO: JWT / session cookie
    })))
}
