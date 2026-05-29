use std::collections::HashMap;
use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::sync_http;

static WINDOW_IDS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

fn window_map() -> std::sync::MutexGuard<'static, Option<HashMap<String, String>>> {
    WINDOW_IDS.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn register_window(label: &str, id: &str) {
    let mut guard = window_map();
    let map = guard.get_or_insert_with(HashMap::new);
    map.insert(id.to_string(), label.to_string());
}

fn is_known_page(page: &str) -> bool {
    window_registry().iter().any(|(_, known, _)| *known == page)
}

pub fn page_url(app: &AppHandle, page: &str) -> String {
    if cfg!(debug_assertions) {
        format!("http://localhost:5173/static/pages/{page}.html")
    } else {
        let _ = app;
        format!("static/pages/{page}.html")
    }
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window("main").is_none() {
        create_main_window(app)?;
    }
    Ok(())
}

fn sync_port(app: &AppHandle) -> Option<u16> {
    app.try_state::<sync_http::SyncHttpState>()
        .map(|state| state.port())
}

fn create_main_window(app: &AppHandle) -> Result<(), String> {
    let url = WebviewUrl::External(
        "about:blank"
            .parse::<tauri::Url>()
            .map_err(|err| err.to_string())?,
    );

    let mut builder = WebviewWindowBuilder::new(app, "main", url)
        .title("Littlr")
        .inner_size(960.0, 640.0)
        .visible(false);

    if let Some(port) = sync_port(app) {
        builder = builder.initialization_script(sync_http::inject_init_script(port));
    }

    builder.build().map_err(|err| err.to_string())?;

    register_window("main", "main");
    Ok(())
}

pub fn create_window(app: &AppHandle, params: Value) -> Result<Value, String> {
    let id = params
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing id".to_string())?;
    let page = params
        .get("page")
        .and_then(|v| v.as_str())
        .unwrap_or("main");
    let title = params
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Littlr");
    let width = params.get("width").and_then(|v| v.as_f64()).unwrap_or(800.0);
    let height = params.get("height").and_then(|v| v.as_f64()).unwrap_or(600.0);

    let label = if id == "main" {
        "main".to_string()
    } else {
        format!("win-{id}")
    };

    if app.get_webview_window(&label).is_some() {
        register_window(&label, id);
        return Ok(json!({ "id": id, "label": label }));
    }

    let page_name = page;
    if !is_known_page(page_name) {
        log::warn!("[windows] unknown page '{page_name}', continuing anyway");
    }

    let mut target_url = page_url(app, page_name);
    if let Some(port) = sync_port(app) {
        target_url = sync_http::append_sync_port(&target_url, port)?;
    }

    let url = if cfg!(debug_assertions) {
        WebviewUrl::External(target_url.parse::<tauri::Url>().map_err(|err| err.to_string())?)
    } else {
        WebviewUrl::App(format!("static/pages/{page_name}.html").into())
    };

    let mut builder = WebviewWindowBuilder::new(app, &label, url)
        .title(title)
        .inner_size(width, height);

    if let Some(port) = sync_port(app) {
        builder = builder.initialization_script(sync_http::inject_init_script(port));
    }

    builder.build().map_err(|err| err.to_string())?;

    register_window(&label, id);
    Ok(json!({ "id": id, "label": label }))
}

fn resolve_label(id: &str) -> String {
    let guard = window_map();
    if let Some(map) = guard.as_ref() {
        if let Some(label) = map.get(id) {
            return label.clone();
        }
    }
    if id == "main" {
        "main".to_string()
    } else {
        format!("win-{id}")
    }
}


pub fn load_url(app: &AppHandle, params: Value) -> Result<Value, String> {
    let id = params.get("id").and_then(|v| v.as_str()).unwrap_or("main");
    let url = params
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing url".to_string())?;
    let label = resolve_label(id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("window not found: {label}"))?;

    let mut target = url.to_string();
    if let Some(port) = sync_port(app) {
        target = sync_http::append_sync_port(&target, port)?;
    }

    window
        .navigate(
            target
                .parse::<tauri::Url>()
                .map_err(|err| err.to_string())?,
        )
        .map_err(|err| err.to_string())?;
    Ok(json!(null))
}

pub fn show_window(app: &AppHandle, params: Value) -> Result<Value, String> {
    let id = params.get("id").and_then(|v| v.as_str()).unwrap_or("main");
    let label = resolve_label(id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("window not found: {label}"))?;
    window.show().map_err(|err| err.to_string())?;
    window.set_focus().map_err(|err| err.to_string())?;
    Ok(json!(null))
}

pub fn close_window(app: &AppHandle, params: Value) -> Result<Value, String> {
    let id = params.get("id").and_then(|v| v.as_str()).unwrap_or("main");
    let label = resolve_label(id);
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|err| err.to_string())?;
    }
    Ok(json!(null))
}

pub fn set_title(app: &AppHandle, params: Value) -> Result<Value, String> {
    let id = params.get("id").and_then(|v| v.as_str()).unwrap_or("main");
    let title = params
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Littlr");
    let label = resolve_label(id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("window not found: {label}"))?;
    window.set_title(title).map_err(|err| err.to_string())?;
    Ok(json!(null))
}

pub fn send_to_window(app: &AppHandle, params: Value) -> Result<Value, String> {
    let id = params.get("id").and_then(|v| v.as_str()).unwrap_or("main");
    let channel = params
        .get("channel")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing channel".to_string())?;
    let payload = params.get("payload").cloned().unwrap_or(json!(null));
    let label = resolve_label(id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("window not found: {label}"))?;
    window
        .emit(&format!("littlr://{channel}"), payload)
        .map_err(|err| err.to_string())?;
    Ok(json!(null))
}

pub fn window_registry() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        ("main", "main", "Littlr"),
        ("print", "print", "Print"),
        ("log_viewer", "log_viewer", "Log Viewer"),
        ("preferences", "preferences", "Preferences"),
        ("tag_manager", "tag_manager", "Tag Manager"),
        ("paste_image", "paste_image", "Paste Image"),
        ("error", "error", "Error"),
        ("about", "about", "About"),
        ("stats", "stats", "Statistics"),
        ("assets", "assets", "Assets"),
        ("update", "update", "Update"),
        ("project_properties", "project_properties", "Project Properties"),
        ("splash_screen", "splash_screen", "Littlr"),
        ("onboarding", "onboarding", "Welcome"),
    ]
}
