const invoke = window.__TAURI__.core.invoke;
const listen = window.__TAURI__.event.listen;
const appWindow = window.__TAURI__.window.getCurrentWindow();
const t = (key, vars) => (window.NYX_I18N ? window.NYX_I18N.t(key, vars) : key);

const pendingRpcs = new Map();
let rpcSeq = 0;

function rpc(method, params = {}) {
  const id = String(++rpcSeq);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRpcs.delete(id);
      reject(new Error(`RPC timeout: ${method}`));
    }, 15000);
    pendingRpcs.set(id, { resolve, reject, timer });
    invoke("engine_rpc", { id, method, params }).catch((err) => {
      clearTimeout(timer);
      pendingRpcs.delete(id);
      reject(err);
    });
  });
}

listen("engine-rpc-result", (event) => {
  const { id, data } = event.payload || {};
  const entry = pendingRpcs.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pendingRpcs.delete(id);
  if (data && data.ok === false) {
    entry.reject(new Error(data.error || "Unknown error"));
  } else {
    entry.resolve(data || {});
  }
});

// Settings State
const DEFAULT_SETTINGS = {
  language: "zh-TW",
  theme: "dark",
  animPreset: "hybrid",
  miniTheme: "default",
  miniShape: "default",
  miniOpacity: 40,
  displayName: "",
  avatarUrl: "",
  fontFamily: "default",
  customFont: "",
  englishFont: "plus-jakarta",
  customEnglishFont: "",
  fontWeight: "400",
  fluidGlow: true,
  artworkAccent: true,
  customAccent: "#fa2d48",
  cardMotion: true,
  karaokeLyrics: true,
  lyricsBlur: true,
  lyricsAlign: "left",
  miniOnTop: true,
  discordRpc: true,
  discordClientId: "",
  autoCheckUpdate: true,
  lyricsSize: 26,
  blurStrength: 95,
};

const FONT_STACKS = {
  default: '"Segoe UI Variable Text", "Segoe UI Variable Display", "Microsoft JhengHei UI", "Noto Sans TC", system-ui, sans-serif',
  jhenghei: '"Microsoft JhengHei UI", "Microsoft JhengHei", "Segoe UI", sans-serif',
  yahei: '"Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif',
  kaiti: '"DFKai-SB", "BiauKai", "KaiTi", "STKaiti", serif',
  mingliu: '"PMingLiU", "MingLiU", "SimSun", serif',
};

const ENGLISH_FONT_MAP = {
  inter: { family: '"Inter"', gf: "Inter:wght@400;500;600;700;800" },
  "plus-jakarta": { family: '"Plus Jakarta Sans"', gf: "Plus+Jakarta+Sans:wght@400;500;600;700;800" },
  "dm-sans": { family: '"DM Sans"', gf: "DM+Sans:wght@400;500;600;700" },
  outfit: { family: '"Outfit"', gf: "Outfit:wght@400;500;600;700" },
  poppins: { family: '"Poppins"', gf: "Poppins:wght@400;500;600;700" },
  bahnschrift: { family: '"Bahnschrift"' },
  playfair: { family: '"Playfair Display"', gf: "Playfair+Display:wght@500;600;700" },
  georgia: { family: '"Georgia"' },
  jetbrains: { family: '"JetBrains Mono"', gf: "JetBrains+Mono:wght@400;500;600;700" },
};
const loadedWebFonts = new Set();

function loadGoogleFontCss(cacheKey, gfParam) {
  if (!gfParam || loadedWebFonts.has(cacheKey)) return;
  loadedWebFonts.add(cacheKey);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${gfParam}&display=swap`;
  document.head.appendChild(link);
}

function ensureEnglishWebFont(key) {
  const spec = ENGLISH_FONT_MAP[key];
  if (!spec || !spec.gf) return;
  loadGoogleFontCss(`en:${key}`, spec.gf);
}

function resolveCjkFontStack(fontFamily, customFont, lang) {
  const baseSys = lang === "zh-CN"
    ? '"Segoe UI Variable Text", "Microsoft YaHei UI", system-ui, sans-serif'
    : lang === "ja"
      ? '"Segoe UI Variable Text", "Yu Gothic UI", "Meiryo", system-ui, sans-serif'
      : FONT_STACKS.default;

  if (fontFamily === "custom" && customFont && customFont.trim()) {
    const safeName = customFont.trim().replaceAll('"', "");
    return `"${safeName}", ${baseSys}`;
  }
  if (fontFamily === "noto-sans") {
    const gf = lang === "zh-CN" ? "Noto+Sans+SC:wght@400;500;600;700" : lang === "ja" ? "Noto+Sans+JP:wght@400;500;600;700" : "Noto+Sans+TC:wght@400;500;600;700";
    const fam = lang === "zh-CN" ? '"Noto Sans SC"' : lang === "ja" ? '"Noto Sans JP"' : '"Noto Sans TC"';
    loadGoogleFontCss(`cjk:noto-sans:${lang}`, gf);
    return `${fam}, "Noto Sans TC", "Microsoft JhengHei UI", sans-serif`;
  }
  if (fontFamily === "noto-serif") {
    const gf = lang === "zh-CN" ? "Noto+Serif+SC:wght@400;500;600;700" : lang === "ja" ? "Noto+Serif+JP:wght@400;500;600;700" : "Noto+Serif+TC:wght@400;500;600;700";
    const fam = lang === "zh-CN" ? '"Noto Serif SC"' : lang === "ja" ? '"Noto Serif JP"' : '"Noto Serif TC"';
    loadGoogleFontCss(`cjk:noto-serif:${lang}`, gf);
    return `${fam}, "Noto Serif TC", Georgia, serif`;
  }
  if (fontFamily === "lxgw-wenkai") {
    loadGoogleFontCss("cjk:lxgw", "LXGW+WenKai+TC:wght@400;700");
    return `"LXGW WenKai TC", "KaiTi", serif`;
  }
  if (fontFamily === "chocolate-sans") {
    loadGoogleFontCss("cjk:chocolate", "Chocolate+Classical+Sans");
    return `"Chocolate Classical Sans", "Noto Sans TC", sans-serif`;
  }
  if (fontFamily === "cactus-serif") {
    loadGoogleFontCss("cjk:cactus", "Cactus+Classical+Serif");
    return `"Cactus Classical Serif", "Noto Serif TC", serif`;
  }
  if (fontFamily === "zen-maru") {
    loadGoogleFontCss("cjk:zen-maru", "Zen+Maru+Gothic:wght@400;500;700");
    return `"Zen Maru Gothic", "Noto Sans TC", "Microsoft JhengHei UI", sans-serif`;
  }
  if (FONT_STACKS[fontFamily]) {
    return fontFamily === "default" ? baseSys : FONT_STACKS[fontFamily];
  }
  return baseSys;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem("am_custom_settings");
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let settings = loadSettings();

function saveSettings() {
  try {
    localStorage.setItem("am_custom_settings", JSON.stringify(settings));
  } catch (_) {}
}

// Color utilities for Artwork Accent
function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function boostAccentColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  // Lift dark artwork bgColors so accent buttons & highlights remain vivid
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  if (s < 0.15) return null; // Avoid muddy grey accents
  const isLight = settings.theme === "light";
  s = Math.min(0.92, Math.max(0.58, s));
  l = isLight ? Math.min(0.44, Math.max(0.32, l)) : Math.min(0.66, Math.max(0.54, l));

  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const nr = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const ng = Math.round(hue2rgb(p, q, h) * 255);
  const nb = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return { nr, ng, nb };
}

let latestArtworkBgColor = "";
let lastAppliedTheme = "";
let lastAppliedLang = "";
let lastDiscordSettingKey = "";

function applyAccentColor() {
  const isLight = settings.theme === "light";
  const boosted = settings.artworkAccent ? boostAccentColor(latestArtworkBgColor) : null;
  if (boosted) {
    const { nr, ng, nb } = boosted;
    document.documentElement.style.setProperty("--accent", `rgb(${nr}, ${ng}, ${nb})`);
    document.documentElement.style.setProperty("--accent-soft", `rgba(${nr}, ${ng}, ${nb}, ${isLight ? 0.14 : 0.22})`);
    document.documentElement.style.setProperty("--accent-glow", `rgba(${nr}, ${ng}, ${nb}, ${isLight ? 0.28 : 0.38})`);
  } else {
    const fallbackHex = isLight ? "#e6253f" : "#fa2d48";
    const chosenHex = !settings.artworkAccent && settings.customAccent ? settings.customAccent : fallbackHex;
    const rgb = hexToRgb(chosenHex) || hexToRgb(fallbackHex);
    if (rgb) {
      document.documentElement.style.setProperty("--accent", `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
      document.documentElement.style.setProperty("--accent-soft", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${isLight ? 0.14 : 0.22})`);
      document.documentElement.style.setProperty("--accent-glow", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${isLight ? 0.28 : 0.38})`);
    }
  }
}

function getMiniThemeMode() {
  if (settings.miniTheme === "gaussian") return "gaussian";
  if (settings.miniTheme === "transparent") return "transparent";
  return "default";
}

function getMiniShape() {
  return settings.miniShape === "capsule" ? "capsule" : "default";
}

function getAnimPreset() {
  if (settings.animPreset === "fast" || settings.animPreset === "full") return settings.animPreset;
  return "hybrid";
}

function applySettings() {
  const lang = window.NYX_I18N ? window.NYX_I18N.normalizeLang(settings.language) : "zh-TW";
  settings.language = lang;
  const theme = settings.theme === "light" ? "light" : "dark";
  const animPreset = getAnimPreset();
  const miniModeTheme = getMiniThemeMode();
  const isMiniTranslucent = miniModeTheme !== "default";
  const isMiniGaussian = miniModeTheme === "gaussian";
  const isMiniCapsule = getMiniShape() === "capsule";
  const alignCenter = settings.lyricsAlign === "center";
  document.body.classList.toggle("theme-light", theme === "light");
  document.body.classList.toggle("anim-fast", animPreset === "fast");
  document.body.classList.toggle("anim-hybrid", animPreset === "hybrid");
  document.body.classList.toggle("anim-full", animPreset === "full");
  document.body.classList.toggle("mini-theme-transparent", isMiniTranslucent);
  document.body.classList.toggle("mini-theme-gaussian", isMiniGaussian);
  document.body.classList.toggle("mini-shape-capsule", isMiniCapsule);
  document.body.classList.toggle("fluid-on", Boolean(settings.fluidGlow));
  document.body.classList.toggle("motion-on", Boolean(settings.cardMotion));
  document.body.classList.toggle("lyrics-blur-on", Boolean(settings.lyricsBlur));
  document.body.classList.toggle("lyrics-align-center", alignCenter);
  document.documentElement.style.setProperty("--bg-blur", `${settings.blurStrength}px`);
  document.documentElement.style.setProperty("--lyric-size", `${settings.lyricsSize}px`);
  document.documentElement.style.setProperty("--font-weight", String(settings.fontWeight || "400"));
  const miniAlpha = Math.max(0.15, Math.min(0.85, Number(settings.miniOpacity ?? 40) / 100));
  document.documentElement.style.setProperty("--mini-glass-alpha", miniAlpha.toFixed(2));

  const cjkStack = resolveCjkFontStack(settings.fontFamily, settings.customFont, lang);
  let enPrefix = "";
  if (settings.englishFont === "custom" && settings.customEnglishFont && settings.customEnglishFont.trim()) {
    const safeEn = settings.customEnglishFont.trim().replaceAll('"', "");
    enPrefix = `"${safeEn}"`;
  } else if (ENGLISH_FONT_MAP[settings.englishFont]) {
    ensureEnglishWebFont(settings.englishFont);
    enPrefix = ENGLISH_FONT_MAP[settings.englishFont].family;
  }
  document.documentElement.style.setProperty("--font", enPrefix ? `${enPrefix}, ${cjkStack}` : cjkStack);

  if (lang !== lastAppliedLang) {
    lastAppliedLang = lang;
    if (window.NYX_I18N) window.NYX_I18N.applyI18n(lang);
    if (typeof refreshDynamicLocaleLabels === "function") refreshDynamicLocaleLabels();
  }

  if (theme !== lastAppliedTheme) {
    lastAppliedTheme = theme;
    invoke("set_app_theme", { theme }).catch(console.error);
  }
  if (isMiniMode) {
    invoke("set_mini_backdrop", {
      translucentWindow: isMiniTranslucent,
      gaussianBlur: isMiniGaussian,
      capsuleShape: isMiniCapsule,
      isLight: theme === "light",
    }).catch(console.error);
  }

  const discordSettingKey = `${settings.discordRpc ? 1 : 0}|${(settings.discordClientId || "").trim()}`;
  if (discordSettingKey !== lastDiscordSettingKey) {
    lastDiscordSettingKey = discordSettingKey;
    if (typeof syncDiscordPresence === "function") syncDiscordPresence(true);
  }

  applyAccentColor();
  syncSettingsControls();
  if (typeof renderUpdateStatus === "function") renderUpdateStatus();
  if (typeof scheduleAmbientRebake === "function") scheduleAmbientRebake();
}

// UI Elements
const el = {
  ambientImg: document.getElementById("ambient-img"),
  btnBack: document.getElementById("btn-back"),
  titlebarNowPlaying: document.getElementById("titlebar-now-playing"),
  titlebarSongTitle: document.getElementById("titlebar-song-title"),
  searchInput: document.getElementById("global-search"),
  authDot: document.getElementById("auth-dot"),
  authLabel: document.getElementById("auth-label"),
  btnLogout: document.getElementById("btn-logout"),
  sidebarPlaylists: document.getElementById("sidebar-playlists"),
  homeContent: document.getElementById("home-content"),
  chartsContent: document.getElementById("charts-content"),
  searchSub: document.getElementById("search-sub"),
  searchContent: document.getElementById("search-content"),
  libAlbumsCount: document.getElementById("lib-albums-count"),
  libAlbumsGrid: document.getElementById("lib-albums-grid"),
  libSongsCount: document.getElementById("lib-songs-count"),
  libSongsList: document.getElementById("lib-songs-list"),
  recentSongsCount: document.getElementById("recent-songs-count"),
  recentSongsList: document.getElementById("recent-songs-list"),
  detailContent: document.getElementById("detail-content"),
  immersive: document.getElementById("immersive-overlay"),
  immArtwork: document.getElementById("imm-artwork"),
  immPlaceholder: document.getElementById("imm-placeholder"),
  immTitle: document.getElementById("imm-title"),
  immArtist: document.getElementById("imm-artist"),
  immAlbum: document.getElementById("imm-album"),
  lyricsScroll: document.getElementById("lyrics-scroll"),
  queueScroll: document.getElementById("queue-scroll"),
  dockArtwork: document.getElementById("dock-artwork"),
  dockPlaceholder: document.getElementById("dock-placeholder"),
  dockTitle: document.getElementById("dock-title"),
  dockArtist: document.getElementById("dock-artist"),
  iconPlay: document.getElementById("icon-play"),
  iconPause: document.getElementById("icon-pause"),
  btnShuffle: document.getElementById("btn-shuffle"),
  btnRepeat: document.getElementById("btn-repeat"),
  progressSlider: document.getElementById("progress-slider"),
  timeCur: document.getElementById("time-cur"),
  timeTot: document.getElementById("time-tot"),
  volumeSlider: document.getElementById("volume-slider"),
  // Mini player
  miniArtwork: document.getElementById("mini-artwork"),
  miniPlaceholder: document.getElementById("mini-placeholder"),
  miniTitle: document.getElementById("mini-title"),
  miniArtist: document.getElementById("mini-artist"),
  miniProgressFill: document.getElementById("mini-progress-fill"),
  miniIconPlay: document.getElementById("mini-icon-play"),
  miniIconPause: document.getElementById("mini-icon-pause"),
  btnMiniPin: document.getElementById("btn-mini-pin"),
  // Bottom-left user pill
  userPill: document.getElementById("user-pill"),
  userPillImg: document.getElementById("user-pill-img"),
  userPillAvatar: document.getElementById("user-pill-avatar"),
  userPillName: document.getElementById("user-pill-name"),
  // Auto-updater
  updateBanner: document.getElementById("update-banner"),
  updateBannerText: document.getElementById("update-banner-text"),
  btnBannerInstall: document.getElementById("btn-banner-install"),
  btnBannerDismiss: document.getElementById("btn-banner-dismiss"),
  appVersionBadge: document.getElementById("app-version-badge"),
  updateStatusDesc: document.getElementById("update-status-desc"),
  updateProgressWrap: document.getElementById("update-progress-wrap"),
  updateProgressFill: document.getElementById("update-progress-fill"),
  btnCheckUpdate: document.getElementById("btn-check-update"),
  btnInstallUpdate: document.getElementById("btn-install-update"),
};

function syncSettingsControls() {
  const langSel = document.getElementById("set-language");
  if (langSel) langSel.value = window.NYX_I18N ? window.NYX_I18N.normalizeLang(settings.language) : "zh-TW";

  const activeTheme = settings.theme === "light" ? "light" : "dark";
  document.querySelectorAll(".theme-choice[data-theme]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === activeTheme);
  });

  const activeAnim = getAnimPreset();
  document.querySelectorAll(".anim-choice[data-anim]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.anim === activeAnim);
  });

  const activeAlign = settings.lyricsAlign === "center" ? "center" : "left";
  document.querySelectorAll(".align-choice[data-lyrics-align]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lyricsAlign === activeAlign);
  });

  const customAccentRow = document.getElementById("custom-accent-row");
  if (customAccentRow) customAccentRow.classList.toggle("hidden", Boolean(settings.artworkAccent));
  const customAccentHex = String(settings.customAccent || "#fa2d48").toLowerCase();
  const customAccentInput = document.getElementById("set-customAccent");
  if (customAccentInput && document.activeElement !== customAccentInput) customAccentInput.value = customAccentHex;
  document.querySelectorAll(".accent-swatch[data-color]").forEach((btn) => {
    btn.classList.toggle("active", (btn.dataset.color || "").toLowerCase() === customAccentHex);
  });

  const miniThemeMode = getMiniThemeMode();
  const miniThemeSel = document.getElementById("set-miniTheme");
  if (miniThemeSel) miniThemeSel.value = miniThemeMode;
  const miniShapeSel = document.getElementById("set-miniShape");
  if (miniShapeSel) miniShapeSel.value = getMiniShape();
  const miniOpRow = document.getElementById("mini-opacity-row");
  if (miniOpRow) miniOpRow.classList.toggle("hidden", miniThemeMode === "default");
  const miniOpRange = document.getElementById("set-miniOpacity");
  const miniOpVal = document.getElementById("val-miniOpacity");
  const opNum = Number(settings.miniOpacity ?? 40);
  if (miniOpRange) miniOpRange.value = String(opNum);
  if (miniOpVal) miniOpVal.textContent = String(opNum);

  for (const key of ["fluidGlow", "artworkAccent", "cardMotion", "karaokeLyrics", "lyricsBlur", "miniOnTop", "discordRpc", "autoCheckUpdate"]) {
    const input = document.getElementById(`set-${key}`);
    if (input) input.checked = Boolean(settings[key]);
  }
  const discordIdRow = document.getElementById("discord-id-row");
  if (discordIdRow) discordIdRow.classList.toggle("hidden", !settings.discordRpc);
  const discordIdInput = document.getElementById("set-discordClientId");
  if (discordIdInput && document.activeElement !== discordIdInput) discordIdInput.value = settings.discordClientId || "";

  const dnInput = document.getElementById("set-displayName");
  if (dnInput && document.activeElement !== dnInput) dnInput.value = settings.displayName || "";
  const avInput = document.getElementById("set-avatarUrl");
  if (avInput && document.activeElement !== avInput) {
    avInput.value = (settings.avatarUrl || "").startsWith("data:") ? t("set.avatarLocalPicked") : (settings.avatarUrl || "");
  }

  const enFontSel = document.getElementById("set-englishFont");
  if (enFontSel) enFontSel.value = settings.englishFont || "default";
  const customEnRow = document.getElementById("custom-english-font-row");
  if (customEnRow) customEnRow.classList.toggle("hidden", settings.englishFont !== "custom");
  const customEnInput = document.getElementById("set-customEnglishFont");
  if (customEnInput && document.activeElement !== customEnInput) customEnInput.value = settings.customEnglishFont || "";

  const fontSel = document.getElementById("set-fontFamily");
  if (fontSel) fontSel.value = settings.fontFamily || "default";
  const customRow = document.getElementById("custom-font-row");
  if (customRow) customRow.classList.toggle("hidden", settings.fontFamily !== "custom");
  const customInput = document.getElementById("set-customFont");
  if (customInput && document.activeElement !== customInput) customInput.value = settings.customFont || "";
  const weightSel = document.getElementById("set-fontWeight");
  if (weightSel) weightSel.value = String(settings.fontWeight || "400");

  const blurRange = document.getElementById("set-blurStrength");
  const blurVal = document.getElementById("val-blurStrength");
  if (blurRange) blurRange.value = String(settings.blurStrength);
  if (blurVal) blurVal.textContent = String(settings.blurStrength);

  const lyrRange = document.getElementById("set-lyricsSize");
  const lyrVal = document.getElementById("val-lyricsSize");
  if (lyrRange) lyrRange.value = String(settings.lyricsSize);
  if (lyrVal) lyrVal.textContent = String(settings.lyricsSize);

  el.btnMiniPin.classList.toggle("active", Boolean(settings.miniOnTop));
}

document.getElementById("set-displayName").addEventListener("input", (e) => {
  settings.displayName = e.target.value;
  saveSettings();
  renderUserPill();
});

document.getElementById("set-avatarUrl").addEventListener("input", (e) => {
  const val = e.target.value.trim();
  if (!val.startsWith("data:") && val !== t("set.avatarLocalPicked") && val !== "(已選擇本機圖片)") {
    settings.avatarUrl = val;
    saveSettings();
    renderUserPill();
  }
});

document.getElementById("set-avatarFile").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") {
      settings.avatarUrl = reader.result;
      saveSettings();
      syncSettingsControls();
      renderUserPill();
    }
  };
  reader.readAsDataURL(file);
});

document.getElementById("set-language").addEventListener("change", (e) => {
  settings.language = e.target.value;
  saveSettings();
  applySettings();
  loadHomeAndCharts(true);
});

document.getElementById("set-englishFont").addEventListener("change", (e) => {
  settings.englishFont = e.target.value;
  saveSettings();
  applySettings();
});

document.getElementById("set-customEnglishFont").addEventListener("input", (e) => {
  settings.customEnglishFont = e.target.value;
  saveSettings();
  applySettings();
});

document.getElementById("set-fontFamily").addEventListener("change", (e) => {
  settings.fontFamily = e.target.value;
  saveSettings();
  applySettings();
});

document.getElementById("set-customFont").addEventListener("input", (e) => {
  settings.customFont = e.target.value;
  saveSettings();
  applySettings();
});

document.getElementById("set-fontWeight").addEventListener("change", (e) => {
  settings.fontWeight = e.target.value;
  saveSettings();
  applySettings();
});

document.querySelectorAll(".theme-choice[data-theme]").forEach((btn) => {
  btn.addEventListener("click", () => {
    settings.theme = btn.dataset.theme === "light" ? "light" : "dark";
    saveSettings();
    applySettings();
  });
});

document.querySelectorAll(".anim-choice[data-anim]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = btn.dataset.anim;
    settings.animPreset = v === "fast" || v === "full" ? v : "hybrid";
    saveSettings();
    applySettings();
  });
});

document.querySelectorAll(".align-choice[data-lyrics-align]").forEach((btn) => {
  btn.addEventListener("click", () => {
    settings.lyricsAlign = btn.dataset.lyricsAlign === "center" ? "center" : "left";
    saveSettings();
    applySettings();
  });
});

document.querySelectorAll(".accent-swatch[data-color]").forEach((btn) => {
  btn.addEventListener("click", () => {
    settings.customAccent = btn.dataset.color || "#fa2d48";
    saveSettings();
    applySettings();
  });
});

document.getElementById("set-customAccent").addEventListener("input", (e) => {
  settings.customAccent = e.target.value;
  saveSettings();
  applySettings();
});

document.getElementById("set-discordClientId").addEventListener("input", (e) => {
  settings.discordClientId = e.target.value.trim();
  saveSettings();
  applySettings();
});

document.getElementById("set-miniTheme").addEventListener("change", (e) => {
  const val = e.target.value;
  settings.miniTheme = val === "gaussian" || val === "transparent" ? val : "default";
  saveSettings();
  applySettings();
});

document.getElementById("set-miniShape").addEventListener("change", (e) => {
  settings.miniShape = e.target.value === "capsule" ? "capsule" : "default";
  saveSettings();
  applySettings();
});

document.getElementById("set-miniOpacity").addEventListener("input", (e) => {
  settings.miniOpacity = Number(e.target.value);
  saveSettings();
  applySettings();
});

// Bind Settings Controls
for (const key of ["fluidGlow", "artworkAccent", "cardMotion", "karaokeLyrics", "lyricsBlur", "miniOnTop", "discordRpc", "autoCheckUpdate"]) {
  const input = document.getElementById(`set-${key}`);
  if (input) {
    input.addEventListener("change", () => {
      settings[key] = input.checked;
      saveSettings();
      applySettings();
      if (key === "karaokeLyrics") {
        renderLyricLines();
      }
      if (key === "miniOnTop" && isMiniMode) {
        invoke("set_always_on_top", { alwaysOnTop: settings.miniOnTop }).catch(console.error);
      }
    });
  }
}

document.getElementById("set-blurStrength").addEventListener("input", (e) => {
  settings.blurStrength = Number(e.target.value);
  saveSettings();
  applySettings();
});

document.getElementById("set-lyricsSize").addEventListener("input", (e) => {
  settings.lyricsSize = Number(e.target.value);
  saveSettings();
  applySettings();
});

document.getElementById("btn-clear-cache").addEventListener("click", () => {
  try {
    localStorage.removeItem("nyx_cache_home");
    localStorage.removeItem("nyx_cache_library");
    localStorage.removeItem("nyx_cache_profile");
  } catch (_) {}
  if (typeof lyricsCache !== "undefined") lyricsCache.clear();
  if (typeof detailCache !== "undefined") detailCache.clear();
  hasCachedHome = false;
  homeLiveLoaded = false;
  homeLoadedAuthed = false;
  libraryLiveLoaded = false;
  cachedProfile = { name: "", avatar: "" };
  renderUserPill();
  showToast(t("toast.cacheCleared"));
  loadHomeAndCharts(true);
  if (engineState.authorized) loadLibrary(true);
});

document.getElementById("btn-reset-settings").addEventListener("click", () => {
  settings = { ...DEFAULT_SETTINGS };
  saveSettings();
  applySettings();
  renderLyricLines();
  syncDiscordPresence(true);
  showToast(t("toast.settingsReset"));
});

// App State
let engineState = { ready: false, authorized: false };
let currentView = "home";
let viewHistory = [];
let homeLoaded = false;
let libraryLoaded = false;
let libraryPlaylists = [];
let pendingPlaylistTrack = null;
let lastQueueSig = "";
let awaitingLogin = false;
let isMiniMode = false;
let currentSongId = "";
let currentCatalogId = "";
let currentArt = "";
let lyricLines = [];
let activeLyricIdx = -1;
let isScrubbing = false;
let lastPosSec = 0;
let lastDurSec = 0;
let lastSyncAt = 0;
let ignoreRemoteTimeUntil = 0;

function formatTimeSec(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Toast Notifications & Context Menu / Playlist Picker
const actionMenuEl = document.getElementById("action-menu");
const playlistModalEl = document.getElementById("playlist-modal");
const plModalListEl = document.getElementById("pl-modal-list");
const plModalSongEl = document.getElementById("pl-modal-song");
const plNewNameEl = document.getElementById("pl-new-name");
const toastContainerEl = document.getElementById("toast-container");
const immActionsEl = document.getElementById("imm-actions");

function showToast(message, isError = false) {
  if (!toastContainerEl || !message) return;
  const toast = document.createElement("div");
  toast.className = `toast ${isError ? "toast-error" : ""}`;
  toast.textContent = message;
  toastContainerEl.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 260);
  }, 2600);
}

function closeActionMenu() {
  if (actionMenuEl) actionMenuEl.classList.add("hidden");
}

function closePlaylistModal() {
  if (playlistModalEl) playlistModalEl.classList.add("hidden");
  pendingPlaylistTrack = null;
}

async function performTrackAction(action, item) {
  if (!item || !item.id) return;
  try {
    switch (action) {
      case "playNow":
        await rpc("playItem", { id: item.id, type: item.type || "songs" });
        break;
      case "shuffleNow":
        await rpc("playItem", { id: item.id, type: item.type || "playlists", shuffle: true });
        break;
      case "playNext":
        await rpc("playNext", { id: item.id, type: item.type || "songs" });
        showToast(t("toast.playNextAdded", { title: item.title || t("common.itemFallback") }));
        break;
      case "playLater":
        await rpc("playLater", { id: item.id, type: item.type || "songs" });
        showToast(t("toast.playLaterAdded", { title: item.title || t("common.itemFallback") }));
        break;
      case "addToPlaylist":
        await openPlaylistModal(item);
        break;
      case "addToLibrary":
        await rpc("addToLibrary", {
          id: item.id,
          catalogId: item.catalogId || "",
          type: item.type || "songs",
        });
        showToast(t("toast.libraryAdded", { title: item.title || t("common.itemFallback") }));
        libraryLiveLoaded = false;
        loadLibrary(true);
        break;
      case "loveSong":
        await rpc("loveSong", {
          id: item.id,
          catalogId: item.catalogId || "",
        });
        showToast(t("toast.loved", { title: item.title || t("common.songFallback") }));
        break;
    }
  } catch (err) {
    showToast(err && err.message ? err.message : t("toast.actionFailed"), true);
  }
}

function openItemActionMenu(item, clientX, clientY, isCollection = false) {
  if (!actionMenuEl || !item || !item.id) return;

  const isLibItem = String(item.type || "").startsWith("library-");
  const rows = [];
  if (isCollection) {
    rows.push(
      { action: "playNow", label: t("menu.playNow"), ico: "play" },
      { action: "shuffleNow", label: t("menu.shuffleNow"), ico: "shuffle" }
    );
  }
  rows.push(
    { action: "playNext", label: t("menu.playNext"), ico: "next" },
    { action: "playLater", label: t("menu.playLater"), ico: "later" }
  );
  if (!isCollection) {
    rows.push({ sep: true }, { action: "addToPlaylist", label: t("menu.addToPlaylist"), ico: "playlist" });
  }
  if (!isLibItem) {
    rows.push({ action: "addToLibrary", label: t("menu.addToLibrary"), ico: "plus" });
  }
  if (!isCollection) {
    rows.push({ action: "loveSong", label: t("menu.loveSong"), ico: "heart" });
  }

  const icons = {
    play: `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>`,
    shuffle: `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>`,
    next: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`,
    later: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
    playlist: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`,
    heart: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  };

  actionMenuEl.innerHTML = rows
    .map((r) =>
      r.sep
        ? `<div class="action-sep"></div>`
        : `<button type="button" class="action-item" data-action="${r.action}">
            <span class="action-ico">${icons[r.ico] || ""}</span>
            <span>${r.label}</span>
          </button>`
    )
    .join("");

  actionMenuEl.classList.remove("hidden");
  const rect = actionMenuEl.getBoundingClientRect();
  const x = Math.min(clientX, window.innerWidth - rect.width - 12);
  const y = Math.min(clientY, window.innerHeight - rect.height - 12);
  actionMenuEl.style.left = `${Math.max(12, x)}px`;
  actionMenuEl.style.top = `${Math.max(12, y)}px`;

  actionMenuEl.querySelectorAll(".action-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const act = btn.dataset.action;
      closeActionMenu();
      performTrackAction(act, item);
    });
  });
}

async function openPlaylistModal(track) {
  if (!engineState.authorized) {
    showToast(t("toast.signInRequired"), true);
    return;
  }
  pendingPlaylistTrack = track;
  if (plModalSongEl) {
    plModalSongEl.textContent = `${track.title || t("common.songFallback")}${track.artist ? ` · ${track.artist}` : ""}`;
  }
  if (plNewNameEl) plNewNameEl.value = "";
  playlistModalEl.classList.remove("hidden");

  if (!libraryPlaylists.length) {
    plModalListEl.innerHTML = `<div class="sidebar-muted">${escapeHtml(t("plModal.loading"))}</div>`;
    libraryLiveLoaded = false;
    await loadLibrary(true);
  }
  renderPlaylistModalList();
}

function renderPlaylistModalList() {
  if (!plModalListEl) return;
  if (!libraryPlaylists.length) {
    plModalListEl.innerHTML = `<div class="sidebar-muted">${escapeHtml(t("plModal.empty"))}</div>`;
    return;
  }
  plModalListEl.innerHTML = libraryPlaylists
    .map(
      (pl) => `
      <button type="button" class="pl-modal-item" data-pl-id="${escapeHtml(pl.id)}" data-pl-name="${escapeHtml(pl.name)}">
        ${
          pl.artwork
            ? `<img class="pl-modal-art" src="${escapeHtml(pl.artwork)}" alt="" />`
            : `<span class="pl-modal-art pl-modal-ph"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg></span>`
        }
        <span class="pl-modal-name">${escapeHtml(pl.name)}</span>
      </button>`
    )
    .join("");

  plModalListEl.querySelectorAll(".pl-modal-item").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = pendingPlaylistTrack;
      const plId = btn.dataset.plId;
      const plName = btn.dataset.plName;
      closePlaylistModal();
      if (!target || !plId) return;
      try {
        await rpc("addToPlaylist", {
          playlistId: plId,
          id: target.id,
          catalogId: target.catalogId || "",
          type: target.type || "songs",
        });
        invalidateCollectionCache(plId);
        showToast(t("toast.addedToPlaylist", { name: plName }));
        if (lastDetailData && lastDetailData.id === plId && currentView === "detail") {
          openCollection(lastDetailData.type || "library-playlists", plId, true);
        }
      } catch (err) {
        showToast(err && err.message ? err.message : t("toast.addToPlaylistFailed"), true);
      }
    });
  });
}

document.getElementById("btn-close-pl-modal").addEventListener("click", closePlaylistModal);
playlistModalEl.addEventListener("click", (e) => {
  if (e.target === playlistModalEl) closePlaylistModal();
});
document.getElementById("btn-pl-create").addEventListener("click", async () => {
  const name = (plNewNameEl.value || "").trim();
  const target = pendingPlaylistTrack;
  if (!name) {
    showToast(t("toast.enterPlaylistName"), true);
    plNewNameEl.focus();
    return;
  }
  closePlaylistModal();
  try {
    await rpc("createPlaylist", {
      name,
      trackId: target ? target.id : "",
      catalogId: target ? target.catalogId || "" : "",
      trackType: target ? target.type || "songs" : "songs",
    });
    showToast(t("toast.createdPlaylist", { name }));
    libraryLiveLoaded = false;
    loadLibrary(true);
  } catch (err) {
    showToast(err && err.message ? err.message : t("toast.createPlaylistFailed"), true);
  }
});

document.addEventListener("click", (e) => {
  if (actionMenuEl && !actionMenuEl.classList.contains("hidden") && !actionMenuEl.contains(e.target)) {
    closeActionMenu();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeActionMenu();
    closePlaylistModal();
  }
});

// Window & Mini Mode Controls
document.getElementById("btn-min").addEventListener("click", () => appWindow.minimize());
document.getElementById("btn-max").addEventListener("click", () => appWindow.toggleMaximize());
document.getElementById("btn-close").addEventListener("click", () => appWindow.close());
document.getElementById("btn-lossless").addEventListener("click", () => {
  invoke("open_official_lossless").catch(console.error);
});

// Make all non-interactive regions of the titlebar, sidebar brand header, and mini player draggable
for (const selector of [".titlebar", ".brand-header", "#mini-player"]) {
  const region = document.querySelector(selector);
  if (!region) continue;
  region.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || e.detail > 1) return;
    if (e.target.closest("button, input, a, .search-pill, .mini-actions")) return;
    appWindow.startDragging().catch(() => {});
  });
}

const miniPlayerEl = document.getElementById("mini-player");

function updateMiniScale() {
  if (!miniPlayerEl) return;
  if (!isMiniMode) {
    miniPlayerEl.style.zoom = "";
    document.documentElement.style.setProperty("--mini-scale", "1");
    return;
  }
  const scale = Math.max(0.8, Math.min(1.5, window.innerHeight / 152));
  miniPlayerEl.style.zoom = scale.toFixed(4);
  document.documentElement.style.setProperty("--mini-scale", scale.toFixed(4));
}

window.addEventListener("resize", updateMiniScale);

async function setMiniMode(enabled) {
  isMiniMode = enabled;
  document.body.classList.toggle("mini-mode", enabled);
  lastRenderedMiniPct = "";
  lastRenderedCurText = "";
  lastRenderedTotText = "";
  lastRenderedSliderVal = "";
  if (typeof renderPlaybackFrame === "function") renderPlaybackFrame();
  await invoke("set_mini_mode", {
    enabled,
    alwaysOnTop: Boolean(settings.miniOnTop),
    translucentWindow: getMiniThemeMode() !== "default",
    gaussianBlur: getMiniThemeMode() === "gaussian",
    capsuleShape: getMiniShape() === "capsule",
    isLight: settings.theme === "light",
  }).catch(console.error);
  updateMiniScale();
}

document.getElementById("btn-mini").addEventListener("click", () => setMiniMode(true));
document.getElementById("btn-mini-expand").addEventListener("click", () => setMiniMode(false));
el.btnMiniPin.addEventListener("click", () => {
  settings.miniOnTop = !settings.miniOnTop;
  saveSettings();
  applySettings();
  if (isMiniMode) {
    invoke("set_always_on_top", { alwaysOnTop: settings.miniOnTop }).catch(console.error);
  }
});

document.getElementById("btn-auth").addEventListener("click", () => {
  awaitingLogin = true;
  invoke("set_engine_visible", { visible: true }).catch(console.error);
});

if (el.btnLogout) {
  el.btnLogout.addEventListener("click", async () => {
    el.btnLogout.disabled = true;
    try {
      await rpc("signOut");
      try {
        localStorage.removeItem("nyx_cache_home");
        localStorage.removeItem("nyx_cache_library");
        localStorage.removeItem("nyx_cache_profile");
        localStorage.removeItem("nyx_cache_recent_tracks");
      } catch (_) {}
      engineState.authorized = false;
      engineState.playing = false;
      engineState.nowPlaying = null;
      cachedProfile = { name: "", avatar: "" };
      libraryPlaylists = [];
      recentTracks = [];
      hasCachedHome = false;
      homeLiveLoaded = false;
      homeLoadedAuthed = false;
      libraryLiveLoaded = false;
      lastAlbumsCount = 0;
      lastSongsCount = 0;

      el.authDot.classList.remove("ok");
      el.authLabel.textContent = t("set.auth.signInPrompt");
      el.btnLogout.classList.add("hidden");
      el.sidebarPlaylists.innerHTML = `<div class="sidebar-muted">${escapeHtml(t("nav.loginPlaylists"))}</div>`;
      el.libAlbumsGrid.innerHTML = "";
      el.libSongsList.innerHTML = "";
      el.libAlbumsCount.textContent = t("lib.albumsCount", { count: 0 });
      el.libSongsCount.textContent = t("lib.songsCount", { count: 0 });
      if (typeof renderRecentTracks === "function") renderRecentTracks();
      renderUserPill();
      syncDiscordPresence(true);
      showToast(t("toast.signedOut"));
    } catch (err) {
      showToast(t("toast.signOutFailed"), true);
      console.error(err);
    } finally {
      el.btnLogout.disabled = false;
    }
  });
}

el.userPill.addEventListener("click", () => {
  switchView("settings");
});

// View Navigation
function switchView(viewName, pushHistory = true) {
  if (pushHistory && currentView !== viewName) {
    viewHistory.push(currentView);
  }
  currentView = viewName;
  el.btnBack.disabled = viewHistory.length === 0;
  document.querySelectorAll(".nav-item").forEach((n) => {
    n.classList.toggle("active", n.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add("active");
  el.immersive.classList.remove("open");
  document.body.classList.remove("immersive-open");
  immersiveOpen = false;
  if (viewName === "recent" && typeof refreshRecentTracks === "function") {
    refreshRecentTracks();
  }
  if (typeof ensureTickLoop === "function") ensureTickLoop();
}

el.btnBack.addEventListener("click", () => {
  const prev = viewHistory.pop();
  if (prev) switchView(prev, false);
});

document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

// Immersive Overlay
let immersiveOpen = false;
function toggleImmersive(forceState) {
  const next = typeof forceState === "boolean" ? forceState : !el.immersive.classList.contains("open");
  immersiveOpen = next;
  el.immersive.classList.toggle("open", next);
  document.body.classList.toggle("immersive-open", next);
  if (next) {
    renderPlaybackFrame();
    updateLyricScrollTarget(true);
  }
  if (typeof ensureTickLoop === "function") ensureTickLoop();
}

function readLocalJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

let cachedProfile = readLocalJson("nyx_cache_profile", { name: "", avatar: "" }) || { name: "", avatar: "" };
let lastUserPillSig = "";

function renderUserPill() {
  const customName = (settings.displayName || "").trim();
  const detectedName = (engineState.userName || cachedProfile.name || "").trim();
  const displayName = customName || detectedName || (engineState.authorized ? "Apple Music" : t("user.notSignedIn"));

  const customAvatar = (settings.avatarUrl || "").trim();
  const detectedAvatar = (engineState.userAvatar || cachedProfile.avatar || "").trim();
  const avatarSrc = customAvatar || detectedAvatar;

  const sig = `${displayName}|${avatarSrc}|${customName ? 1 : 0}|${detectedName ? 1 : 0}|${lastAppliedLang}`;
  if (sig === lastUserPillSig) return;
  lastUserPillSig = sig;

  el.userPillName.textContent = displayName;
  if (avatarSrc) {
    el.userPillImg.src = avatarSrc;
    el.userPillImg.classList.remove("hidden");
    el.userPillAvatar.classList.add("hidden");
  } else {
    el.userPillImg.classList.add("hidden");
    el.userPillAvatar.classList.remove("hidden");
    if (customName || detectedName) {
      el.userPillAvatar.textContent = displayName.slice(0, 1).toUpperCase();
    }
  }
}

document.getElementById("dock-track-trigger").addEventListener("click", () => toggleImmersive());
document.getElementById("btn-dock-more").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!engineState.nowPlaying) {
    showToast(t("toast.noCurrentSong"));
    return;
  }
  const rect = e.currentTarget.getBoundingClientRect();
  openItemActionMenu(engineState.nowPlaying, rect.left - 150, rect.top - 190, false);
});
document.getElementById("btn-imm-add-pl").addEventListener("click", () => {
  if (engineState.nowPlaying) openPlaylistModal(engineState.nowPlaying);
});
document.getElementById("btn-imm-more").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!engineState.nowPlaying) return;
  const rect = e.currentTarget.getBoundingClientRect();
  openItemActionMenu(engineState.nowPlaying, rect.left, rect.bottom + 8, false);
});
document.getElementById("btn-lyrics").addEventListener("click", () => toggleImmersive());
document.getElementById("btn-close-immersive").addEventListener("click", () => toggleImmersive(false));

document.querySelectorAll(".imm-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const k = tab.dataset.imm;
    document.querySelectorAll(".imm-tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".imm-pane").forEach((p) => p.classList.remove("active"));
    document.getElementById(`imm-pane-${k}`).classList.add("active");
  });
});

// Transport Controls (Full + Mini)
document.getElementById("btn-play").addEventListener("click", () => rpc("togglePlay").catch(console.error));
document.getElementById("btn-prev").addEventListener("click", () => rpc("previous").catch(console.error));
document.getElementById("btn-next").addEventListener("click", () => rpc("next").catch(console.error));
document.getElementById("btn-mini-play").addEventListener("click", () => rpc("togglePlay").catch(console.error));
document.getElementById("btn-mini-prev").addEventListener("click", () => rpc("previous").catch(console.error));
document.getElementById("btn-mini-next").addEventListener("click", () => rpc("next").catch(console.error));
el.btnShuffle.addEventListener("click", () => rpc("toggleShuffle").catch(console.error));
el.btnRepeat.addEventListener("click", () => rpc("cycleRepeat").catch(console.error));

el.progressSlider.addEventListener("input", () => {
  isScrubbing = true;
  if (lastDurSec > 0) {
    el.timeCur.textContent = formatTimeSec((Number(el.progressSlider.value) / 1000) * lastDurSec);
  }
});

el.progressSlider.addEventListener("change", () => {
  isScrubbing = false;
  if (lastDurationValid()) {
    const targetSec = (Number(el.progressSlider.value) / 1000) * lastDurSec;
    lastPosSec = targetSec;
    lastSyncAt = performance.now();
    ignoreRemoteTimeUntil = lastSyncAt + 900;
    syncDiscordPresence(true);
    rpc("seek", { sec: targetSec }).catch(console.error);
  }
});

function lastDurationValid() {
  return lastDurSec > 0;
}

el.volumeSlider.addEventListener("input", () => {
  rpc("setVolume", { volume: Number(el.volumeSlider.value) / 100 }).catch(console.error);
});

// Render Helpers
function renderCards(items) {
  const playTitle = escapeHtml(t("card.playTitle"));
  return items
    .map(
      (item, idx) => `
    <div class="media-card" style="--stagger-i: ${Math.min(idx, 14)}" data-id="${escapeHtml(item.id)}" data-type="${escapeHtml(item.type)}" data-name="${escapeHtml(item.name)}">
      <div class="card-art-wrap">
        <img class="card-art" src="${escapeHtml(item.artwork)}" loading="lazy" alt="" />
        <button class="card-play-fab" title="${playTitle}" data-play-id="${escapeHtml(item.id)}" data-play-type="${escapeHtml(item.type)}">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
        </button>
      </div>
      <div class="card-title">${escapeHtml(item.name)}</div>
      <div class="card-sub">${escapeHtml(item.subtitle || "Apple Music")}</div>
    </div>`
    )
    .join("");
}

function getRowTrackData(row) {
  return {
    id: row.dataset.songId || "",
    catalogId: row.dataset.catalogId || "",
    type: row.dataset.songType || "songs",
    title: row.dataset.title || "",
    artist: row.dataset.artist || "",
  };
}

function isTrackRowCurrent(sid, cid) {
  return Boolean(
    (currentSongId && ((sid && sid === currentSongId) || (cid && cid === currentSongId))) ||
    (currentCatalogId && ((sid && sid === currentCatalogId) || (cid && cid === currentCatalogId)))
  );
}

function syncPlayingTrackHighlight() {
  document.querySelectorAll(".track-row").forEach((row) => {
    if (row.hasAttribute("data-q-idx")) return;
    row.classList.toggle("playing", isTrackRowCurrent(row.dataset.songId || "", row.dataset.catalogId || ""));
  });
}

function renderSongRows(songs) {
  const moreTitle = escapeHtml(t("track.moreTitle"));
  return songs
    .map(
      (s, idx) => `
    <div class="track-row ${isTrackRowCurrent(s.id, s.catalogId) ? "playing" : ""}" style="--stagger-i: ${Math.min(idx, 16)}" data-song-id="${escapeHtml(s.id)}" data-catalog-id="${escapeHtml(s.catalogId || "")}" data-song-type="${escapeHtml(s.kind)}" data-title="${escapeHtml(s.title)}" data-artist="${escapeHtml(s.artist)}" data-idx="${idx}">
      <img class="track-row-art" src="${escapeHtml(s.artworkSmall || s.artwork)}" loading="lazy" alt="" />
      <div class="track-row-main">
        <div class="track-row-title">${escapeHtml(s.title)}</div>
        <div class="track-row-artist">${escapeHtml(s.artist)}</div>
      </div>
      <div class="track-row-album">${escapeHtml(s.album)}</div>
      <div class="track-row-dur">${formatTimeSec((s.durationMs || 0) / 1000)}</div>
      <button type="button" class="track-row-more" title="${moreTitle}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
      </button>
    </div>`
    )
    .join("");
}

const songCollectionContextMap = new WeakMap();
const detailCache = new Map();
const lyricsCache = new Map();

function bindCardEvents(container) {
  if (!container || container.dataset.cardDelegated === "1") return;
  container.dataset.cardDelegated = "1";
  container.addEventListener("click", (e) => {
    const fab = e.target.closest(".card-play-fab");
    if (fab) {
      e.stopPropagation();
      rpc("playItem", { id: fab.dataset.playId, type: fab.dataset.playType }).catch(console.error);
      return;
    }
    const card = e.target.closest(".media-card");
    if (card) {
      openCollection(card.dataset.type, card.dataset.id);
    }
  });
  container.addEventListener("contextmenu", (e) => {
    const card = e.target.closest(".media-card");
    if (!card) return;
    e.preventDefault();
    openItemActionMenu(
      { id: card.dataset.id, type: card.dataset.type, title: card.dataset.name },
      e.clientX,
      e.clientY,
      true
    );
  });
}

function bindSongEvents(container, collectionContext = null) {
  if (!container) return;
  songCollectionContextMap.set(container, collectionContext);
  if (container.dataset.songDelegated === "1") return;
  container.dataset.songDelegated = "1";
  container.addEventListener("click", (e) => {
    const moreBtn = e.target.closest(".track-row-more");
    if (moreBtn) {
      e.stopPropagation();
      const row = moreBtn.closest(".track-row");
      if (!row) return;
      const rect = moreBtn.getBoundingClientRect();
      openItemActionMenu(getRowTrackData(row), rect.right - 180, rect.bottom + 6, false);
      return;
    }
    const row = e.target.closest(".track-row");
    if (!row) return;
    const ctx = songCollectionContextMap.get(container) || null;
    if (ctx) {
      rpc("playItem", {
        id: ctx.id,
        type: ctx.type,
        startWith: Number(row.dataset.idx || 0),
        songId: row.dataset.songId || "",
        catalogId: row.dataset.catalogId || "",
        title: row.dataset.title || "",
        artist: row.dataset.artist || "",
      }).catch(console.error);
    } else {
      rpc("playItem", { id: row.dataset.songId, type: row.dataset.songType }).catch(console.error);
    }
  });
  container.addEventListener("contextmenu", (e) => {
    const row = e.target.closest(".track-row");
    if (!row) return;
    e.preventDefault();
    openItemActionMenu(getRowTrackData(row), e.clientX, e.clientY, false);
  });
}

function renderDetailData(d) {
  if (!d) return;
  lastDetailData = d;
  const isLibCol = String(d.type || "").startsWith("library-");
  el.detailContent.innerHTML = `
      <div class="detail-hero">
        <img class="detail-art" src="${escapeHtml(d.artwork)}" alt="" />
        <div class="detail-info">
          <h1>${escapeHtml(d.name)}</h1>
          <div class="detail-sub">${escapeHtml(d.subtitle || "Apple Music")}</div>
          ${d.description ? `<p class="detail-desc">${escapeHtml(d.description)}</p>` : ""}
          <div class="detail-actions">
            <button id="btn-play-collection" class="btn-play-all">${escapeHtml(t("detail.playAll"))}</button>
            <button id="btn-shuffle-collection" class="btn-shuffle-all">
              <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
              <span>${escapeHtml(t("detail.shuffleAll"))}</span>
            </button>
            <button id="btn-col-next" class="btn-secondary">${escapeHtml(t("menu.playNext"))}</button>
            ${!isLibCol ? `<button id="btn-col-lib" class="btn-secondary">${escapeHtml(t("menu.addToLibrary"))}</button>` : ""}
          </div>
        </div>
      </div>
      <div class="track-table" id="detail-tracks">${renderSongRows(d.tracks)}</div>
    `;
  document.getElementById("btn-play-collection").addEventListener("click", () => {
    rpc("playItem", { id: d.id, type: d.type, startWith: 0, shuffle: false }).catch(console.error);
  });
  document.getElementById("btn-shuffle-collection").addEventListener("click", () => {
    rpc("playItem", {
      id: d.id,
      type: d.type,
      shuffle: true,
      trackCount: Array.isArray(d.tracks) ? d.tracks.length : 0,
    }).catch(console.error);
  });
  document.getElementById("btn-col-next").addEventListener("click", () => {
    performTrackAction("playNext", { id: d.id, type: d.type, title: d.name });
  });
  const libBtn = document.getElementById("btn-col-lib");
  if (libBtn) {
    libBtn.addEventListener("click", () => {
      performTrackAction("addToLibrary", { id: d.id, type: d.type, title: d.name });
    });
  }
  bindSongEvents(document.getElementById("detail-tracks"), { id: d.id, type: d.type });
}

function invalidateCollectionCache(colId) {
  if (!colId) return;
  const suffix = `|${colId}`;
  for (const key of Array.from(detailCache.keys())) {
    if (key.endsWith(suffix)) detailCache.delete(key);
  }
}

async function openCollection(type, id, bypassCache = false) {
  switchView("detail");
  const cacheKey = `${settings.language || "zh-TW"}|${type}|${id}`;
  const cached = !bypassCache ? detailCache.get(cacheKey) : null;
  if (cached && Date.now() - cached.ts < 90000) {
    renderDetailData(cached.detail);
    return;
  }
  el.detailContent.innerHTML = `<div class="skeleton-hint">${escapeHtml(t("detail.loading"))}</div>`;
  try {
    const res = await rpc("getCollectionDetail", { type, id, lang: settings.language, noCache: bypassCache });
    if (res && res.detail) {
      if (detailCache.size >= 20) {
        const firstKey = detailCache.keys().next().value;
        if (firstKey !== undefined) detailCache.delete(firstKey);
      }
      detailCache.set(cacheKey, { detail: res.detail, ts: Date.now() });
    }
    renderDetailData(res.detail);
  } catch (err) {
    el.detailContent.innerHTML = `<div class="skeleton-hint">${escapeHtml(t("detail.loadFailed", { msg: err.message }))}</div>`;
  }
}

let hasCachedHome = false;
let homeLiveLoaded = false;
let homeLoadedAuthed = false;
let homeFetching = false;
let libraryLiveLoaded = false;
let libraryFetching = false;
let lastHomeData = null;
let lastDetailData = null;
let lastSearchData = null;
let lastAlbumsCount = null;
let lastSongsCount = null;
let lastSearchTerm = "";
let lastDiscordKey = "";
let lastDiscordStartSec = 0;
let discordPauseClearTimer = null;
let discordPauseExpired = false;
let lastDiscordTrackId = "";
const DISCORD_PAUSE_KEEP_MS = 5 * 60 * 1000;

function refreshDynamicLocaleLabels() {
  if (el.authLabel) {
    if (!engineState.ready) {
      el.authLabel.textContent = t("set.auth.connecting");
    } else {
      el.authLabel.textContent = engineState.authorized ? t("set.auth.connected") : t("set.auth.signInPrompt");
    }
  }
  if (typeof renderUserPill === "function" && el.userPillName) renderUserPill();
  if (el.libAlbumsCount && lastAlbumsCount !== null) {
    el.libAlbumsCount.textContent = t("lib.albumsCount", { count: lastAlbumsCount });
  }
  if (el.libSongsCount && lastSongsCount !== null) {
    el.libSongsCount.textContent = t("lib.songsCount", { count: lastSongsCount });
  }
  if (typeof renderRecentTracks === "function" && el.recentSongsCount) {
    renderRecentTracks();
  }
  if (el.searchSub && lastSearchTerm) {
    el.searchSub.textContent = t("search.sub", { term: lastSearchTerm });
  }
  if (el.sidebarPlaylists && !libraryPlaylists.length) {
    el.sidebarPlaylists.innerHTML = `<div class="sidebar-muted">${escapeHtml(t("nav.loginPlaylists"))}</div>`;
  }
  if (el.lyricsScroll && !lyricLines.length) {
    el.lyricsScroll.innerHTML = `<div class="lyrics-empty">${escapeHtml(currentSongId ? t("imm.lyricsUnavailable") : t("imm.lyricsEmptyIdle"))}</div>`;
  }
  if (lastHomeData) renderHomeData(lastHomeData);
  if (lastDetailData) renderDetailData(lastDetailData);
  if (lastSearchData) renderSearchData(lastSearchData);
}

function renderHomeData(res) {
  if (!res) return;
  lastHomeData = res;
  const shelfHtml = (res.shelves || [])
    .map(
      (s) => `
      <div class="shelf">
        <h2 class="shelf-title">${escapeHtml(s.title)}</h2>
        <div class="card-grid">${renderCards(s.items)}</div>
      </div>`
    )
    .join("");

  const topAlbumHtml = (res.topAlbums || []).length
    ? `<div class="shelf"><h2 class="shelf-title">${escapeHtml(t("home.topAlbums"))}</h2><div class="card-grid">${renderCards(res.topAlbums)}</div></div>`
    : "";

  el.homeContent.innerHTML = shelfHtml + topAlbumHtml || `<div class="skeleton-hint">${escapeHtml(t("home.loginPrompt"))}</div>`;
  bindCardEvents(el.homeContent);

  el.chartsContent.innerHTML = `
      ${(res.topSongs || []).length ? `<div class="shelf"><h2 class="shelf-title">${escapeHtml(t("charts.topSongs"))}</h2><div class="track-table" id="charts-songs">${renderSongRows(res.topSongs)}</div></div>` : ""}
      ${(res.topPlaylists || []).length ? `<div class="shelf"><h2 class="shelf-title">${escapeHtml(t("charts.topPlaylists"))}</h2><div class="card-grid">${renderCards(res.topPlaylists)}</div></div>` : ""}
    `;
  bindCardEvents(el.chartsContent);
  const chartSongsEl = document.getElementById("charts-songs");
  if (chartSongsEl) bindSongEvents(chartSongsEl);
}

let recentTracks = [];
let recentFetching = false;

function getTrackDedupeKey(tr) {
  if (!tr) return "";
  const cid = String(tr.catalogId || "").trim();
  const id = String(tr.id || "").trim();
  return cid || id || `${String(tr.title || "").trim().toLowerCase()}|${String(tr.artist || "").trim().toLowerCase()}`;
}

function renderRecentTracks() {
  if (!el.recentSongsList || !el.recentSongsCount) return;
  el.recentSongsCount.textContent = t("lib.recentCount", { count: recentTracks.length });
  if (!recentTracks.length) {
    el.recentSongsList.innerHTML = `<div class="skeleton-hint">${escapeHtml(t("recent.empty"))}</div>`;
    return;
  }
  el.recentSongsList.innerHTML = renderSongRows(recentTracks);
  bindSongEvents(el.recentSongsList);
}

function recordRecentTrack(np) {
  if (!np || (!np.id && !np.title)) return;
  const entry = {
    id: np.id || np.catalogId || "",
    catalogId: np.catalogId || np.id || "",
    kind: np.kind || "songs",
    title: np.title || t("common.unknownSong"),
    artist: np.artist || "",
    album: np.album || "",
    durationMs: Number(np.durationMs || 0),
    artwork: np.artwork || "",
    artworkSmall: np.artworkSmall || np.artwork || "",
  };
  const key = getTrackDedupeKey(entry);
  const filtered = recentTracks.filter((item) => getTrackDedupeKey(item) !== key);
  recentTracks = [entry, ...filtered].slice(0, 60);
  writeLocalJson("nyx_cache_recent_tracks", recentTracks);
  renderRecentTracks();
}

function mergeServerRecentTracks(serverList) {
  if (!Array.isArray(serverList) || !serverList.length) return;
  const seen = new Set();
  const merged = [];
  for (const item of [...recentTracks, ...serverList]) {
    const key = getTrackDedupeKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= 60) break;
  }
  recentTracks = merged;
  writeLocalJson("nyx_cache_recent_tracks", recentTracks);
  renderRecentTracks();
}

async function refreshRecentTracks() {
  if (recentFetching || !engineState.authorized) return;
  recentFetching = true;
  try {
    const res = await rpc("getRecentTracks", { lang: settings.language });
    if (res && Array.isArray(res.tracks)) {
      mergeServerRecentTracks(res.tracks);
    }
  } catch (_) {
    // Keep existing local history on transient failure
  } finally {
    recentFetching = false;
  }
}

function renderLibraryData(res) {
  if (!res) return;
  libraryPlaylists = res.playlists || [];
  if (Array.isArray(res.recentTracks) && res.recentTracks.length) {
    mergeServerRecentTracks(res.recentTracks);
  }

  if (libraryPlaylists.length) {
    el.sidebarPlaylists.innerHTML = libraryPlaylists
      .map(
        (pl) => `
        <button class="nav-item" data-pl-id="${escapeHtml(pl.id)}" data-pl-type="${escapeHtml(pl.type)}">
          ${pl.artwork ? `<img class="playlist-thumb" src="${escapeHtml(pl.artwork)}" alt="" />` : `<span class="nav-ico"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg></span>`}
          <span class="playlist-name">${escapeHtml(pl.name)}</span>
        </button>`
      )
      .join("");

    el.sidebarPlaylists.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => openCollection(btn.dataset.plType, btn.dataset.plId));
    });
  } else {
    el.sidebarPlaylists.innerHTML = `<div class="sidebar-muted">${escapeHtml(t("nav.loginPlaylists"))}</div>`;
  }

  lastAlbumsCount = (res.albums || []).length;
  el.libAlbumsCount.textContent = t("lib.albumsCount", { count: lastAlbumsCount });
  el.libAlbumsGrid.innerHTML = renderCards(res.albums || []);
  bindCardEvents(el.libAlbumsGrid);

  lastSongsCount = (res.songs || []).length;
  el.libSongsCount.textContent = t("lib.songsCount", { count: lastSongsCount });
  el.libSongsList.innerHTML = renderSongRows(res.songs || []);
  bindSongEvents(el.libSongsList);
}

function hydrateBootCaches() {
  const cachedHome = readLocalJson("nyx_cache_home");
  if (cachedHome && ((cachedHome.shelves || []).length || (cachedHome.topAlbums || []).length || (cachedHome.topSongs || []).length)) {
    hasCachedHome = true;
    renderHomeData(cachedHome);
  }
  const cachedLib = readLocalJson("nyx_cache_library");
  if (cachedLib && ((cachedLib.playlists || []).length || (cachedLib.albums || []).length || (cachedLib.songs || []).length)) {
    renderLibraryData(cachedLib);
  }
  const cachedRecent = readLocalJson("nyx_cache_recent_tracks");
  if (Array.isArray(cachedRecent) && cachedRecent.length) {
    recentTracks = cachedRecent.slice(0, 60);
  }
  renderRecentTracks();
}

async function loadHomeAndCharts(force = false) {
  if (homeFetching) return;
  if (homeLiveLoaded && !force) return;
  homeFetching = true;
  try {
    const authedAtCall = Boolean(engineState.authorized);
    const res = await rpc("getHome", { lang: settings.language });
    homeLiveLoaded = true;
    homeLoaded = true;
    if (authedAtCall) homeLoadedAuthed = true;
    renderHomeData(res);
    hasCachedHome = true;
    writeLocalJson("nyx_cache_home", {
      shelves: res.shelves || [],
      topAlbums: res.topAlbums || [],
      topSongs: res.topSongs || [],
      topPlaylists: res.topPlaylists || [],
    });
  } catch (err) {
    if (!hasCachedHome) {
      el.homeContent.innerHTML = `<div class="skeleton-hint">${escapeHtml(t("home.waitingEngine", { msg: err.message }))}</div>`;
    }
  } finally {
    homeFetching = false;
  }
}

async function loadLibrary(force = false) {
  if (libraryFetching) return;
  if (libraryLiveLoaded && !force) return;
  libraryFetching = true;
  try {
    const res = await rpc("getLibrary");
    libraryLiveLoaded = true;
    libraryLoaded = true;
    renderLibraryData(res);
    writeLocalJson("nyx_cache_library", {
      playlists: res.playlists || [],
      albums: res.albums || [],
      songs: res.songs || [],
    });
  } catch (_) {
    // Keep cached UI intact on transient errors
  } finally {
    libraryFetching = false;
  }
}

function renderSearchData(res) {
  if (!res) return;
  lastSearchData = res;
  el.searchContent.innerHTML = `
        ${(res.songs || []).length ? `<div class="shelf"><h2 class="shelf-title">${escapeHtml(t("search.songs"))}</h2><div class="track-table" id="search-songs">${renderSongRows(res.songs)}</div></div>` : ""}
        ${(res.albums || []).length ? `<div class="shelf"><h2 class="shelf-title">${escapeHtml(t("search.albums"))}</h2><div class="card-grid">${renderCards(res.albums)}</div></div>` : ""}
        ${(res.playlists || []).length ? `<div class="shelf"><h2 class="shelf-title">${escapeHtml(t("search.playlists"))}</h2><div class="card-grid">${renderCards(res.playlists)}</div></div>` : ""}
        ${!(res.songs || []).length && !(res.albums || []).length && !(res.playlists || []).length ? `<div class="skeleton-hint">${escapeHtml(t("search.empty"))}</div>` : ""}
      `;
  bindCardEvents(el.searchContent);
  const sSongs = document.getElementById("search-songs");
  if (sSongs) bindSongEvents(sSongs);
}

// Live Global Search
let searchTimer = null;
el.searchInput.addEventListener("input", () => {
  const term = el.searchInput.value.trim();
  clearTimeout(searchTimer);
  if (!term) return;
  searchTimer = setTimeout(async () => {
    lastSearchTerm = term;
    switchView("search");
    el.searchSub.textContent = t("search.sub", { term });
    el.searchContent.innerHTML = `<div class="skeleton-hint">${escapeHtml(t("search.searching"))}</div>`;
    try {
      const res = await rpc("search", { term, lang: settings.language });
      renderSearchData(res);
    } catch (err) {
      el.searchContent.innerHTML = `<div class="skeleton-hint">${escapeHtml(t("search.failed", { msg: err.message }))}</div>`;
    }
  }, 380);
});

el.searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && el.searchInput.value.trim()) {
    switchView("search");
  }
});

// Karaoke / Synced Lyrics Rendering
let cachedLyricNodes = [];
let cachedWordNodes = [];
let cachedAmbientImg = null;
let lastBakedKey = "";
let rebakeTimer = null;

function bakeAmbientCanvas() {
  const canvas = el.ambientImg;
  if (!canvas || !canvas.getContext || !cachedAmbientImg || !cachedAmbientImg.complete || !cachedAmbientImg.naturalWidth) {
    return;
  }
  const isLight = settings.theme === "light";
  const blurPx = Math.max(6, Math.round((Number(settings.blurStrength || 95) / 95) * 16));
  const key = `${currentArt}|${blurPx}|${isLight ? "L" : "D"}`;
  if (key === lastBakedKey) return;
  lastBakedKey = key;

  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = isLight ? "#eef2fa" : (latestArtworkBgColor || "#10121a");
  ctx.fillRect(0, 0, w, h);
  ctx.filter = isLight
    ? `blur(${blurPx}px) saturate(1.75) brightness(1.16) contrast(0.92)`
    : `blur(${blurPx}px) saturate(2.1) brightness(0.72)`;
  // Slightly overscan draw so blur edge clamping never causes dark vignette borders
  ctx.drawImage(cachedAmbientImg, -14, -14, w + 28, h + 28);
  if (isLight) {
    ctx.filter = "none";
    ctx.fillStyle = "rgba(246, 248, 254, 0.46)";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
  canvas.classList.add("ready");
}

function scheduleAmbientRebake() {
  if (!cachedAmbientImg) return;
  clearTimeout(rebakeTimer);
  rebakeTimer = setTimeout(bakeAmbientCanvas, 60);
}

function renderLyricLines() {
  activeLyricIdx = -1;
  cachedLyricNodes = [];
  cachedWordNodes = [];
  if (!lyricLines.length) {
    el.lyricsScroll.innerHTML = `<div class="lyrics-empty">${escapeHtml(currentSongId ? t("imm.lyricsUnavailable") : t("imm.lyricsEmptyIdle"))}</div>`;
    return;
  }

  const useKaraoke = Boolean(settings.karaokeLyrics);
  el.lyricsScroll.innerHTML = lyricLines
    .map((line, idx) => {
      if (useKaraoke && Array.isArray(line.words) && line.words.length > 0) {
        const spans = line.words
          .map((w, wIdx) => `<span class="lyric-word" data-widx="${wIdx}">${escapeHtml(w.text)}</span>`)
          .join("");
        return `<div class="lyric-line has-words" data-idx="${idx}">${spans}</div>`;
      }
      return `<div class="lyric-line" data-idx="${idx}">${escapeHtml(line.text)}</div>`;
    })
    .join("");

  cachedLyricNodes = Array.from(el.lyricsScroll.querySelectorAll(".lyric-line"));
  cachedWordNodes = cachedLyricNodes.map((node) => Array.from(node.querySelectorAll(".lyric-word")));

  cachedLyricNodes.forEach((node) => {
    node.addEventListener("click", () => {
      const line = lyricLines[Number(node.dataset.idx)];
      if (line && typeof line.start === "number") {
        const targetSec = line.start / 1000;
        lastPosSec = targetSec;
        lastSyncAt = performance.now();
        ignoreRemoteTimeUntil = lastSyncAt + 900;
        renderPlaybackFrame();
        syncDiscordPresence(true);
        rpc("seek", { sec: targetSec }).catch(console.error);
      }
    });
  });
  renderPlaybackFrame();
}

async function fetchLyricsForSong(catalogId) {
  if (!catalogId) {
    lyricLines = [];
    cachedLyricNodes = [];
    cachedWordNodes = [];
    el.lyricsScroll.innerHTML = `<div class="lyrics-empty">${escapeHtml(t("imm.lyricsUnavailable"))}</div>`;
    return;
  }
  if (lyricsCache.has(catalogId)) {
    lyricLines = lyricsCache.get(catalogId) || [];
    renderLyricLines();
    return;
  }
  el.lyricsScroll.innerHTML = `<div class="lyrics-empty">${escapeHtml(t("imm.lyricsLoading"))}</div>`;
  try {
    const res = await rpc("getLyrics", { catalogId });
    const lines = res.lines || [];
    if (lyricsCache.size >= 40) {
      const firstKey = lyricsCache.keys().next().value;
      if (firstKey !== undefined) lyricsCache.delete(firstKey);
    }
    lyricsCache.set(catalogId, lines);
    if (currentCatalogId === catalogId) {
      lyricLines = lines;
      renderLyricLines();
    }
  } catch {
    if (currentCatalogId === catalogId) {
      lyricLines = [];
      cachedLyricNodes = [];
      cachedWordNodes = [];
      el.lyricsScroll.innerHTML = `<div class="lyrics-empty">${escapeHtml(t("imm.lyricsError"))}</div>`;
    }
  }
}

function updateArtwork(url) {
  if (url === currentArt) return;
  currentArt = url;
  lastBakedKey = "";
  const hasUrl = Boolean(url);
  for (const [imgEl, phEl] of [
    [el.dockArtwork, el.dockPlaceholder],
    [el.immArtwork, el.immPlaceholder],
    [el.miniArtwork, el.miniPlaceholder],
  ]) {
    if (hasUrl) {
      imgEl.src = url;
      imgEl.classList.remove("hidden");
      phEl.classList.add("hidden");
    } else {
      imgEl.classList.add("hidden");
      phEl.classList.remove("hidden");
    }
  }
  if (hasUrl) {
    const bgUrl = url.replace(/\/\d+x\d+bb\./, "/160x160bb.");
    const img = new Image();
    img.onload = () => {
      if (currentArt === url) {
        cachedAmbientImg = img;
        bakeAmbientCanvas();
      }
    };
    img.src = bgUrl;
  } else {
    cachedAmbientImg = null;
    el.ambientImg.classList.remove("ready");
  }
}

function syncDiscordPresence(force = false) {
  const enabled = Boolean(settings.discordRpc);
  const clientId = String(settings.discordClientId || "").trim();
  const playing = Boolean(engineState.playing);
  const np = engineState.nowPlaying || null;
  const trackId = np ? String(np.id || np.title || "") : "";

  if (playing || !enabled || !np) {
    discordPauseExpired = false;
    if (discordPauseClearTimer) {
      clearTimeout(discordPauseClearTimer);
      discordPauseClearTimer = null;
    }
  } else {
    if (trackId !== lastDiscordTrackId) {
      discordPauseExpired = false;
      if (discordPauseClearTimer) {
        clearTimeout(discordPauseClearTimer);
        discordPauseClearTimer = null;
      }
    }
    if (!discordPauseExpired && !discordPauseClearTimer) {
      discordPauseClearTimer = setTimeout(() => {
        discordPauseClearTimer = null;
        discordPauseExpired = true;
        syncDiscordPresence(true);
      }, DISCORD_PAUSE_KEEP_MS);
    }
  }
  lastDiscordTrackId = trackId;

  const estPosSec = playing ? lastPosSec + (performance.now() - lastSyncAt) / 1000 : lastPosSec;
  const posSec = Math.max(0, lastDurSec > 0 ? Math.min(estPosSec, lastDurSec) : estPosSec);
  const startEpoch = playing ? Math.round(Date.now() / 1000 - posSec) : 0;
  const showTrack = Boolean(enabled && np && (playing || !discordPauseExpired));
  const key = !enabled
    ? `off|${clientId}`
    : !showTrack
      ? `clear|${clientId}`
      : `${playing ? "play" : "pause"}|${clientId}|${trackId}|${np.title}|${np.artist}`;

  if (!force && key === lastDiscordKey) {
    if (!enabled || !playing || Math.abs(startEpoch - lastDiscordStartSec) <= 3) {
      return;
    }
  }
  lastDiscordKey = key;
  lastDiscordStartSec = startEpoch;

  const rawArt = showTrack && np && np.artwork ? String(np.artwork) : "";
  const artworkUrl = rawArt ? rawArt.replace(/\/\d+x\d+bb\./, "/300x300bb.") : "";

  invoke("update_discord_rpc", {
    enabled,
    clientId,
    playing: Boolean(playing && showTrack),
    title: showTrack ? (np.title || "") : "",
    artist: showTrack ? (np.artist || "") : "",
    album: showTrack ? (np.album || "") : "",
    artworkUrl,
    positionSec: posSec,
    durationSec: lastDurSec || 0,
  }).catch(() => {});
}

let lastAuthSig = "";
let lastNowPlayingMetaSig = "";

// Listen to Engine State Events
listen("engine-state", (event) => {
  const st = event.payload || {};
  if (!st.ready) {
    if (!engineState.ready) {
      el.authLabel.textContent = t("set.auth.loading");
    }
    return;
  }

  const wasPlaying = Boolean(engineState.playing);
  const prevSongId = currentSongId;
  engineState = st;
  if ((st.userName && st.userName !== cachedProfile.name) || (st.userAvatar && st.userAvatar !== cachedProfile.avatar)) {
    cachedProfile = {
      name: st.userName || cachedProfile.name || "",
      avatar: st.userAvatar || cachedProfile.avatar || "",
    };
    writeLocalJson("nyx_cache_profile", cachedProfile);
  }
  const authSig = `${st.authorized ? 1 : 0}|${lastAppliedLang}`;
  if (authSig !== lastAuthSig) {
    lastAuthSig = authSig;
    el.authDot.classList.toggle("ok", Boolean(st.authorized));
    el.authLabel.textContent = st.authorized ? t("set.auth.connected") : t("set.auth.signInPrompt");
    if (el.btnLogout) el.btnLogout.classList.toggle("hidden", !st.authorized);
  }
  renderUserPill();

  if (!homeLiveLoaded || (st.authorized && !homeLoadedAuthed)) {
    loadHomeAndCharts(true);
  }
  if (st.authorized) {
    if (awaitingLogin) {
      awaitingLogin = false;
      invoke("set_engine_visible", { visible: false }).catch(() => {});
      homeLoadedAuthed = false;
      libraryLiveLoaded = false;
      loadHomeAndCharts(true);
    }
    if (!libraryLiveLoaded) loadLibrary(true);
  }

  const playing = Boolean(st.playing);
  document.body.classList.toggle("is-playing", playing);
  el.iconPlay.classList.toggle("hidden", playing);
  el.iconPause.classList.toggle("hidden", !playing);
  el.miniIconPlay.classList.toggle("hidden", playing);
  el.miniIconPause.classList.toggle("hidden", !playing);
  el.btnShuffle.classList.toggle("active", Boolean(st.shuffleMode));
  el.btnRepeat.classList.toggle("active", Boolean(st.repeatMode));

  const nowPerf = performance.now();
  const incomingPos = Number(st.positionSec || 0);
  const incomingDur = Number(st.durationSec || 0);
  const incomingSongId = st.nowPlaying ? st.nowPlaying.id : "";
  const isSameSong = Boolean(incomingSongId && incomingSongId === prevSongId);

  lastDurSec = incomingDur;

  if (!isSameSong || !playing || !wasPlaying) {
    lastPosSec = incomingPos;
    lastSyncAt = nowPerf;
  } else if (nowPerf >= ignoreRemoteTimeUntil) {
    const estPos = lastPosSec + (nowPerf - lastSyncAt) / 1000;
    const drift = incomingPos - estPos;
    // Prevent coarse MusicKit currentPlaybackTime updates from pulling the lyric clock backwards
    if (Math.abs(drift) > 1.25) {
      lastPosSec = incomingPos;
      lastSyncAt = nowPerf;
    } else if (drift > 0.08) {
      lastPosSec = estPos + drift * 0.35;
      lastSyncAt = nowPerf;
    }
  }

  if (typeof st.volume === "number" && document.activeElement !== el.volumeSlider) {
    el.volumeSlider.value = String(Math.round(st.volume * 100));
  }

  const np = st.nowPlaying;
  if (immActionsEl) immActionsEl.classList.toggle("hidden", !np);
  const npTitle = np ? (np.title || t("common.unknownSong")) : "";
  const npArtist = np ? (np.artist || "—") : "";
  const npAlbum = np ? (np.album || "") : "";
  const metaSig = np ? `${np.id || ""}|${npTitle}|${npArtist}|${npAlbum}` : "";
  if (metaSig !== lastNowPlayingMetaSig) {
    lastNowPlayingMetaSig = metaSig;
    if (el.titlebarNowPlaying && el.titlebarSongTitle) {
      if (np) {
        el.titlebarSongTitle.textContent = npTitle;
        el.titlebarNowPlaying.classList.add("visible");
      } else {
        el.titlebarSongTitle.textContent = "";
        el.titlebarNowPlaying.classList.remove("visible");
      }
    }
    if (np) {
      el.dockTitle.textContent = npTitle;
      el.dockArtist.textContent = npArtist;
      el.immTitle.textContent = npTitle;
      el.immArtist.textContent = npArtist;
      el.immAlbum.textContent = npAlbum;
      el.miniTitle.textContent = npTitle;
      el.miniArtist.textContent = npArtist;
    }
  }
  if (np) {
    if (np.bgColor && np.bgColor !== latestArtworkBgColor) {
      latestArtworkBgColor = np.bgColor;
      applyAccentColor();
    }
    updateArtwork(np.artwork || "");

    if (np.id !== currentSongId) {
      currentSongId = np.id;
      currentCatalogId = np.catalogId || np.id;
      recordRecentTrack(np);
      syncPlayingTrackHighlight();
      fetchLyricsForSong(currentCatalogId);
    }
  }

  if (Array.isArray(st.queue)) {
    const qSig = st.queue.map((q) => `${q.id}:${q.isCurrent ? 1 : 0}`).join(",");
    if (qSig !== lastQueueSig) {
      lastQueueSig = qSig;
      el.queueScroll.innerHTML = st.queue
        .map(
          (q) => `
        <div class="track-row ${q.isCurrent ? "playing" : ""}" data-song-id="${escapeHtml(q.id)}" data-catalog-id="${escapeHtml(q.catalogId || "")}" data-song-type="${escapeHtml(q.kind || "songs")}" data-title="${escapeHtml(q.title)}" data-artist="${escapeHtml(q.artist)}" data-q-idx="${q.queueIndex}">
          <img class="track-row-art" src="${escapeHtml(q.artworkSmall || q.artwork)}" alt="" />
          <div class="track-row-main">
            <div class="track-row-title">${escapeHtml(q.title)}</div>
            <div class="track-row-artist">${escapeHtml(q.artist)}</div>
          </div>
          <div class="track-row-album">${escapeHtml(q.album)}</div>
          <div class="track-row-dur">${formatTimeSec((q.durationMs || 0) / 1000)}</div>
          <button type="button" class="track-row-more" title="更多操作">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
          </button>
        </div>`
        )
        .join("");
      el.queueScroll.querySelectorAll(".track-row").forEach((row) => {
        const moreBtn = row.querySelector(".track-row-more");
        if (moreBtn) {
          moreBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const rect = moreBtn.getBoundingClientRect();
            openItemActionMenu(getRowTrackData(row), rect.right - 180, rect.bottom + 6, false);
          });
        }
        row.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          openItemActionMenu(getRowTrackData(row), e.clientX, e.clientY, false);
        });
        row.addEventListener("click", () => {
          rpc("playQueueIndex", { index: Number(row.dataset.qIdx) }).catch(console.error);
        });
      });
    }
  }
  renderPlaybackFrame();
  syncDiscordPresence(false);
  ensureTickLoop();
});

// Smart Playback & Word-Level Karaoke Sync Loop (sleeps automatically when paused or minimized)
let tickRafId = 0;
let lastFrameAt = 0;
let lastRenderedCurText = "";
let lastRenderedTotText = "";
let lastRenderedSliderVal = "";
let lastRenderedMiniPct = "";
let lyricTargetScrollTop = 0;
let lyricSmoothScrollPos = 0;
let lyricScrollActive = false;
let userManualLyricScrollUntil = 0;
let scrollSettleUntil = 0;

if (el.lyricsScroll) {
  const pauseAutoScroll = () => {
    userManualLyricScrollUntil = performance.now() + 2500;
    lyricScrollActive = false;
  };
  el.lyricsScroll.addEventListener("wheel", pauseAutoScroll, { passive: true });
  el.lyricsScroll.addEventListener("pointerdown", pauseAutoScroll, { passive: true });
}

function updateLyricScrollTarget(instant = false) {
  if (!el.lyricsScroll || activeLyricIdx < 0 || !cachedLyricNodes[activeLyricIdx]) return;
  const container = el.lyricsScroll;
  const node = cachedLyricNodes[activeLyricIdx];
  const target = Math.max(0, node.offsetTop - container.clientHeight * 0.44 + node.offsetHeight * 0.5);
  lyricTargetScrollTop = target;
  if (instant) {
    lyricSmoothScrollPos = target;
    container.scrollTop = target;
    lyricScrollActive = false;
  } else if (performance.now() >= userManualLyricScrollUntil) {
    lyricSmoothScrollPos = container.scrollTop;
    lyricScrollActive = true;
    scrollSettleUntil = performance.now() + 850;
    ensureTickLoop();
  }
}

function renderPlaybackFrame() {
  const now = performance.now();
  const dt = lastFrameAt ? Math.min(0.05, Math.max(0.001, (now - lastFrameAt) / 1000)) : 0.016;
  lastFrameAt = now;
  const estSec = engineState.playing ? lastPosSec + (now - lastSyncAt) / 1000 : lastPosSec;
  const clamped = lastDurSec > 0 ? Math.min(estSec, lastDurSec) : estSec;

  if (!isScrubbing) {
    const ratio = lastDurSec > 0 ? Math.min(1, clamped / lastDurSec) : 0;
    if (isMiniMode) {
      const miniPct = `${(ratio * 100).toFixed(1)}%`;
      if (miniPct !== lastRenderedMiniPct) {
        lastRenderedMiniPct = miniPct;
        el.miniProgressFill.style.width = miniPct;
      }
    } else {
      const curStr = formatTimeSec(clamped);
      if (curStr !== lastRenderedCurText) {
        lastRenderedCurText = curStr;
        el.timeCur.textContent = curStr;
      }
      const totStr = formatTimeSec(lastDurSec);
      if (totStr !== lastRenderedTotText) {
        lastRenderedTotText = totStr;
        el.timeTot.textContent = totStr;
      }
      const sliderVal = String(Math.round(ratio * 1000));
      if (sliderVal !== lastRenderedSliderVal) {
        lastRenderedSliderVal = sliderVal;
        el.progressSlider.value = sliderVal;
      }
    }
  }

  if (immersiveOpen && lyricLines.length && cachedLyricNodes.length && !isMiniMode) {
    const posMs = clamped * 1000;
    let nextIdx = -1;
    for (let i = 0; i < lyricLines.length; i++) {
      const start = lyricLines[i].start;
      if (typeof start === "number" && start <= posMs + 140) {
        nextIdx = i;
      } else if (typeof start === "number" && start > posMs + 140) {
        break;
      }
    }

    if (nextIdx !== activeLyricIdx) {
      const prevIdx = activeLyricIdx;
      activeLyricIdx = nextIdx;
      for (let idx = 0; idx < cachedLyricNodes.length; idx++) {
        const node = cachedLyricNodes[idx];
        const isActive = idx === activeLyricIdx;
        const isNear = activeLyricIdx >= 0 && Math.abs(idx - activeLyricIdx) === 1;
        node.classList.toggle("active", isActive);
        node.classList.toggle("near-active", isNear);
        // Reset previous line word progress cleanly when moving to next line
        if (idx === prevIdx && cachedWordNodes[idx]) {
          for (const wNode of cachedWordNodes[idx]) {
            const resetVal = idx < activeLyricIdx ? "114%" : "-14%";
            if (wNode._prog !== resetVal) {
              wNode._prog = resetVal;
              wNode.style.setProperty("--wprog", resetVal);
            }
            wNode._state = idx < activeLyricIdx ? 2 : 0;
            wNode.classList.toggle("word-done", idx < activeLyricIdx);
            wNode.classList.remove("word-active");
          }
        }
      }
      updateLyricScrollTarget(prevIdx === -1);
    }

    // Damped spring scroll interpolation at full monitor refresh rate
    if (lyricScrollActive && now >= userManualLyricScrollUntil) {
      const diff = lyricTargetScrollTop - lyricSmoothScrollPos;
      if (Math.abs(diff) < 0.6) {
        el.lyricsScroll.scrollTop = lyricTargetScrollTop;
        lyricScrollActive = false;
      } else {
        const preset = getAnimPreset();
        const springRate = preset === "fast" ? 13.5 : preset === "full" ? 6.4 : 8.2;
        const step = 1 - Math.exp(-dt * springRate);
        lyricSmoothScrollPos += diff * step;
        el.lyricsScroll.scrollTop = lyricSmoothScrollPos;
      }
    }

    // Animate feathered word-by-word karaoke sweep inside active line
    if (settings.karaokeLyrics && activeLyricIdx >= 0) {
      const activeLineData = lyricLines[activeLyricIdx];
      const wordNodes = cachedWordNodes[activeLyricIdx];
      if (activeLineData && Array.isArray(activeLineData.words) && wordNodes) {
        for (let wIdx = 0; wIdx < activeLineData.words.length; wIdx++) {
          const wNode = wordNodes[wIdx];
          if (!wNode) continue;
          const w = activeLineData.words[wIdx];
          const ws = w.start ?? 0;
          const we = w.end ?? ws + 250;
          let prog;
          let state;
          if (posMs >= we) {
            prog = "114%";
            state = 2;
          } else if (posMs >= ws) {
            const p = -14 + Math.max(0, Math.min(1, (posMs - ws) / Math.max(40, we - ws))) * 128;
            prog = `${p.toFixed(1)}%`;
            state = 1;
          } else {
            prog = "-14%";
            state = 0;
          }
          if (wNode._prog !== prog) {
            wNode._prog = prog;
            wNode.style.setProperty("--wprog", prog);
          }
          if (wNode._state !== state) {
            wNode._state = state;
            wNode.classList.toggle("word-done", state === 2);
            wNode.classList.toggle("word-active", state === 1);
          }
        }
      }
    }
  }
}

// Adaptive Playback & Karaoke Sync Loop (60fps only for active immersive lyrics, 4Hz for scrubber, 0Hz when paused/hidden)
let tickIntervalId = 0;

function needHighFpsLoop(now) {
  return !document.hidden && (
    (immersiveOpen && lyricLines.length > 0 && engineState.playing && !isMiniMode) ||
    (lyricScrollActive && now < scrollSettleUntil)
  );
}

function stopTickTimers() {
  if (tickRafId) {
    cancelAnimationFrame(tickRafId);
    tickRafId = 0;
  }
  if (tickIntervalId) {
    clearInterval(tickIntervalId);
    tickIntervalId = 0;
  }
}

function tick() {
  tickRafId = 0;
  const now = performance.now();
  if (!needHighFpsLoop(now)) {
    ensureTickLoop();
    return;
  }
  renderPlaybackFrame();
  tickRafId = requestAnimationFrame(tick);
}

function ensureTickLoop() {
  const now = performance.now();
  if (document.hidden) {
    stopTickTimers();
    return;
  }
  if (needHighFpsLoop(now)) {
    if (tickIntervalId) {
      clearInterval(tickIntervalId);
      tickIntervalId = 0;
    }
    if (!tickRafId) {
      lastFrameAt = now;
      tickRafId = requestAnimationFrame(tick);
    }
  } else if (engineState.playing) {
    if (tickRafId) {
      cancelAnimationFrame(tickRafId);
      tickRafId = 0;
    }
    if (!tickIntervalId) {
      lastFrameAt = now;
      tickIntervalId = setInterval(() => {
        if (document.hidden || !engineState.playing) {
          ensureTickLoop();
          return;
        }
        renderPlaybackFrame();
      }, 250);
    }
  } else {
    stopTickTimers();
  }
}

document.addEventListener("visibilitychange", () => {
  document.body.classList.toggle("page-hidden", document.hidden);
  if (!document.hidden) renderPlaybackFrame();
  ensureTickLoop();
});

// Auto-Updater State & Actions
let currentAppVersion = "0.2.2";
let availableUpdate = null;
let updateBannerDismissed = false;
let updaterUiState = { stage: "idle", version: "", pct: null, downloaded: 0, error: "" };

function renderUpdateStatus() {
  if (el.appVersionBadge) {
    el.appVersionBadge.textContent = `v${currentAppVersion}`;
  }
  const st = updaterUiState;
  const isChecking = st.stage === "checking";
  const isDownloading = st.stage === "downloading";
  const isInstalling = st.stage === "installing";
  const isBusy = isChecking || isDownloading || isInstalling;

  if (el.btnCheckUpdate) {
    el.btnCheckUpdate.disabled = isBusy;
    el.btnCheckUpdate.textContent = isChecking ? t("set.checkingBtn") : t("set.checkUpdateBtn");
  }
  if (el.btnInstallUpdate) {
    el.btnInstallUpdate.classList.toggle("hidden", !availableUpdate || isBusy);
    el.btnInstallUpdate.disabled = isBusy;
    el.btnInstallUpdate.textContent = t("set.installUpdateBtn");
  }
  if (el.btnBannerInstall) {
    el.btnBannerInstall.disabled = isDownloading || isInstalling;
    el.btnBannerInstall.textContent = isDownloading && st.pct !== null
      ? `${st.pct}%`
      : isInstalling
        ? "..."
        : t("update.bannerInstall");
  }
  if (el.updateBanner) {
    const showBanner = Boolean(availableUpdate) && !updateBannerDismissed;
    el.updateBanner.classList.toggle("hidden", !showBanner);
    if (showBanner && el.updateBannerText && availableUpdate) {
      el.updateBannerText.textContent = t("update.bannerText", { version: availableUpdate.version });
    }
  }
  if (el.updateProgressWrap && el.updateProgressFill) {
    const showProg = isDownloading || isInstalling;
    el.updateProgressWrap.classList.toggle("hidden", !showProg);
    if (isInstalling) {
      el.updateProgressFill.style.width = "100%";
    } else if (isDownloading) {
      el.updateProgressFill.style.width = st.pct !== null ? `${st.pct}%` : "45%";
    } else {
      el.updateProgressFill.style.width = "0%";
    }
  }
  if (el.updateStatusDesc) {
    let msg = t("set.updateStatus.idle");
    if (st.stage === "checking") msg = t("set.updateStatus.checking");
    else if (st.stage === "upToDate") msg = t("set.updateStatus.upToDate", { version: currentAppVersion });
    else if (st.stage === "available") msg = t("set.updateStatus.available", { version: st.version });
    else if (st.stage === "downloading") {
      msg = st.pct !== null
        ? t("set.updateStatus.downloading", { pct: st.pct })
        : t("set.updateStatus.downloadingBytes", { mb: (st.downloaded / (1024 * 1024)).toFixed(1) });
    } else if (st.stage === "installing") msg = t("set.updateStatus.installing");
    else if (st.stage === "error") msg = t("set.updateStatus.error", { msg: st.error });
    el.updateStatusDesc.textContent = msg;
  }
}

async function runUpdateCheck(silent = false) {
  if (updaterUiState.stage === "checking" || updaterUiState.stage === "downloading" || updaterUiState.stage === "installing") return;
  updaterUiState = { stage: "checking", version: "", pct: null, downloaded: 0, error: "" };
  renderUpdateStatus();
  try {
    const info = await invoke("check_for_update");
    if (info && info.version) {
      availableUpdate = info;
      updateBannerDismissed = false;
      updaterUiState = { stage: "available", version: info.version, pct: null, downloaded: 0, error: "" };
      renderUpdateStatus();
      showToast(t("toast.updateAvailable", { version: info.version }));
    } else {
      availableUpdate = null;
      updaterUiState = { stage: "upToDate", version: currentAppVersion, pct: null, downloaded: 0, error: "" };
      renderUpdateStatus();
      if (!silent) showToast(t("toast.upToDate", { version: currentAppVersion }));
    }
  } catch (err) {
    const msg = err && err.message ? err.message : String(err || "Unknown error");
    if (silent) {
      updaterUiState = { stage: "idle", version: "", pct: null, downloaded: 0, error: "" };
      renderUpdateStatus();
    } else {
      updaterUiState = { stage: "error", version: "", pct: null, downloaded: 0, error: msg };
      renderUpdateStatus();
      showToast(t("toast.updateFailed", { msg }), true);
    }
  }
}

async function runInstallUpdate() {
  if (updaterUiState.stage === "downloading" || updaterUiState.stage === "installing") return;
  updaterUiState = { stage: "downloading", version: availableUpdate?.version || "", pct: 0, downloaded: 0, error: "" };
  renderUpdateStatus();
  try {
    await invoke("install_update");
  } catch (err) {
    const msg = err && err.message ? err.message : String(err || "Unknown error");
    updaterUiState = { stage: "error", version: "", pct: null, downloaded: 0, error: msg };
    renderUpdateStatus();
    showToast(t("toast.updateFailed", { msg }), true);
  }
}

listen("nyx-update-progress", (event) => {
  const p = event.payload || {};
  if (p.stage === "installing") {
    updaterUiState = { ...updaterUiState, stage: "installing", pct: 100 };
    renderUpdateStatus();
  } else if (p.stage === "downloading") {
    const downloaded = Number(p.downloaded || 0);
    const total = typeof p.total === "number" && p.total > 0 ? p.total : null;
    const pct = total ? Math.max(0, Math.min(100, Math.round((downloaded / total) * 100))) : null;
    updaterUiState = { ...updaterUiState, stage: "downloading", downloaded, pct };
    renderUpdateStatus();
  }
});

if (el.btnCheckUpdate) el.btnCheckUpdate.addEventListener("click", () => runUpdateCheck(false));
if (el.btnInstallUpdate) el.btnInstallUpdate.addEventListener("click", () => runInstallUpdate());
if (el.btnBannerInstall) el.btnBannerInstall.addEventListener("click", () => runInstallUpdate());
if (el.btnBannerDismiss) {
  el.btnBannerDismiss.addEventListener("click", () => {
    updateBannerDismissed = true;
    renderUpdateStatus();
  });
}

applySettings();
hydrateBootCaches();
renderUserPill();
renderPlaybackFrame();
ensureTickLoop();
invoke("get_app_version")
  .then((ver) => {
    if (ver) {
      currentAppVersion = String(ver);
      renderUpdateStatus();
    }
  })
  .catch(() => {});
setTimeout(() => {
  if (settings.autoCheckUpdate) {
    runUpdateCheck(true);
  }
}, 5000);
setTimeout(() => {
  rpc("getState").catch((err) => {
    if (!engineState.ready) {
      el.authLabel.textContent = t("set.auth.connecting");
      if (!hasCachedHome) {
        el.homeContent.innerHTML = `<div class="skeleton-hint">${escapeHtml(t("home.engineNotReady", { msg: err.message }))}</div>`;
      }
    }
  });
}, 3000);
