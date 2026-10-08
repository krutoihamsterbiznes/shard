//! Простое хранилище «как creite»: сериализация структур в JSON-файл.
//! Потокобезопасно через RwLock + атомарная запись во временный файл.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRecord {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    #[serde(default)]
    pub bio: String,
    /// Argon2id encoded hash: "$argon2id$v=19$m=...,t=...,p=...$salt$hash"
    pub password_hash: String,
    pub created_at_ms: u128,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct DbFile {
    #[serde(default)]
    users: Vec<UserRecord>,
}

pub struct JsonDb {
    path: PathBuf,
    data: RwLock<DbFile>,
}

impl JsonDb {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, std::io::Error> {
        let path = path.as_ref().to_path_buf();
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let data = match fs::read_to_string(&path) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
            Err(_) => DbFile::default(),
        };
        Ok(Self { path, data: RwLock::new(data) })
    }

    fn persist(&self) -> std::io::Result<()> {
        let guard = self.data.read().unwrap();
        let json = serde_json::to_string_pretty(&*guard)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, json)?;
        fs::rename(&tmp, &self.path)?;
        Ok(())
    }

    pub fn find_by_username(&self, username: &str) -> Option<UserRecord> {
        self.data
            .read()
            .unwrap()
            .users
            .iter()
            .find(|u| u.username.eq_ignore_ascii_case(username))
            .cloned()
    }

    pub fn insert_user(&self, rec: UserRecord) -> Result<(), String> {
        {
            let mut w = self.data.write().unwrap();
            if w.users
                .iter()
                .any(|u| u.username.eq_ignore_ascii_case(&rec.username))
            {
                return Err("username_taken".into());
            }
            w.users.push(rec);
        }
        self.persist().map_err(|e| e.to_string())
    }

    pub fn update_profile(
        &self,
        user_id: Uuid,
        display_name: String,
        bio: String,
    ) -> Result<UserRecord, String> {
        let rec = {
            let mut w = self.data.write().unwrap();
            let u = w
                .users
                .iter_mut()
                .find(|u| u.id == user_id)
                .ok_or("not_found")?;
            u.display_name = display_name;
            u.bio = bio;
            u.clone()
        };
        self.persist().map_err(|e| e.to_string())?;
        Ok(rec)
    }
}
