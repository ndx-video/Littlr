use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;

use tauri::AppHandle;
use serde_json::json;

use crate::sidecar;

pub struct SyncHttpState {
    port: u16,
}

impl SyncHttpState {
    pub fn port(&self) -> u16 {
        self.port
    }
}

pub fn start(app: AppHandle) -> Result<SyncHttpState, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|err| err.to_string())?;
    listener
        .set_nonblocking(false)
        .map_err(|err| err.to_string())?;
    let port = listener.local_addr().map_err(|err| err.to_string())?.port();
    let app_handle = app.clone();

    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            if let Err(err) = handle_connection(&app_handle, stream) {
                log::warn!("[sync-http] {err}");
            }
        }
    });

    log::info!("[sync-http] listening on 127.0.0.1:{port}");
    Ok(SyncHttpState { port })
}

fn handle_connection(app: &AppHandle, mut stream: TcpStream) -> Result<(), String> {
    let mut buffer = [0u8; 8192];
    let size = stream.read(&mut buffer).map_err(|err| err.to_string())?;
    let request = String::from_utf8_lossy(&buffer[..size]);

    if !request.starts_with("POST /rpc/sync") {
        write_response(&mut stream, 404, json!({ "error": "not found" }))?;
        return Ok(());
    }

    let body = request
        .split("\r\n\r\n")
        .nth(1)
        .ok_or_else(|| "missing request body".to_string())?;

    let payload: serde_json::Value =
        serde_json::from_str(body.trim()).map_err(|err| format!("invalid json: {err}"))?;

    let channel = payload
        .get("channel")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing channel".to_string())?
        .to_string();

    let message = payload.get("message").cloned();

    let result = if channel == "i18n" {
        sidecar::call_sync(app, channel, json!(null))
    } else if let Some(msg) = message {
        sidecar::call_sync(app, channel, msg)
    } else {
        sidecar::call_sync(app, channel, json!({}))
    };

    match result {
        Ok(value) => write_response(&mut stream, 200, json!({ "result": value }))?,
        Err(err) => write_response(&mut stream, 500, json!({ "error": err }))?,
    }

    Ok(())
}

fn write_response(stream: &mut TcpStream, status: u16, body: serde_json::Value) -> Result<(), String> {
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

pub fn inject_init_script(port: u16) -> String {
    format!("window.__LITTLR_SYNC_PORT__ = {port};")
}

pub fn append_sync_port(url: &str, port: u16) -> Result<String, String> {
    let mut parsed = url
        .parse::<tauri::Url>()
        .map_err(|err| err.to_string())?;
    parsed
        .query_pairs_mut()
        .append_pair("__littlr_sync_port", &port.to_string());
    Ok(parsed.to_string())
}
