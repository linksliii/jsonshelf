use tauri_plugin_dialog::DialogExt;
use std::fs;

#[tauri::command]
pub async fn export_json(app: tauri::AppHandle, content: String, default_name: String) -> Result<Option<String>, String> {
    let file_path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("JSON", &["json"])
        .blocking_save_file();

    match file_path {
        Some(path) => {
            let p = path.into_path().map_err(|e| e.to_string())?;
            fs::write(&p, content).map_err(|e| e.to_string())?;
            Ok(Some(p.to_string_lossy().to_string()))
        }
        None => Ok(None), // 用户取消
    }
}
