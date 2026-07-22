use std::{
    env,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
};

use tauri::{Manager, State};

#[derive(Clone)]
struct SidecarHandle {
    child: std::process::Child,
}

// Global handle – will be inserted into Tauri’s State.
struct GlobalHandle {
    sidecar: Mutex<Option<SidecarHandle>>,
}

// Tauri command – spawns the Node sidecar and stores its handle.
#[tauri::command]
fn start_sidecar(state: State<Arc<Mutex<GlobalHandle>>>) -> Result<(), String> {
    // Ensure the required env vars exist
    env::set_var("ZETTLR_USER_DATA", "/tmp/littlr/user_data");
    env::set_var("ZETTLR_RESOURCES", "/tmp/littlr/resources");
    env::set_var("ZETTLR_LOGS", "/tmp/littlr/logs");

    // Spawn `node port/sidecar/main.ts`
    let mut child = Command::new("node")
        .arg("port/sidecar/main.ts")
        .stdout(Stdio::piped())
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    // Insert the handle into the global container
    state
        .lock()
        .sidecar
        .replace(SidecarHandle { child });

    // Tell the frontend that the sidecar is ready
    tauri::Builder::default()
        .invoke("sidecar-ready")
        .expect("failed to emit sidecar-ready");

    Ok(())
}

/**
 * Helper that is called from `setup` – reads line‑by‑line from the
 * sidecar’s stdout and forwards each complete JSON‑RPC message as the
 * `sidecar-response` event.
 */
fn forward_sidecar_output(
    stdout: std::process::Stdio,
    app: tauri::'enum_wry_window::Window',
) {
    std::thread::spawn(move || {
        let mut reader = std::io::BufReader::new(stdout);
        let mut line = String::new();
        loop {
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => break, // EOF
                Ok(_) => {
                    let trimmed = line.trim_end();
                    // Emit the raw line as a Tauri event
                    tauri::Builder::default()
                        .invoke("sidecar-response", trimmed)
                        .expect("failed to invoke sidecar-response");
                    line.clear();
                }
            }
        }
    });
}

fn main() {
    // Initialise Tauri and make the global handle available as State.
    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(GlobalHandle {
            sidecar: Mutex::new(None),
        })))
        .invoke_handler(tauri::generate_handler![start_sidecar])
        // `setup` runs after the command registry is built.
        .setup(|app| {
            // Retrieve the global handle so we can read its child.
            let handle_opt = app.state::<Arc<Mutex<GlobalHandle>>>().lock().sidecar.clone();

            if let Some(handle) = handle {
                // Take ownership of stdout so we can spawn a thread that reads from it.
                let stdout = handle.child.stdout
                    .take()
                    .expect("Failed to take stdout from child");
                // Forward data to the frontend using the `sidecar-response` event.
                forward_sidecar_output(stdout, app窗口()); // placeholder – actual Window reference not needed here
            }

            // Return Ok to continue Tauri startup.
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/* -------------------------------------------------------------
   Minimal stub for the event that forwards data.
   ------------------------------------------------------------- */
fn forward_sidecar_output(
    stdout: std::process::Stdio,
    _window: tauri::Window,
) {
    std::thread::spawn(move || {
        let mut reader = std::io::BufReader::new(stdout);
        let mut line = String::new();
        loop {
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let trimmed = line.trim_end();
                    // Use the Tauri API to emit an event named `sidecar-response`
                    tauri::Builder::default()
                        .invoke("sidecar-response", trimmed)
                        .expect("failed to emit sidecar-response");
                    line.clear();
                }
            }
        }
    });
}