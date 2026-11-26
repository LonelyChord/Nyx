<div align="center">

# Nyx

**為 Windows 打造的 Apple Music 桌面播放器**

結合 Apple Music 設計美學與 Tauri v2 原生效能，帶來流暢的動態歌詞、迷你懸浮膠囊與無損音質體驗。

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/LonelyChord/Nyx?style=flat-square&color=blue)](https://github.com/LonelyChord/Nyx/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6?style=flat-square&logo=windows)](https://github.com/LonelyChord/Nyx/releases/latest)
[![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?style=flat-square&logo=tauri&logoColor=black)](https://v2.tauri.app/)

[下載最新版本](https://github.com/LonelyChord/Nyx/releases/latest) · [回報問題](https://github.com/LonelyChord/Nyx/issues)

<!-- 建議在此放一張展示主介面＋動態歌詞或迷你模式的高畫質截圖 -->
<!-- ![Nyx Preview](./docs/preview.png) -->

</div>

---

## ✨ 

* **沉浸式毛玻璃與雙主題**：提供深色與純白毛玻璃外觀，搭配隨專輯封面流動的動態背景
* **逐字歌詞**：支援逐字掃描時間軸、景深模糊特效，並可自由切換靠左或置中對齊，打造專注的聽歌氛圍。
* **隨手可得的迷你置頂模式**：提供「流線膠囊」與「標準小窗」兩種形態，支援背景高斯模糊、透明度調整與等比例無段縮放，工作時不佔空間。
* **完整 Apple Music 生態與無損支援**：登入即可無縫同步個人資料庫、播放列表、推薦首頁與排行榜，並支援一鍵切換官方無損音質。
* **高度客製化與多語系**：內建繁體中文、簡體中文、English、日本語，支援獨立設定中／英文字體與介面強調色。
* **Discord 狀態同步**：原生整合 Discord Rich Presence，即時顯示播放專輯封面與進度條（暫停後自動保留顯示 5 分鐘）。

---

## 📥 安裝與更新

1. 前往 [Releases 頁面](https://github.com/LonelyChord/Nyx/releases/latest) 下載最新的 Windows 安裝檔（`Nyx_x.x.x_x64-setup.exe`）並執行安裝。
2. **自動更新**：啟動時會自動在背景檢查新版本並完成簽章驗證與安裝；你也可以隨時前往「**外觀與設定 → 版本與自動更新**」手動檢查。

---

## 🛠️ 技術架構與開發

Nyx 基於 **Tauri v2** 構建，透過隱藏視窗載入官方引擎並橋接授權後的 `MusicKit`，在確保完整功能與帳號安全的前提下，將系統資源佔用降至最低。Discord RPC 則採用 Windows Named Pipe 原生實作，無需額外依賴。

### 本機編譯
```powershell
cargo build --release --manifest-path src-tauri/Cargo.toml
