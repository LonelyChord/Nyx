# Nyx

結合 **Apple Music 設計語言** 與 **60fps 毛玻璃主體** 的 Tauri v2 桌面音樂播放器（以希臘黑夜女神 **Nyx** 命名）。

## 特色功能
- **隱藏官方引擎視窗**：透過隱藏視窗載入 Apple Music 網頁版並介接授權後的 `MusicKit`，完整支援推薦首頁、排行榜、搜尋、播放列表、個人資料庫與隨機播放。
- **沉浸視圖與逐字歌詞**：支援卡拉 OK 逐字掃描時間軸、景深模糊與對齊切換（靠左／置中）。
- **深色／純白雙主題與動態工作列圖示**：一鍵切換深色／白色毛玻璃外觀，同步切換應用程式與工作列圖示，支援自訂強調色與流體動態專輯背景。
- **迷你置頂模式**：支援流線膠囊與標準視窗、透明濃度與桌面高斯模糊背景、等比例縮放。
- **多語系與自訂字體**：內建繁體中文、簡體中文、English、日本語，支援獨立英文與中文字體選擇。
- **Discord Rich Presence**：原生 Windows Named Pipe 實作，支援專輯封面與即時進度條顯示，暫停後維持顯示 5 分鐘。
- **一鍵切換官方無損與自動更新**：支援內建 `tauri-plugin-updater` 自動檢查更新、簽章驗證、背景下載安裝並重啟。

## 安裝與自動更新
1. 前往 [Releases](https://github.com/LonelyChord/Nyx/releases/latest) 下載 Windows 安裝檔（`Nyx_x.x.x_x64-setup.exe`）並安裝。
2. 之後啟動 Nyx 會自動檢查新版本，或到「外觀與設定 → 版本與自動更新」手動檢查並一鍵更新。

## 開發者編譯與發布流程
- 本機編譯 Release 執行檔：
  ```powershell
  cargo build --release --manifest-path src-tauri/Cargo.toml
  ```
- 發布新版：同步更新 `src-tauri/Cargo.toml` 與 `src-tauri/tauri.conf.json` 的版號後，推送版號標籤（例如 `git tag v0.2.1 && git push origin v0.2.1`），GitHub Actions 會自動編譯 Windows 安裝檔、產生簽章與 `latest.json` 並發布至 GitHub Releases。
