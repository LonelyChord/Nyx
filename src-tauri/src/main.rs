#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod discord_rpc;

use discord_rpc::{DiscordActivityPayload, DiscordRpcState};
use serde::Serialize;
use serde_json::Value;
use std::process::Command;
use std::sync::Mutex;
use tauri::{
    window::Color, AppHandle, Emitter, LogicalSize, Manager, PhysicalSize, State, Theme, WebviewUrl,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_updater::UpdaterExt;

const ENGINE_BRIDGE_JS: &str = include_str!("../../ui/engine-bridge.js");
const ICON_DARK_RGBA: &[u8] = include_bytes!("../icons/icon-dark.rgba");
const ICON_LIGHT_RGBA: &[u8] = include_bytes!("../icons/icon-light.rgba");
#[cfg(target_os = "windows")]
const ICON_DARK_PNG: &[u8] = include_bytes!("../icons/icon-dark.png");
#[cfg(target_os = "windows")]
const ICON_LIGHT_PNG: &[u8] = include_bytes!("../icons/icon-light.png");

#[cfg(target_os = "windows")]
mod win_icon {
    use super::{ICON_DARK_PNG, ICON_LIGHT_PNG};
    use std::ffi::c_void;
    use std::sync::Mutex;

    static ACTIVE_ICONS: Mutex<(usize, usize)> = Mutex::new((0, 0));

    #[link(name = "user32")]
    extern "system" {
        fn CreateIconFromResourceEx(
            presbits: *const u8,
            dw_res_size: u32,
            f_icon: i32,
            dw_ver: u32,
            cx_desired: i32,
            cy_desired: i32,
            flags: u32,
        ) -> *mut c_void;
        fn SendMessageW(hwnd: *mut c_void, msg: u32, wparam: usize, lparam: isize) -> isize;
        fn SetClassLongPtrW(hwnd: *mut c_void, n_index: i32, dw_new_long: isize) -> usize;
        fn DestroyIcon(hicon: *mut c_void) -> i32;
    }

    pub fn apply_theme_icon(hwnd: *mut c_void, is_light: bool) {
        let png = if is_light { ICON_LIGHT_PNG } else { ICON_DARK_PNG };
        unsafe {
            let h_big = CreateIconFromResourceEx(
                png.as_ptr(),
                png.len() as u32,
                1,
                0x00030000,
                64,
                64,
                0,
            );
            let h_small = CreateIconFromResourceEx(
                png.as_ptr(),
                png.len() as u32,
                1,
                0x00030000,
                32,
                32,
                0,
            );
            if !h_big.is_null() {
                SendMessageW(hwnd, 0x0080, 1, h_big as isize); // WM_SETICON, ICON_BIG
                SetClassLongPtrW(hwnd, -14, h_big as isize); // GCLP_HICON
            }
            if !h_small.is_null() {
                SendMessageW(hwnd, 0x0080, 0, h_small as isize); // WM_SETICON, ICON_SMALL
                SetClassLongPtrW(hwnd, -34, h_small as isize); // GCLP_HICONSM
            }
            if let Ok(mut prev) = ACTIVE_ICONS.lock() {
                let (old_big, old_small) = *prev;
                *prev = (h_big as usize, h_small as usize);
                if old_big != 0 {
                    DestroyIcon(old_big as *mut c_void);
                }
                if old_small != 0 {
                    DestroyIcon(old_small as *mut c_void);
                }
            }
        }
    }
}

struct WindowBoundsState(Mutex<Option<PhysicalSize<u32>>>);

#[derive(Default, Clone, Copy)]
struct MiniState {
    enabled: bool,
    capsule_shape: bool,
    base_w: f64,
    base_h: f64,
    last_w: f64,
    last_h: f64,
    adjusting: bool,
}

struct MiniModeState(Mutex<MiniState>);

fn opaque_bg_color(is_light: bool) -> Color {
    if is_light {
        Color(242, 244, 250, 255)
    } else {
        Color(13, 14, 19, 255)
    }
}

#[tauri::command]
fn set_app_theme(app: AppHandle, theme: String) -> Result<(), String> {
    let is_light = theme == "light";
    let native_theme = if is_light { Theme::Light } else { Theme::Dark };
    let icon_rgba = if is_light { ICON_LIGHT_RGBA } else { ICON_DARK_RGBA };

    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_theme(Some(native_theme));
        let _ = win.set_background_color(Some(opaque_bg_color(is_light)));
        let _ = win.set_icon(tauri::image::Image::new(icon_rgba, 256, 256));
        #[cfg(target_os = "windows")]
        {
            let win_clone = win.clone();
            let _ = win.run_on_main_thread(move || {
                if let Ok(hwnd) = win_clone.hwnd() {
                    win_icon::apply_theme_icon(hwnd.0, is_light);
                }
            });
        }
    }
    if let Some(engine) = app.get_webview_window("engine") {
        let _ = engine.set_theme(Some(native_theme));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
mod win_acrylic {
    use std::ffi::c_void;

    #[link(name = "kernel32")]
    extern "system" {
        fn LoadLibraryA(lp_lib_file_name: *const u8) -> *mut c_void;
        fn GetProcAddress(h_module: *mut c_void, lp_proc_name: *const u8) -> *mut c_void;
    }

    #[repr(C)]
    struct AccentPolicy {
        accent_state: u32,
        accent_flags: u32,
        gradient_color: u32,
        animation_id: u32,
    }

    #[repr(C)]
    struct WindowCompositionAttribData {
        attrib: u32,
        pv_data: *mut c_void,
        cb_data: usize,
    }

    pub fn set_acrylic(hwnd: *mut c_void, active: bool, r: u8, g: u8, b: u8, a: u8) {
        type SetWcaFn =
            unsafe extern "system" fn(*mut c_void, *mut WindowCompositionAttribData) -> i32;
        unsafe {
            let user32 = LoadLibraryA(b"user32.dll\0".as_ptr());
            if user32.is_null() {
                return;
            }
            let proc = GetProcAddress(user32, b"SetWindowCompositionAttribute\0".as_ptr());
            if proc.is_null() {
                return;
            }
            let set_wca: SetWcaFn = std::mem::transmute(proc);
            let mut policy = if active {
                let alpha = if a == 0 { 1 } else { a };
                AccentPolicy {
                    accent_state: 4, // ACCENT_ENABLE_ACRYLICBLURBEHIND
                    accent_flags: 0,
                    gradient_color: (r as u32)
                        | ((g as u32) << 8)
                        | ((b as u32) << 16)
                        | ((alpha as u32) << 24),
                    animation_id: 0,
                }
            } else {
                AccentPolicy {
                    accent_state: 0, // ACCENT_DISABLED
                    accent_flags: 0,
                    gradient_color: 0,
                    animation_id: 0,
                }
            };
            let mut data = WindowCompositionAttribData {
                attrib: 0x13, // WCA_ACCENT_POLICY
                pv_data: &mut policy as *mut _ as *mut c_void,
                cb_data: std::mem::size_of::<AccentPolicy>(),
            };
            set_wca(hwnd, &mut data);
        }
    }
}

fn apply_mini_backdrop(
    win: &tauri::WebviewWindow,
    translucent_window: bool,
    gaussian_blur: bool,
    capsule_shape: bool,
    is_light: bool,
) {
    let need_transparent_surface = translucent_window || capsule_shape;
    let bg = if need_transparent_surface {
        Color(0, 0, 0, 0)
    } else {
        opaque_bg_color(is_light)
    };
    let _ = win.set_background_color(Some(bg));
    let _ = win.set_shadow(!capsule_shape);
    #[cfg(target_os = "windows")]
    {
        let win_clone = win.clone();
        let enable_acrylic = translucent_window && gaussian_blur && !capsule_shape;
        let _ = win.run_on_main_thread(move || {
            let _ = win_clone.set_background_color(Some(bg));
            if let Ok(hwnd) = win_clone.hwnd() {
                let (r, g, b, a) = if is_light {
                    (250, 252, 255, 18)
                } else {
                    (16, 18, 24, 24)
                };
                win_acrylic::set_acrylic(hwnd.0, enable_acrylic, r, g, b, a);
            }
        });
    }
    #[cfg(not(target_os = "windows"))]
    let _ = (translucent_window, gaussian_blur, capsule_shape, is_light);
}

#[tauri::command]
fn set_mini_backdrop(
    app: AppHandle,
    mini_state: State<MiniModeState>,
    translucent_window: bool,
    gaussian_blur: bool,
    capsule_shape: bool,
    is_light: bool,
) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主視窗".to_string())?;
    {
        let mut st = mini_state.0.lock().unwrap();
        if st.enabled {
            let base_w = if capsule_shape { 388.0 } else { 368.0 };
            let base_h = 152.0;
            let shape_changed = st.capsule_shape != capsule_shape;
            st.capsule_shape = capsule_shape;
            st.base_w = base_w;
            st.base_h = base_h;
            if shape_changed {
                let scale = (st.last_h / base_h).clamp(0.8, 1.5);
                let tw = (base_w * scale).round();
                let th = (base_h * scale).round();
                st.last_w = tw;
                st.last_h = th;
                st.adjusting = true;
                let _ = win.set_min_size(Some(LogicalSize::new((base_w * 0.8).round(), (base_h * 0.8).round())));
                let _ = win.set_max_size(Some(LogicalSize::new((base_w * 1.5).round(), (base_h * 1.5).round())));
                let _ = win.set_size(LogicalSize::new(tw, th));
                st.adjusting = false;
            }
        }
    }
    apply_mini_backdrop(&win, translucent_window, gaussian_blur, capsule_shape, is_light);
    Ok(())
}

#[tauri::command]
fn set_mini_mode(
    app: AppHandle,
    bounds_state: State<WindowBoundsState>,
    mini_state: State<MiniModeState>,
    enabled: bool,
    always_on_top: bool,
    translucent_window: bool,
    gaussian_blur: bool,
    capsule_shape: bool,
    is_light: bool,
) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主視窗".to_string())?;

    if enabled {
        if win.is_maximized().unwrap_or(false) {
            let _ = win.unmaximize();
        }
        if let Ok(size) = win.inner_size() {
            if size.width > 500 && size.height > 300 {
                *bounds_state.0.lock().unwrap() = Some(size);
            }
        }
        let base_w = if capsule_shape { 388.0 } else { 368.0 };
        let base_h = 152.0;
        {
            let mut st = mini_state.0.lock().unwrap();
            st.enabled = true;
            st.capsule_shape = capsule_shape;
            st.base_w = base_w;
            st.base_h = base_h;
            st.last_w = base_w;
            st.last_h = base_h;
            st.adjusting = true;
        }
        let _ = win.set_min_size(Some(LogicalSize::new((base_w * 0.8).round(), (base_h * 0.8).round())));
        let _ = win.set_max_size(Some(LogicalSize::new((base_w * 1.5).round(), (base_h * 1.5).round())));
        let _ = win.set_size(LogicalSize::new(base_w, base_h));
        let _ = win.set_always_on_top(always_on_top);
        {
            let mut st = mini_state.0.lock().unwrap();
            st.adjusting = false;
        }
        apply_mini_backdrop(&win, translucent_window, gaussian_blur, capsule_shape, is_light);
    } else {
        {
            let mut st = mini_state.0.lock().unwrap();
            st.enabled = false;
            st.capsule_shape = false;
            st.adjusting = false;
        }
        apply_mini_backdrop(&win, false, false, false, is_light);
        let _ = win.set_always_on_top(false);
        let _ = win.set_max_size(None::<LogicalSize<f64>>);
        let _ = win.set_min_size(Some(LogicalSize::new(940.0, 640.0)));
        if let Some(prev) = bounds_state.0.lock().unwrap().take() {
            let _ = win.set_size(prev);
        } else {
            let _ = win.set_size(LogicalSize::new(1280.0, 820.0));
        }
    }
    Ok(())
}

#[tauri::command]
fn set_always_on_top(app: AppHandle, always_on_top: bool) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主視窗".to_string())?;
    win.set_always_on_top(always_on_top).map_err(|e| e.to_string())
}

#[tauri::command]
fn engine_rpc(app: AppHandle, id: String, method: String, params: Value) -> Result<(), String> {
    let engine = app
        .get_webview_window("engine")
        .ok_or_else(|| "引擎視窗尚未就緒".to_string())?;

    let payload = serde_json::json!({
        "id": id,
        "method": method,
        "params": params,
    });
    let serialized = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    let script = format!(
        "window.__AM_ENGINE_BRIDGE__ && window.__AM_ENGINE_BRIDGE__.handleRpc({});",
        serialized
    );
    engine.eval(&script).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_engine_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let engine = app
        .get_webview_window("engine")
        .ok_or_else(|| "找不到引擎視窗".to_string())?;
    if visible {
        engine.show().map_err(|e| e.to_string())?;
        engine.set_focus().map_err(|e| e.to_string())?;
    } else {
        engine.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_official_lossless(app: AppHandle) -> Result<(), String> {
    if let Some(engine) = app.get_webview_window("engine") {
        let _ = engine.eval("window.__AM_ENGINE_BRIDGE__ && window.__AM_ENGINE_BRIDGE__.pause();");
    }
    Command::new("explorer.exe")
        .arg("shell:AppsFolder\\AppleInc.AppleMusicWin_nzyj5cx40ttqa!App")
        .spawn()
        .map_err(|e| format!("無法開啟官方 Apple Music: {}", e))?;
    Ok(())
}

#[tauri::command]
fn update_discord_rpc(
    rpc_state: State<DiscordRpcState>,
    enabled: bool,
    client_id: String,
    playing: bool,
    title: String,
    artist: String,
    album: String,
    artwork_url: String,
    position_sec: f64,
    duration_sec: f64,
) -> Result<(), String> {
    rpc_state.update(DiscordActivityPayload {
        enabled,
        client_id,
        playing,
        title,
        artist,
        album,
        artwork_url,
        position_sec,
        duration_sec,
    });
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    version: String,
    current_version: String,
    body: String,
    date: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgressPayload {
    stage: String,
    downloaded: u64,
    total: Option<u64>,
}

#[tauri::command]
fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    Ok(update.map(|u| UpdateInfo {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        body: u.body.clone().unwrap_or_default(),
        date: u.date.map(|d| d.to_string()).unwrap_or_default(),
    }))
}

#[tauri::command]
#[allow(unreachable_code)]
async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No update available".to_string())?;

    let mut downloaded: u64 = 0;
    let mut last_emitted: u64 = 0;
    let app_dl = app.clone();
    let app_done = app.clone();

    update
        .download_and_install(
            move |chunk_length, content_length| {
                downloaded = downloaded.saturating_add(chunk_length as u64);
                let enough_delta = downloaded.saturating_sub(last_emitted) >= 65536;
                let reached_end = content_length.map_or(false, |t| downloaded >= t);
                if last_emitted == 0 || enough_delta || reached_end {
                    last_emitted = downloaded;
                    let _ = app_dl.emit(
                        "nyx-update-progress",
                        UpdateProgressPayload {
                            stage: "downloading".to_string(),
                            downloaded,
                            total: content_length,
                        },
                    );
                }
            },
            move || {
                let _ = app_done.emit(
                    "nyx-update-progress",
                    UpdateProgressPayload {
                        stage: "installing".to_string(),
                        downloaded: 0,
                        total: None,
                    },
                );
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    app.state::<DiscordRpcState>().shutdown();
    app.restart();
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(WindowBoundsState(Mutex::new(None)))
        .manage(MiniModeState(Mutex::new(MiniState::default())))
        .manage(DiscordRpcState::spawn())
        .invoke_handler(tauri::generate_handler![
            engine_rpc,
            set_engine_visible,
            open_official_lossless,
            set_mini_mode,
            set_mini_backdrop,
            set_always_on_top,
            set_app_theme,
            update_discord_rpc,
            get_app_version,
            check_for_update,
            install_update,
        ])
        .setup(|app| {
            // 1. Main custom UI window (loads fast local HTML/CSS/JS)
            // Note: all WebView2 windows in the same user-data-dir must share identical browser args.
            let browser_args = "--enable-gpu-rasterization --ignore-gpu-blocklist";

            let main_win = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Nyx")
                .inner_size(1280.0, 820.0)
                .min_inner_size(940.0, 640.0)
                .decorations(false)
                .transparent(true)
                .theme(Some(Theme::Dark))
                .additional_browser_args(browser_args)
                .center()
                .build()?;

            let _ = main_win.set_background_color(Some(opaque_bg_color(false)));
            let _ = main_win.set_icon(tauri::image::Image::new(ICON_DARK_RGBA, 256, 256));
            #[cfg(target_os = "windows")]
            if let Ok(hwnd) = main_win.hwnd() {
                win_icon::apply_theme_icon(hwnd.0, false);
            }

            let app_handle = app.handle().clone();
            let main_win_evt = main_win.clone();
            main_win.on_window_event(move |event| match event {
                WindowEvent::CloseRequested { .. } => {
                    app_handle.state::<DiscordRpcState>().shutdown();
                    app_handle.exit(0);
                }
                WindowEvent::Resized(phys_size) => {
                    let mini_state = app_handle.state::<MiniModeState>();
                    let mut st = mini_state.0.lock().unwrap();
                    if !st.enabled || st.adjusting || st.base_w <= 0.0 || st.base_h <= 0.0 {
                        return;
                    }
                    let dpi = main_win_evt.scale_factor().unwrap_or(1.0).max(0.5);
                    let lw = phys_size.width as f64 / dpi;
                    let lh = phys_size.height as f64 / dpi;
                    let dw = (lw - st.last_w).abs();
                    let dh = (lh - st.last_h).abs();
                    let raw_scale = if dw >= dh {
                        lw / st.base_w
                    } else {
                        lh / st.base_h
                    };
                    let scale = raw_scale.clamp(0.8, 1.5);
                    let tw = (st.base_w * scale).round();
                    let th = (st.base_h * scale).round();
                    let need_resize = (lw - tw).abs() > 1.5 || (lh - th).abs() > 1.5;
                    if need_resize {
                        st.adjusting = true;
                        st.last_w = tw;
                        st.last_h = th;
                        drop(st);
                        let _ = main_win_evt.set_size(LogicalSize::new(tw, th));
                        let mut st2 = mini_state.0.lock().unwrap();
                        st2.adjusting = false;
                    } else {
                        st.last_w = lw;
                        st.last_h = lh;
                    }
                }
                _ => {}
            });

            // 2. Hidden Apple Music Web MusicKit engine window
            let engine_url: tauri::Url = "https://music.apple.com"
                .parse()
                .expect("valid Apple Music URL");

            let engine_win =
                WebviewWindowBuilder::new(app, "engine", WebviewUrl::External(engine_url))
                    .title("Nyx · Apple Music 帳號登入")
                    .inner_size(1024.0, 720.0)
                    .visible(false)
                    .skip_taskbar(true)
                    .theme(Some(Theme::Dark))
                    .additional_browser_args(browser_args)
                    .center()
                    .initialization_script(ENGINE_BRIDGE_JS)
                    .build()?;

            // Hide instead of closing if user closes login window manually
            let engine_ref = engine_win.clone();
            engine_win.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = engine_ref.hide();
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
