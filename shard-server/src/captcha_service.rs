//! Серверная капча: генерация PNG + хранение ответов с TTL.
//! Клиент получает captcha_id + картинку, вводит текст, сервер проверяет.

use captcha::{generate, Difficulty};
use image::GenericImage;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use uuid::Uuid;

const TTL: Duration = Duration::from_secs(5 * 60);

struct Entry {
    answer: String,
    created: Instant,
}

#[derive(Default)]
pub struct CaptchaStore {
    inner: Mutex<HashMap<Uuid, Entry>>,
}

impl CaptchaStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Вернуть (captcha_id, png_bytes)
    pub fn issue(&self) -> (Uuid, Vec<u8>) {
        // Medium — читаемо для человека, средне для ботов.
        let captcha = generate(Difficulty::Medium);
        let text = captcha.text().to_string();
        let id = Uuid::new_v4();

        let mut buf = std::io::Cursor::new(Vec::new());
        captcha.image().write_to(&mut buf, image::ImageFormat::Png)
            .expect("png encode");

        self.inner.lock().unwrap().insert(
            id,
            Entry {
                answer: text.to_lowercase(),
                created: Instant::now(),
            },
        );
        (id, buf.into_inner())
    }

    /// Проверить ответ. Одноразовая: после проверки удаляем.
    pub fn verify(&self, id: Uuid, guess: &str) -> bool {
        let mut map = self.inner.lock().unwrap();
        if let Some(e) = map.remove(&id) {
            return e.created.elapsed() < TTL && e.answer == guess.trim().to_lowercase();
        }
        false
    }

    /// Удалить протухшие (фон-задача из main).
    pub fn sweep(&self) {
        self.inner
            .lock()
            .unwrap()
            .retain(|_, e| e.created.elapsed() < TTL);
    }
}
