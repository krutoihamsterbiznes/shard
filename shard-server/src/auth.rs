//! Argon2id хэширование и проверка паролей + валидация полей.

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};

/// Параметры как в ТЗ: Argon2id, m=64MiB, t=3, p=4
fn argon2() -> Argon2<'static> {
    Argon2::new(
        Algorithm::Argon2id,
        Version::V0x13,
        Params::new(64 * 1024, 3, 4, None).expect("valid argon2 params"),
    )
}

pub fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    argon2()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| e.to_string())
}

pub fn verify_password(password: &str, encoded_hash: &str) -> bool {
    match PasswordHash::new(encoded_hash) {
        Ok(parsed) => argon2()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

/// юзернейм: 4–20, только латиница
pub fn valid_username(u: &str) -> bool {
    (4..=20).contains(&u.len()) && u.chars().all(|c| c.is_ascii_alphabetic())
}

/// пароль: 10–32 символа
pub fn valid_password(p: &str) -> bool {
    (10..=32).contains(&p.chars().count())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn username_rules() {
        assert!(valid_username("abcd"));
        assert!(valid_username("AliceWave"));
        assert!(!valid_username("abc")); // коротко
        assert!(!valid_username(&"a".repeat(21))); // длинно
        assert!(!valid_username("bob_1")); // спецсимволы/цифры нельзя
        assert!(!valid_username("иван")); // не латиница
    }

    #[test]
    fn password_rules() {
        assert!(valid_password("0123456789"));
        assert!(!valid_password("short9"));
        assert!(!valid_password(&"п".repeat(33)));
    }

    #[test]
    fn argon2_roundtrip() {
        let hash = hash_password("Sup3rSecretPass").unwrap();
        assert!(hash.starts_with("$argon2id$"));
        assert!(verify_password("Sup3rSecretPass", &hash));
        assert!(!verify_password("wrong-password!", &hash));
    }
}
