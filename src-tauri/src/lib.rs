mod native_rpc;
mod sidecar;
mod sync_http;
mod windows;

use tauri::Manager;

#[tauri::command]
fn provider_call(
    app: tauri::AppHandle,
    channel: String,
    command: String,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    sidecar::call(&app, channel, command, payload)
}

#[tauri::command]
fn provider_invoke(
    app: tauri::AppHandle,
    channel: String,
    message: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    sidecar::call_invoke(&app, channel, message)
}

#[tauri::command]
fn provider_emit(
    app: tauri::AppHandle,
    channel: String,
    payload: serde_json::Value,
) -> Result<(), String> {
    use tauri::Emitter;
    app.emit(&format!("littlr://{channel}"), payload)
        .map_err(|err| err.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            log::info!("[littlr] second instance argv: {argv:?}");
            if let Some(path) = argv.iter().find(|arg| {
                arg.ends_with(".md") || arg.ends_with(".ztr") || arg.ends_with(".txt")
            }) {
                use tauri::Emitter;
                let _ = app.emit("littlr://open-file", serde_json::json!({ "path": path }));
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(sidecar::SidecarState::new())
        .invoke_handler(tauri::generate_handler![provider_call, provider_invoke, provider_emit])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            native_rpc::start(app.handle().clone())?;
            let sync_state = sync_http::start(app.handle().clone())?;
            sidecar::spawn(app.handle())?;
            windows::init(app.handle())?;

            app.manage(sync_state);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Littlr Tauri application");
}
