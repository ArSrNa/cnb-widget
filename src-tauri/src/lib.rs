mod cli;
mod surface;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(cli::CliState::default())
        .invoke_handler(tauri::generate_handler![
            cli::cli_status,
            cli::cli_install,
            cli::cnb_call,
            surface::surface_resize
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
