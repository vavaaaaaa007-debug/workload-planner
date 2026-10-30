#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, path::PathBuf};
use tauri::{WebviewUrl, WebviewWindowBuilder, Manager};
use tauri_plugin_dialog::DialogExt;

const MAX_BYTES: u64 = 5 * 1024 * 1024;

// 前端调用 window.NativeBridge(msg)，在这里转成 Tauri 命令
const BRIDGE_JS: &str = r#"
window.NativeBridge = function (m) {
  var inv = window.__TAURI__.core.invoke;
  var note = function (t) { if (window.nativeNotice) window.nativeNotice(t); };
  if (m.action === 'saveState') {
    inv('save_state', { payload: m.payload })
      .then(function () { if (window.nativeSaveResult) window.nativeSaveResult(true, ''); })
      .catch(function (e) { if (window.nativeSaveResult) window.nativeSaveResult(false, String(e)); });
  } else if (m.action === 'exportBackup') {
    inv('export_backup', { payload: m.payload, filename: m.filename })
      .then(function (ok) { if (ok) note('备份已保存，请妥善保管该JSON文件。'); })
      .catch(function (e) { note('导出失败：' + e); });
  } else if (m.action === 'importBackup') {
    inv('import_backup')
      .then(function (t) { if (t != null && window.receiveNativeImport) window.receiveNativeImport(t); })
      .catch(function (e) { note(String(e)); });
  } else if (m.action === 'copyText') {
    var done = function () { note('计算过程已复制。'); };
    var fallback = function () {
      var a = document.createElement('textarea');
      a.value = m.text; document.body.appendChild(a); a.select();
      try { document.execCommand('copy'); done(); } catch (e) { note('复制失败，请手动选择文字复制。'); }
      a.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(m.text).then(done).catch(fallback);
    } else { fallback(); }
  }
};
"#;

fn data_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // Mac: ~/Library/Application Support/WorkloadPlanner/data.json
    // Windows: %LOCALAPPDATA%\WorkloadPlanner\data.json
    let dir = app
        .path()
        .data_local_dir()
        .map_err(|e| e.to_string())?
        .join("WorkloadPlanner");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("data.json"))
}

#[tauri::command]
fn save_state(app: tauri::AppHandle, payload: String) -> Result<(), String> {
    if payload.len() as u64 > MAX_BYTES {
        return Err("数据超过5MB".into());
    }
    // 无效内容不覆盖上一份有效记录
    serde_json::from_str::<serde_json::Value>(&payload).map_err(|e| format!("数据无效：{e}"))?;
    let path = data_file(&app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &payload).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn export_backup(app: tauri::AppHandle, payload: String, filename: String) -> Result<bool, String> {
    let picked = app
        .dialog()
        .file()
        .set_file_name(&filename)
        .add_filter("JSON", &["json"])
        .blocking_save_file();
    match picked {
        Some(p) => {
            let path = p.into_path().map_err(|e| e.to_string())?;
            fs::write(path, payload).map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

#[tauri::command]
async fn import_backup(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file();
    let Some(p) = picked else { return Ok(None) };
    let path = p.into_path().map_err(|e| e.to_string())?;
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_BYTES {
        return Err("请选择小于5MB的备份文件。".into());
    }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_state, export_backup, import_backup])
        .setup(|app| {
            let handle = app.handle().clone();
            let stored: Option<String> = data_file(&handle)
                .ok()
                .and_then(|p| fs::read_to_string(p).ok());
            let init = format!(
                "window.NativeWorkload = {{ initialState: {} }};\n{}",
                serde_json::to_string(&stored).unwrap_or_else(|_| "null".into()),
                BRIDGE_JS
            );
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("工作量助手")
                .inner_size(1280.0, 860.0)
                .min_inner_size(900.0, 600.0)
                .initialization_script(&init)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动失败");
}
