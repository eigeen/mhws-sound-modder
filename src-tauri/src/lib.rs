mod command;
mod event;
mod logger;
mod service;
mod subprocess;
// mod transcode;

use std::sync::OnceLock;

use tauri::{AppHandle, Manager as _};

use crate::service::TranscodeService;

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

fn panic_hook(info: &std::panic::PanicHookInfo) {
    log::error!("Backend panic: {:?}", info);
    log::error!("Application will be closed in 10 seconds");
    std::thread::sleep(std::time::Duration::from_secs(10));
    std::process::exit(1);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::panic::set_hook(Box::new(panic_hook));
    logger::Logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(TranscodeService::new())
        .setup(|app| {
            let _ = APP_HANDLE.set(app.handle().clone());
            let main_window = app.get_webview_window("main").unwrap();
            main_window
                .set_title(&format!(
                    "MHWs Sound Modder - v{}",
                    env!("CARGO_PKG_VERSION")
                ))
                .unwrap();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            command::bnk_load_file,
            command::bnk_save_file,
            command::pck_load_header,
            command::get_exe_path,
            command::env_get_var,
            command::transcode_set_paths,
            command::transcode_auto_detect_paths,
            command::transcode_check,
            command::transcode_auto_transcode,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
