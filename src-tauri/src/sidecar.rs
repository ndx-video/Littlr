use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::native_rpc;

fn native_rpc_port() -> Option<u16> {
    let port = native_rpc::port();
    if port == 0 { None } else { Some(port) }
}

struct SidecarProcess {
    _child: Child,
    stdin: ChildStdin,
    stdout: BufReader<std::process::ChildStdout>,
}

pub struct SidecarState {
    process: Mutex<Option<SidecarProcess>>,
}

impl SidecarState {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
        }
    }
}

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri should have a parent directory")
        .to_path_buf()
}

fn sidecar_data_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    let dir = app.path().app_data_dir()?.join("littlr");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn spawn(app: &AppHandle) -> tauri::Result<()> {
    let root = repo_root();
    let data_dir = sidecar_data_dir(app)?;
    let logs_dir = data_dir.join("logs");
    std::fs::create_dir_all(&logs_dir)?;

    let sidecar_main = root.join("port").join("sidecar").join("main.ts");
    let tsconfig = root.join("port").join("sidecar").join("tsconfig.json");

    let mut command = if cfg!(windows) {
        let mut cmd = Command::new("cmd");
        cmd.args([
            "/C",
            "npx",
            "tsx",
            "--tsconfig",
            &tsconfig.to_string_lossy(),
            &sidecar_main.to_string_lossy(),
        ]);
        cmd
    } else {
        let mut cmd = Command::new("npx");
        cmd.args([
            "tsx",
            "--tsconfig",
            &tsconfig.to_string_lossy(),
            &sidecar_main.to_string_lossy(),
        ]);
        cmd
    };

    command
        .current_dir(&root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .env("ZETTLR_USER_DATA", &data_dir)
        .env("ZETTLR_RESOURCES", root.join("static"))
        .env("ZETTLR_LOGS", &logs_dir)
        .env("ZETTLR_CACHE", data_dir.join("cache"))
        .env("LITTLR_TAURI", "1")
        .env(
            "LITTLR_NATIVE_RPC_PORT",
            native_rpc_port().map(|p| p.to_string()).unwrap_or_default(),
        );

    log::info!("[sidecar] spawning Node sidecar from {}", root.display());

    let mut child = command.spawn().map_err(|err| {
        log::error!(
            "[sidecar] failed to spawn (is Node.js/npx on PATH?): {err}"
        );
        err
    })?;

    let stdin = child.stdin.take().expect("sidecar stdin");
    let stdout = child.stdout.take().expect("sidecar stdout");
    let mut reader = BufReader::new(stdout);

    let mut ready_line = String::new();
    loop {
        ready_line.clear();
        reader
            .read_line(&mut ready_line)
            .map_err(std::io::Error::other)?;
        let trimmed = ready_line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.contains("\"result\":\"ready\"")
            || trimmed.contains("\"result\": \"ready\"")
        {
            log::info!("[sidecar] ready: {trimmed}");
            break;
        }
        log::debug!("[sidecar] ignoring stdout during boot: {trimmed}");
    }

    app.state::<SidecarState>()
        .process
        .lock()
        .map_err(|_| tauri::Error::from(std::io::Error::other("sidecar lock poisoned")))?
        .replace(SidecarProcess {
            _child: child,
            stdin,
            stdout: reader,
        });

    Ok(())
}

pub fn call_sync(
    app: &AppHandle,
    channel: String,
    message: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "provider-sync",
        "params": {
            "channel": channel,
            "message": message
        }
    });

    send_request(app, &request)
}

pub fn call_invoke(
    app: &AppHandle,
    channel: String,
    message: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    if channel == "i18n" {
        return call_sync(app, channel, serde_json::Value::Null);
    }

    let message = message.unwrap_or(serde_json::json!({}));

    if message.get("command").is_some() {
        let command = message
            .get("command")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let payload = message
            .get("payload")
            .cloned()
            .unwrap_or(serde_json::json!({}));
        return call(app, channel, command, payload);
    }

    call_sync(app, channel, message)
}

fn send_request(app: &AppHandle, request: &serde_json::Value) -> Result<serde_json::Value, String> {
    let state = app.state::<SidecarState>();
    let mut guard = state
        .process
        .lock()
        .map_err(|_| "sidecar lock poisoned".to_string())?;

    let process = guard
        .as_mut()
        .ok_or_else(|| "sidecar process is not running".to_string())?;

    writeln!(process.stdin, "{request}")
        .and_then(|_| process.stdin.flush())
        .map_err(|err| format!("failed to write to sidecar: {err}"))?;

    let mut line = String::new();
    process
        .stdout
        .read_line(&mut line)
        .map_err(|err| format!("failed to read sidecar response: {err}"))?;

    let response: serde_json::Value =
        serde_json::from_str(line.trim()).map_err(|err| format!("invalid sidecar JSON: {err}"))?;

    if let Some(error) = response.get("error") {
        return Err(error.to_string());
    }

    Ok(unwrap_sidecar_result(
        response.get("result").cloned().unwrap_or(response),
    ))
}

fn unwrap_sidecar_result(value: serde_json::Value) -> serde_json::Value {
    if let Some(inner) = value.get("result") {
        if value.as_object().map(|o| o.len() == 1).unwrap_or(false) {
            return inner.clone();
        }
    }
    value
}

pub fn call(
    app: &AppHandle,
    channel: String,
    command: String,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "provider-call",
        "params": {
            "channel": channel,
            "command": command,
            "payload": payload
        }
    });

    send_request(app, &request)
}
