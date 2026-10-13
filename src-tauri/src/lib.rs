mod auth;
mod cli;
mod data;
mod settings;
mod surface;

use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(cli::CliState::default())
        .manage(data::DataState::default())
        .setup(|app| {
            let handle = app.handle().clone();

            // 关闭主面板 = 退出整个应用（否则隐藏的悬浮窗口会让进程驻留后台）
            if let Some(main) = handle.get_webview_window("main") {
                let handle = handle.clone();
                main.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { .. } = event {
                        handle.exit(0);
                    }
                });
            }

            // 依据持久化设置恢复灵动岛/悬浮球
            let s = settings::load(&handle);
            if s.notch_enabled {
                surface::show_notch_window(&handle)?;
            }
            if s.float_enabled {
                surface::show_float_window(&handle)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cli::cli_status,
            cli::cli_install,
            cli::cnb_call,
            auth::auth_status,
            auth::auth_save,
            auth::auth_clear,
            data::usage_get,
            data::npc_get,
            surface::surface_resize,
            surface::notch_geometry,
            surface::panel_show,
            surface::float_nudge,
            surface::float_settle,
            settings::settings_get,
            settings::settings_set_notch,
            settings::settings_set_float,
            settings::settings_set_notch_content
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
