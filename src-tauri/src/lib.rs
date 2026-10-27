//! BloomGrid desktop shell (Phase 12): hosts the web build in a native window and stores saves as
//! JSON files in the app data directory, behind the same key-value API the web build gets from
//! IndexedDB (see `src/platform/tauri.ts`). On Apple Silicon it also runs the city assistant's
//! local LLM natively on MLX (`llm/`, `mlx.rs`, `models/`; ported from Andai).

mod llm;
mod mlx;
mod models;

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Save keys become file names: keep them to a safe character set.
fn key_path(app: &AppHandle, dir: &str, key: &str) -> Result<PathBuf, String> {
    if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || "-_.~".contains(c)) || key.starts_with('.') {
        return Err(format!("invalid key {key:?}"));
    }
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?.join(dir);
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base.join(format!("{key}.json")))
}

#[tauri::command]
fn save_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let path = key_path(&app, "saves", &key)?;
    match fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_set(app: AppHandle, key: String, json: String) -> Result<(), String> {
    let path = key_path(&app, "saves", &key)?;
    // Write then rename so a crash mid-write never leaves a truncated save.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_delete(app: AppHandle, key: String) -> Result<(), String> {
    let path = key_path(&app, "saves", &key)?;
    match fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

#[tauri::command]
fn save_keys(app: AppHandle) -> Result<Vec<String>, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?.join("saves");
    let Ok(entries) = fs::read_dir(base) else { return Ok(vec![]) };
    Ok(entries
        .filter_map(|e| e.ok())
        .filter_map(|e| e.file_name().to_str()?.strip_suffix(".json").map(str::to_owned))
        .collect())
}

/// Writes an exported file (a save as JSON) into the app's exports folder and returns its path.
#[tauri::command]
fn export_file(app: AppHandle, name: String, data: String) -> Result<String, String> {
    let stem = name.trim_end_matches(".json");
    let path = key_path(&app, "exports", stem)?;
    fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(mlx::Mlx::default())
        .manage(llm::Llm::default())
        .invoke_handler(tauri::generate_handler![
            save_get,
            save_set,
            save_delete,
            save_keys,
            export_file,
            llm::llm_status,
            llm::llm_write_chunk,
            llm::llm_finish,
            llm::llm_remove,
            llm::llm_load,
            llm::llm_unload,
            llm::llm_generate,
            llm::llm_cancel
        ])
        .run(tauri::generate_context!())
        .expect("error while running BloomGrid");
}
