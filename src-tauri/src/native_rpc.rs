use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU16, Ordering};
use std::thread;

use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

static NATIVE_RPC_PORT: AtomicU16 = AtomicU16::new(0);

pub fn port() -> u16 {
    NATIVE_RPC_PORT.load(Ordering::Relaxed)
}

pub fn start(app: AppHandle) -> Result<(), String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|err| err.to_string())?;
    let port = listener.local_addr().map_err(|err| err.to_string())?.port();
    NATIVE_RPC_PORT.store(port, Ordering::Relaxed);

    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            if let Err(err) = handle_connection(&app, stream) {
                log::warn!("[native-rpc] {err}");
            }
        }
    });

    log::info!("[native-rpc] listening on 127.0.0.1:{port}");
    Ok(())
}

fn handle_connection(app: &AppHandle, mut stream: TcpStream) -> Result<(), String> {
    let mut buffer = [0u8; 65536];
    let size = stream.read(&mut buffer).map_err(|err| err.to_string())?;
    let request = String::from_utf8_lossy(&buffer[..size]);

    if !request.starts_with("POST /rpc/native") {
        write_response(&mut stream, 404, json!({ "error": "not found" }))?;
        return Ok(());
    }

    let body = request
        .split("\r\n\r\n")
        .nth(1)
        .ok_or_else(|| "missing request body".to_string())?;

    let payload: Value =
        serde_json::from_str(body.trim()).map_err(|err| format!("invalid json: {err}"))?;

    let method = payload
        .get("method")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing method".to_string())?;

    let params = payload.get("params").cloned().unwrap_or(json!({}));

    let result = dispatch(app, method, params);
    match result {
        Ok(value) => write_response(&mut stream, 200, json!({ "result": value }))?,
        Err(err) => write_response(&mut stream, 500, json!({ "error": err }))?,
    }

    Ok(())
}

fn dispatch(app: &AppHandle, method: &str, params: Value) -> Result<Value, String> {
    match method {
        "dialog.showOpenDialog" => dialog_open(app, params),
        "dialog.showSaveDialog" => dialog_save(app, params),
        "dialog.showMessageBox" => dialog_message(app, params),
        "shell.openPath" => shell_open_path(app, params),
        "shell.openExternal" => shell_open_external(app, params),
        "shell.showItemInFolder" => shell_show_item(app, params),
        "clipboard.readText" => clipboard_read(app),
        "clipboard.writeText" => clipboard_write(app, params),
        "window.create" => crate::windows::create_window(app, params),
        "window.loadUrl" => crate::windows::load_url(app, params),
        "window.show" => crate::windows::show_window(app, params),
        "window.close" => crate::windows::close_window(app, params),
        "window.setTitle" => crate::windows::set_title(app, params),
        "window.send" => crate::windows::send_to_window(app, params),
        _ => Err(format!("unknown native RPC method: {method}")),
    }
}

fn dialog_open(app: &AppHandle, params: Value) -> Result<Value, String> {
    let title = params.get("title").and_then(|v| v.as_str());
    let mut builder = app.dialog().file();
    if let Some(title) = title {
        builder = builder.set_title(title);
    }
    if params
        .get("properties")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().any(|v| v.as_str() == Some("openDirectory")))
        .unwrap_or(false)
    {
        let folder = app.dialog().file().blocking_pick_folder();
        return Ok(json!({
            "canceled": folder.is_none(),
            "filePaths": folder.map(|p| vec![p.to_string()]).unwrap_or_default()
        }));
    }
    let paths = builder.blocking_pick_files();
    Ok(json!({
        "canceled": paths.is_none(),
        "filePaths": paths.unwrap_or_default().into_iter().map(|p| p.to_string()).collect::<Vec<_>>()
    }))
}

fn dialog_save(app: &AppHandle, params: Value) -> Result<Value, String> {
    let title = params.get("title").and_then(|v| v.as_str());
    let default_path = params.get("defaultPath").and_then(|v| v.as_str());
    let mut builder = app.dialog().file();
    if let Some(title) = title {
        builder = builder.set_title(title);
    }
    if let Some(path) = default_path {
        builder = builder.set_file_name(path);
    }
    let path = builder.blocking_save_file();
    Ok(json!({
        "canceled": path.is_none(),
        "filePath": path.map(|p| p.to_string())
    }))
}

fn dialog_message(app: &AppHandle, params: Value) -> Result<Value, String> {
    use tauri_plugin_dialog::{MessageDialogButtons, MessageDialogKind};

    let message = params
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let title = params.get("title").and_then(|v| v.as_str()).unwrap_or("Littlr");
    let kind = match params.get("type").and_then(|v| v.as_str()) {
        Some("error") => MessageDialogKind::Error,
        Some("warning") => MessageDialogKind::Warning,
        Some("info") => MessageDialogKind::Info,
        _ => MessageDialogKind::Info,
    };
    let buttons = match params.get("buttons").and_then(|v| v.as_array()) {
        Some(arr) if arr.len() >= 2 => MessageDialogButtons::OkCancel,
        _ => MessageDialogButtons::Ok,
    };
    let response = app
        .dialog()
        .message(message)
        .title(title)
        .kind(kind)
        .buttons(buttons)
        .blocking_show();
    let index = if response { 0 } else { 1 };
    Ok(json!({ "response": index }))
}

fn shell_open_path(app: &AppHandle, path: Value) -> Result<Value, String> {
    let target = path
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing path".to_string())?;
    app.opener()
        .open_path(target, None::<&str>)
        .map_err(|err| err.to_string())?;
    Ok(json!(""))
}

fn shell_open_external(app: &AppHandle, params: Value) -> Result<Value, String> {
    let url = params
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing url".to_string())?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|err| err.to_string())?;
    Ok(json!(null))
}

fn shell_show_item(app: &AppHandle, params: Value) -> Result<Value, String> {
    let path = params
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing path".to_string())?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|err| err.to_string())?;
    Ok(json!(null))
}

fn clipboard_read(app: &AppHandle) -> Result<Value, String> {
    let text = app
        .clipboard()
        .read_text()
        .map_err(|err| err.to_string())?;
    Ok(json!(text))
}

fn clipboard_write(app: &AppHandle, params: Value) -> Result<Value, String> {
    let text = params
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    app.clipboard()
        .write_text(text.to_string())
        .map_err(|err| err.to_string())?;
    Ok(json!(null))
}

fn write_response(stream: &mut TcpStream, status: u16, body: Value) -> Result<(), String> {
    let status_text = match status {
        200 => "OK",
        404 => "Not Found",
        _ => "Internal Server Error",
    };
    let json = body.to_string();
    let response = format!(
        "HTTP/1.1 {status} {status_text}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{json}",
        json.len()
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|err| err.to_string())?;
    Ok(())
}
