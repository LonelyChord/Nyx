use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;

pub const DEFAULT_DISCORD_APP_ID: &str = "1575394819176534037";

#[derive(Clone, Debug)]
pub struct DiscordActivityPayload {
    pub enabled: bool,
    pub client_id: String,
    pub playing: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub artwork_url: String,
    pub position_sec: f64,
    pub duration_sec: f64,
}

enum RpcCommand {
    Update(DiscordActivityPayload),
    Shutdown,
}

pub struct DiscordRpcState(Mutex<Sender<RpcCommand>>);

impl DiscordRpcState {
    pub fn spawn() -> Self {
        let (tx, rx) = mpsc::channel::<RpcCommand>();
        std::thread::Builder::new()
            .name("nyx-discord-rpc".to_string())
            .spawn(move || {
                #[cfg(target_os = "windows")]
                win_ipc::worker_loop(rx);
                #[cfg(not(target_os = "windows"))]
                while let Ok(cmd) = rx.recv() {
                    if matches!(cmd, RpcCommand::Shutdown) {
                        break;
                    }
                }
            })
            .ok();
        Self(Mutex::new(tx))
    }

    pub fn update(&self, payload: DiscordActivityPayload) {
        if let Ok(tx) = self.0.lock() {
            let _ = tx.send(RpcCommand::Update(payload));
        }
    }

    pub fn shutdown(&self) {
        if let Ok(tx) = self.0.lock() {
            let _ = tx.send(RpcCommand::Shutdown);
        }
    }
}

#[cfg(target_os = "windows")]
mod win_ipc {
    use super::{DiscordActivityPayload, RpcCommand, DEFAULT_DISCORD_APP_ID};
    use serde_json::{json, Value};
    use std::fs::{File, OpenOptions};
    use std::io::{Read, Write};
    use std::sync::mpsc::Receiver;
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    fn open_discord_pipe() -> Option<File> {
        for idx in 0..=9 {
            let path = format!(r"\\.\pipe\discord-ipc-{}", idx);
            if let Ok(file) = OpenOptions::new().read(true).write(true).open(&path) {
                return Some(file);
            }
        }
        None
    }

    fn send_frame(pipe: &mut File, opcode: u32, payload: &Value) -> std::io::Result<()> {
        let body = serde_json::to_vec(payload)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        let mut frame = Vec::with_capacity(8 + body.len());
        frame.extend_from_slice(&opcode.to_le_bytes());
        frame.extend_from_slice(&(body.len() as u32).to_le_bytes());
        frame.extend_from_slice(&body);
        pipe.write_all(&frame)?;
        pipe.flush()
    }

    fn read_frame(pipe: &mut File) -> std::io::Result<()> {
        let mut header = [0u8; 8];
        pipe.read_exact(&mut header)?;
        let len = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
        if len > 65536 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Discord IPC frame too large",
            ));
        }
        let mut buf = vec![0u8; len];
        if len > 0 {
            pipe.read_exact(&mut buf)?;
        }
        Ok(())
    }

    fn clamp_str(s: &str, max_chars: usize, fallback: &str) -> String {
        let trimmed = s.trim();
        let src = if trimmed.is_empty() { fallback } else { trimmed };
        let mut out: String = src.chars().take(max_chars).collect();
        if out.chars().count() < 2 {
            out.push(' ');
        }
        out
    }

    fn clear_activity(pipe: &mut File, nonce: &str) -> std::io::Result<()> {
        let pid = std::process::id();
        let payload = json!({
            "cmd": "SET_ACTIVITY",
            "args": { "pid": pid },
            "nonce": nonce
        });
        send_frame(pipe, 1, &payload)?;
        read_frame(pipe)
    }

    pub fn worker_loop(rx: Receiver<RpcCommand>) {
        let mut pipe: Option<File> = None;
        let mut connected_id = String::new();
        let mut last_attempt: Option<Instant> = None;
        let mut nonce: u64 = 0;

        while let Ok(first_cmd) = rx.recv() {
            let mut latest_update: Option<DiscordActivityPayload> = None;
            let mut should_shutdown = false;

            match first_cmd {
                RpcCommand::Update(p) => latest_update = Some(p),
                RpcCommand::Shutdown => should_shutdown = true,
            }

            if !should_shutdown {
                while let Ok(next_cmd) = rx.try_recv() {
                    match next_cmd {
                        RpcCommand::Update(p) => latest_update = Some(p),
                        RpcCommand::Shutdown => {
                            should_shutdown = true;
                            break;
                        }
                    }
                }
            }

            if should_shutdown {
                if let Some(mut f) = pipe.take() {
                    let pid = std::process::id();
                    let payload = json!({
                        "cmd": "SET_ACTIVITY",
                        "args": { "pid": pid },
                        "nonce": "shutdown"
                    });
                    let _ = send_frame(&mut f, 1, &payload);
                }
                break;
            }

            let Some(p) = latest_update else {
                continue;
            };

            let cid_trimmed = p.client_id.trim();
            let cid = if cid_trimmed.is_empty() {
                DEFAULT_DISCORD_APP_ID
            } else {
                cid_trimmed
            };

            if !p.enabled {
                if let Some(mut f) = pipe.take() {
                    nonce = nonce.wrapping_add(1);
                    let _ = clear_activity(&mut f, &nonce.to_string());
                }
                connected_id.clear();
                continue;
            }

            if pipe.is_some() && connected_id != cid {
                if let Some(mut f) = pipe.take() {
                    nonce = nonce.wrapping_add(1);
                    let _ = clear_activity(&mut f, &nonce.to_string());
                }
                connected_id.clear();
            }

            if pipe.is_none() {
                if !p.playing || p.title.trim().is_empty() {
                    continue;
                }
                if let Some(prev) = last_attempt {
                    if prev.elapsed() < Duration::from_secs(8) {
                        continue;
                    }
                }
                last_attempt = Some(Instant::now());
                if let Some(mut f) = open_discord_pipe() {
                    let handshake = json!({
                        "v": 1,
                        "client_id": cid
                    });
                    if send_frame(&mut f, 0, &handshake).is_ok() && read_frame(&mut f).is_ok() {
                        pipe = Some(f);
                        connected_id = cid.to_string();
                    }
                }
            }

            if let Some(ref mut f) = pipe {
                nonce = nonce.wrapping_add(1);
                let res = if p.title.trim().is_empty() {
                    clear_activity(f, &nonce.to_string())
                } else {
                    let mut activity = json!({
                        "type": 2,
                        "status_display_type": 2,
                        "details": clamp_str(&p.title, 120, "Nyx"),
                        "state": clamp_str(&p.artist, 120, "Apple Music"),
                    });

                    if p.playing && p.duration_sec > 1.0 {
                        let now = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs();
                        let pos = p.position_sec.max(0.0).round() as u64;
                        let dur = p.duration_sec.round() as u64;
                        let start = now.saturating_sub(pos);
                        let end = start.saturating_add(dur);
                        activity["timestamps"] = json!({
                            "start": start,
                            "end": end
                        });
                    }

                    let mut assets = serde_json::Map::new();
                    let art = p.artwork_url.trim();
                    if art.starts_with("https://") && art.len() <= 256 {
                        assets.insert("large_image".to_string(), json!(art));
                    }
                    let album_text = if p.playing {
                        clamp_str(&p.album, 120, "Nyx")
                    } else {
                        let base = if p.album.trim().is_empty() {
                            "Nyx"
                        } else {
                            p.album.trim()
                        };
                        clamp_str(&format!("Paused · {}", base), 120, "Paused")
                    };
                    assets.insert("large_text".to_string(), json!(album_text));
                    activity["assets"] = Value::Object(assets);

                    let payload = json!({
                        "cmd": "SET_ACTIVITY",
                        "args": {
                            "pid": std::process::id(),
                            "activity": activity
                        },
                        "nonce": nonce.to_string()
                    });
                    send_frame(f, 1, &payload).and_then(|_| read_frame(f))
                };

                if res.is_err() {
                    pipe = None;
                    connected_id.clear();
                }
            }
        }
    }
}
