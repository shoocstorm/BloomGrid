//! Downloaded model checkpoints: the closed catalog's types, the verified store (`store.rs`) and the
//! chunked download protocol. Ported from Andai (its `laya/catalog.rs`, `laya/store.rs`, `ug.rs`).
//!
//! The Rust side has no HTTP client: the webview fetches each file from its pinned Hugging Face
//! commit and streams it here in chunks; `store::finish` keeps the files only when every size and
//! sha256 matches the catalog.

#[cfg_attr(not(mlx), allow(dead_code))]
pub(crate) mod store;

use serde::Serialize;
use std::borrow::Cow;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Bytes per IPC chunk; the webview sends 8 MiB.
pub const MAX_CHUNK: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CheckpointFile {
    /// Path inside the checkpoint, as on Hugging Face and on disk.
    pub path: Cow<'static, str>,
    pub bytes: u64,
    /// sha256 of the file: the LFS oid for large files, the served file's hash for small JSON ones.
    pub sha256: Cow<'static, str>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Checkpoint {
    pub id: Cow<'static, str>,
    pub repo: Cow<'static, str>,
    /// Immutable commit; `resolve/main` could be moved under us.
    pub commit: Cow<'static, str>,
    pub files: Cow<'static, [CheckpointFile]>,
}

pub const fn f(path: &'static str, bytes: u64, sha256: &'static str) -> CheckpointFile {
    CheckpointFile { path: Cow::Borrowed(path), bytes, sha256: Cow::Borrowed(sha256) }
}

/// A checkpoint of a static catalog.
pub const fn pinned(id: &'static str, repo: &'static str, commit: &'static str, files: &'static [CheckpointFile]) -> Checkpoint {
    Checkpoint { id: Cow::Borrowed(id), repo: Cow::Borrowed(repo), commit: Cow::Borrowed(commit), files: Cow::Borrowed(files) }
}

impl Checkpoint {
    pub fn file(&self, path: &str) -> Result<&CheckpointFile, String> {
        self.files.iter().find(|f| f.path == path).ok_or_else(|| format!("{} has no file {path}", self.id))
    }

    pub fn bytes(&self) -> u64 {
        self.files.iter().map(|f| f.bytes).sum()
    }
}

/// A catalog checkpoint and whether it's downloaded.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointStatus {
    pub id: String,
    pub repo: String,
    pub commit: String,
    pub bytes: u64,
    /// The files the webview downloads.
    pub files: Vec<FileInfo>,
    pub downloaded: bool,
}

#[derive(Debug, Serialize)]
pub struct FileInfo {
    path: String,
    bytes: u64,
}

impl CheckpointStatus {
    #[cfg_attr(not(mlx), allow(dead_code))]
    pub(crate) fn of(root: &Path, c: &Checkpoint) -> Self {
        CheckpointStatus {
            id: c.id.to_string(),
            repo: c.repo.to_string(),
            commit: c.commit.to_string(),
            bytes: c.bytes(),
            files: c.files.iter().map(|f| FileInfo { path: f.path.to_string(), bytes: f.bytes }).collect(),
            downloaded: store::is_downloaded(root, c),
        }
    }
}

/// One chunk of a checkpoint download, as a raw IPC body. Headers name it: `x-checkpoint`,
/// `x-file` (catalog path) and `x-offset`.
pub(crate) fn chunk_request(request: &tauri::ipc::Request<'_>) -> Result<(String, String, u64, Vec<u8>), String> {
    let header = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).map(str::to_string).ok_or_else(|| format!("missing {k} header"));
    let (id, file, offset) = (header("x-checkpoint")?, header("x-file")?, header("x-offset")?);
    let offset: u64 = offset.parse().map_err(|_| "x-offset must be a byte offset".to_string())?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("a chunk must be sent as raw bytes".into());
    };
    if bytes.len() > MAX_CHUNK {
        return Err(format!("a chunk is at most {MAX_CHUNK} bytes"));
    }
    Ok((id, file, offset, bytes.clone()))
}

/// Runs blocking work (hashing, disk, waiting on the MLX thread) off the async runtime.
#[cfg_attr(not(mlx), allow(dead_code))]
pub(crate) async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

/// Model folders: owner-only (0700). Existing folders keep their permissions.
pub(crate) fn create_private_dir(dir: &Path) -> std::io::Result<()> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(dir)
}

/// Opens `path` for writing, creating it owner-only (0600) if it is new.
pub(crate) fn private_file(path: &Path) -> std::io::Result<fs::File> {
    let mut opts = fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut opts, 0o600);
    opts.open(path)
}

/// A private folder under app data. `BLOOMGRID_DATA_DIR` relocates it (tests).
#[cfg_attr(not(mlx), allow(dead_code))]
pub(crate) fn data_dir(app: &AppHandle, parts: &[&str]) -> Result<PathBuf, String> {
    let mut dir = match std::env::var_os("BLOOMGRID_DATA_DIR") {
        Some(dir) => PathBuf::from(dir),
        None => app.path().app_data_dir().map_err(|e| e.to_string())?,
    };
    dir.extend(parts);
    create_private_dir(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
