//! Zettlr Tauri shell — Rust side of the Electron→Tauri migration
//!
//! Phase A: This crate handles process lifecycle, window management,
//!          menus, tray, native dialogs, and IPC routing to the Node sidecar.
//! Phase B: Providers migrate here one by one until the sidecar is removed.
//!
//! Created by `cargo tauri init` (run during Phase 0.1).
//!
//! @license GNU GPL v3

// ---------------------------------------------------------------------------
// Phase 0.1: After running `cargo tauri init`, this becomes:
// ---------------------------------------------------------------------------
//
// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//
// mod sidecar;
// mod ipc_bridge;
// mod windows;
// mod menu;
//
// fn main() {
//     tauri::Builder::default()
//         .setup(|app| {
//             sidecar::spawn(app.handle())?;
//             Ok(())
//         })
//         .run(tauri::generate_context!())
//         .expect("error while running tauri application");
// }

fn main() {
    println!("Zettlr Tauri shell — not yet initialized.");
    println!("Run 'cargo tauri init' during Phase 0.1 to scaffold.");
}