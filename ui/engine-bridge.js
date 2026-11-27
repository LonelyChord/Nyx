// Injected into the hidden https://music.apple.com WebView to expose MusicKit JS cleanly to the custom UI.

(function () {
  if (window.top !== window.self) return;
  if (window.__AM_ENGINE_BRIDGE__) return;

  function emitToHost(kind, id, data) {
    try {
      const invoker =
        (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) ||
        (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke);
      if (!invoker) return;

      const eventName = kind === "rpc_result" ? "engine-rpc-result" : "engine-state";
      const payload = kind === "rpc_result" ? { id, data } : data;
      Promise.resolve(invoker("plugin:event|emit", { event: eventName, payload })).catch((err) => {
        console.error("[AM Bridge] emit rejected:", err);
      });
    } catch (err) {
      console.error("[AM Bridge] emit error:", err);
    }
  }

  function getMK() {
    try {
      if (window.MusicKit && typeof window.MusicKit.getInstance === "function") {
        return window.MusicKit.getInstance();
      }
    } catch (_) {}
    return null;
  }

  function formatArtwork(artworkObj, size = 600) {
    if (!artworkObj || !artworkObj.url) return "";
    return String(artworkObj.url)
      .replace("{w}", String(size))
      .replace("{h}", String(size))
      .replace("{f}", "webp");
  }

  function serializeMediaItem(item) {
    if (!item) return null;
    const attr = item.attributes || {};
    return {
      id: item.id || "",
      catalogId: (attr.playParams && (attr.playParams.catalogId || attr.playParams.id)) || item.id || "",
      kind: item.type || "songs",
      title: attr.name || item.title || "",
      artist: attr.artistName || "",
      album: attr.albumName || "",
      durationMs: attr.durationInMillis || 0,
      artwork: formatArtwork(attr.artwork, 520),
      artworkSmall: formatArtwork(attr.artwork, 120),
      bgColor: attr.artwork && attr.artwork.bgColor ? `#${attr.artwork.bgColor}` : "",
    };
  }

  let lastQueueSig = "";
  let activeCollectionKey = "";
  let cachedUserName = "";
  let cachedUserAvatar = "";
  let lastProfileScanAt = 0;
  let profileScanCount = 0;

  function walkDeep(root, fn, maxNodes = 1600) {
    let count = 0;
    const stack = [root];
    while (stack.length && count < maxNodes) {
      const node = stack.pop();
      if (!node) continue;
      count++;
      fn(node);
      if (node.shadowRoot) {
        stack.push(node.shadowRoot);
      }
      const children = node.children || node.childNodes;
      if (children) {
        for (let i = children.length - 1; i >= 0; i--) {
          stack.push(children[i]);
        }
      }
    }
  }

  function detectUserProfile() {
    if (cachedUserName && cachedUserAvatar) {
      return { name: cachedUserName, avatar: cachedUserAvatar };
    }
    const now = Date.now();
    if (profileScanCount >= 4 || now - lastProfileScanAt < 8000) {
      return { name: cachedUserName, avatar: cachedUserAvatar };
    }
    lastProfileScanAt = now;
    profileScanCount++;
    try {
      walkDeep(document.body || document.documentElement, (el) => {
        if (!el || el.nodeType !== 1) return;
        const cls = typeof el.className === "string" ? el.className : "";
        const testId = el.getAttribute ? (el.getAttribute("data-testid") || "") : "";
        const aria = el.getAttribute ? (el.getAttribute("aria-label") || "") : "";

        const looksAccount =
          /account|profile|user|auth/i.test(cls) ||
          /account|profile|user/i.test(testId) ||
          /帳號|帳戶|Account|Profile/i.test(aria);

        if (looksAccount) {
          const txt = (el.textContent || "").trim();
          if (
            txt &&
            txt.length >= 1 &&
            txt.length <= 28 &&
            !/登入|Sign In|Apple Music|在「音樂」中打開|Open in Music/i.test(txt)
          ) {
            if (!cachedUserName) cachedUserName = txt;
          }
          if (el.tagName === "IMG" && el.src && el.src.startsWith("http") && !cachedUserAvatar) {
            cachedUserAvatar = el.src;
          } else if (el.querySelector) {
            const img = el.querySelector("img");
            if (img && img.src && img.src.startsWith("http") && !cachedUserAvatar) {
              cachedUserAvatar = img.src;
            }
          }
        }
      });
    } catch (_) {}
    return { name: cachedUserName, avatar: cachedUserAvatar };
  }

  function pushState(forceQueue = false) {
    const mk = getMK();
    if (!mk) {
      emitToHost("state", null, { ready: false, authorized: false });
      return;
    }

    const nowItem = serializeMediaItem(mk.nowPlayingItem);
    let queuePayload;
    try {
      const q = mk.queue && mk.queue.items ? mk.queue.items : [];
      const qIdx = typeof mk.queue.position === "number" ? mk.queue.position : -1;
      const limit = Math.min(q.length, 60);
      const sigParts = [];
      for (let i = 0; i < limit; i++) {
        sigParts.push(`${q[i]?.id || ""}:${i === qIdx ? 1 : 0}`);
      }
      const sig = sigParts.join(",");
      if (forceQueue || sig !== lastQueueSig) {
        lastQueueSig = sig;
        queuePayload = [];
        for (let i = 0; i < limit; i++) {
          const s = serializeMediaItem(q[i]);
          if (s) {
            s.queueIndex = i;
            s.isCurrent = i === qIdx;
            queuePayload.push(s);
          }
        }
      }
    } catch (_) {}

    const profile = detectUserProfile();
    const payload = {
      ready: true,
      authorized: Boolean(mk.isAuthorized),
      userName: profile.name,
      userAvatar: profile.avatar,
      storefront: mk.storefrontId || "tw",
      playing: Boolean(mk.isPlaying),
      positionSec: Number(mk.currentPlaybackTime || 0),
      durationSec: Number(mk.currentPlaybackDuration || 0),
      volume: typeof mk.volume === "number" ? mk.volume : 1,
      shuffleMode: mk.shuffleMode || 0,
      repeatMode: mk.repeatMode || 0,
      nowPlaying: nowItem,
    };
    if (queuePayload !== undefined) {
      payload.queue = queuePayload;
    }
    emitToHost("state", null, payload);
  }

  function parseTtmlLyrics(ttmlText) {
    if (!ttmlText || typeof ttmlText !== "string") return [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(ttmlText, "application/xml");
      const ps = Array.from(doc.querySelectorAll("p"));
      const toMs = (str) => {
        if (!str) return null;
        const clean = str.trim();
        if (clean.endsWith("ms")) {
          const v = parseFloat(clean);
          return Number.isNaN(v) ? null : Math.round(v);
        }
        if (clean.endsWith("s")) {
          const v = parseFloat(clean);
          return Number.isNaN(v) ? null : Math.round(v * 1000);
        }
        const parts = clean.split(":").map(Number);
        if (parts.some(Number.isNaN)) return null;
        if (parts.length === 3) return Math.round((parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000);
        if (parts.length === 2) return Math.round((parts[0] * 60 + parts[1]) * 1000);
        if (parts.length === 1) return Math.round(parts[0] * 1000);
        return null;
      };

      const collectTimedWords = (container) => {
        const words = [];
        let text = "";
        for (const node of Array.from(container.childNodes)) {
          if (node.nodeType === 3) {
            const t = node.textContent || "";
            if (!t) continue;
            text += t;
            if (words.length) {
              words[words.length - 1].text += t;
            }
          } else if (node.nodeType === 1) {
            const role = node.getAttribute("ttm:role") || node.getAttribute("role") || "";
            if (role === "x-translation" || role === "x-roman") continue;
            const nestedSpans = node.querySelectorAll ? Array.from(node.querySelectorAll("span[begin]")) : [];
            if (node.hasAttribute && node.hasAttribute("begin") && nestedSpans.length === 0) {
              const ws = toMs(node.getAttribute("begin"));
              const we = toMs(node.getAttribute("end"));
              const wt = node.textContent || "";
              text += wt;
              if (wt) words.push({ start: ws, end: we, text: wt });
            } else if (nestedSpans.length > 0) {
              const inner = collectTimedWords(node);
              text += inner.text;
              words.push(...inner.words);
            } else {
              const wt = node.textContent || "";
              text += wt;
              if (words.length && wt) {
                words[words.length - 1].text += wt;
              }
            }
          }
        }
        return { text, words };
      };

      let primaryAgent = "";
      return ps
        .map((p) => {
          const begin = toMs(p.getAttribute("begin"));
          const end = toMs(p.getAttribute("end"));
          const agent = p.getAttribute("ttm:agent") || p.getAttribute("agent") || "";
          if (agent && !primaryAgent) primaryAgent = agent;
          const isAltVoice = Boolean(agent && primaryAgent && agent !== primaryAgent && agent !== "v1000");

          const words = [];
          const bgWords = [];
          let lineText = "";
          let bgText = "";

          for (const node of Array.from(p.childNodes)) {
            if (node.nodeType === 3) {
              const t = node.textContent || "";
              if (!t) continue;
              lineText += t;
              if (words.length) {
                words[words.length - 1].text += t;
              }
            } else if (node.nodeType === 1) {
              const role = node.getAttribute("ttm:role") || node.getAttribute("role") || "";
              if (role === "x-translation" || role === "x-roman") continue;
              if (role === "x-bg") {
                const bg = collectTimedWords(node);
                const cleanBg = bg.text.trim();
                if (cleanBg) {
                  bgText = bgText ? `${bgText} ${cleanBg}` : cleanBg;
                  if (bg.words.length) bgWords.push(...bg.words);
                }
                continue;
              }
              const spans = node.querySelectorAll ? Array.from(node.querySelectorAll("span[begin]")) : [];
              if (node.hasAttribute && node.hasAttribute("begin") && spans.length === 0) {
                const ws = toMs(node.getAttribute("begin"));
                const we = toMs(node.getAttribute("end"));
                const wt = node.textContent || "";
                lineText += wt;
                if (wt) words.push({ start: ws, end: we, text: wt });
              } else if (spans.length > 0) {
                const inner = collectTimedWords(node);
                lineText += inner.text;
                words.push(...inner.words);
              } else {
                const wt = node.textContent || "";
                lineText += wt;
                if (words.length && wt) {
                  words[words.length - 1].text += wt;
                }
              }
            }
          }

          const cleanText = lineText.trim();
          const cleanBgText = bgText.trim();
          if (!cleanText && !cleanBgText) return null;
          return {
            start: begin,
            end,
            text: cleanText || cleanBgText,
            words: words.length > 0 ? words : null,
            bgText: cleanText && cleanBgText ? cleanBgText : "",
            bgWords: cleanText && bgWords.length > 0 ? bgWords : null,
            isAltVoice,
          };
        })
        .filter(Boolean)
        .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    } catch (_) {
      return [];
    }
  }

  async function apiGet(mk, path, query, fetchOptions) {
    const res = fetchOptions
      ? await mk.api.music(path, query || {}, fetchOptions)
      : await mk.api.music(path, query || {});
    return res && res.data ? res.data : res;
  }

  function mapApiLang(lang) {
    if (lang === "zh-CN") return "zh-Hans-CN";
    if (lang === "en") return "en-US";
    if (lang === "ja") return "ja-JP";
    if (lang === "zh-TW") return "zh-Hant-TW";
    return "";
  }

  async function apiMutate(mk, method, path, query, body) {
    if (!mk.isAuthorized) {
      throw new Error("請先登入 Apple Music 帳號");
    }
    const fetchOptions = {
      method,
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    };
    if (body !== undefined) {
      fetchOptions.body = JSON.stringify(body);
    }

    if (mk.api && typeof mk.api.music === "function") {
      try {
        const res = await mk.api.music(path, query || {}, fetchOptions);
        const status = res && res.response && res.response.status;
        // Guard against any MusicKit build downgrading a POST mutation to GET 200
        if (method === "POST" && path.endsWith("/tracks") && status === 200 && Array.isArray(res.data)) {
          throw new Error("Unexpected GET response for playlist track mutation");
        }
        return res && res.data !== undefined ? res.data : res;
      } catch (e) {
        if (e && (e.status || (e.message && /40\d|42\d|50\d|unauthoriz|forbidden/i.test(e.message)))) {
          throw e;
        }
      }
    }

    const devTok = mk.developerToken || "";
    const userTok = mk.musicUserToken || "";
    if (!devTok || !userTok) {
      throw new Error("目前登入狀態無法執行寫入操作");
    }
    const qs = query && Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : "";
    const resp = await fetch(`https://amp-api.music.apple.com${path}${qs}`, {
      method,
      credentials: "include",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${devTok}`,
        "Music-User-Token": userTok,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) {
      throw new Error(`Apple Music API 請求失敗 (${resp.status})`);
    }
    if (resp.status === 204 || resp.status === 202) return {};
    return resp.json().catch(() => ({}));
  }

  function buildQueueDescriptor(kind, targetId) {
    if (kind === "albums" || kind === "album" || kind === "library-albums") {
      return { album: targetId };
    }
    if (kind === "playlists" || kind === "playlist" || kind === "library-playlists") {
      return { playlist: targetId };
    }
    if (kind === "stations" || kind === "station") {
      return { station: targetId };
    }
    return { song: targetId };
  }

  function itemMatchesTrack(it, wantedId, wantedCat, wantedTitle, wantedArtist) {
    if (!it) return false;
    const attr = it.attributes || {};
    const pp = attr.playParams || {};
    const ids = [it.id, pp.id, pp.catalogId].filter(Boolean).map(String);
    if ((wantedId && ids.includes(wantedId)) || (wantedCat && ids.includes(wantedCat))) {
      return true;
    }
    if (wantedTitle) {
      const itTitle = String(attr.name || it.title || "").trim().toLowerCase();
      if (itTitle && itTitle === wantedTitle) {
        if (!wantedArtist) return true;
        const itArtist = String(attr.artistName || "").trim().toLowerCase();
        if (itArtist === wantedArtist) return true;
      }
    }
    return false;
  }

  function findTrackIndex(items, wantedId, wantedCat, wantedTitle, wantedArtist) {
    if (!Array.isArray(items) || !items.length) return -1;
    if (wantedId || wantedCat) {
      const byId = items.findIndex((it) => itemMatchesTrack(it, wantedId, wantedCat, "", ""));
      if (byId >= 0) return byId;
    }
    if (wantedTitle) {
      return items.findIndex((it) => itemMatchesTrack(it, "", "", wantedTitle, wantedArtist));
    }
    return -1;
  }

  function stripSimpleHtml(str) {
    return String(str || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  }

  function normalizeCollection(items, defaultType) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
      const attr = item.attributes || {};
      const type = item.type || defaultType || "albums";
      const editorialShort = attr.editorialNotes ? (attr.editorialNotes.short || attr.editorialNotes.tagline || "") : "";
      return {
        id: item.id || "",
        type,
        name: attr.name || "",
        subtitle: attr.artistName || attr.curatorName || (type === "stations" ? stripSimpleHtml(editorialShort) : ""),
        artwork: formatArtwork(attr.artwork, 320),
        trackCount: attr.trackCount || 0,
        playParams: attr.playParams || null,
      };
    });
  }

  function normalizeArtists(items) {
    if (!Array.isArray(items)) return [];
    const genericGenres = new Set(["Music", "音樂", "音乐", "ミュージック"]);
    return items.map((item) => {
      const attr = item.attributes || {};
      const genres = Array.isArray(attr.genreNames) ? attr.genreNames.filter((g) => g && !genericGenres.has(g)) : [];
      return {
        id: item.id || "",
        type: "artists",
        name: attr.name || "",
        subtitle: genres[0] || "",
        artwork: formatArtwork(attr.artwork, 320),
      };
    });
  }

  function normalizeSongs(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => serializeMediaItem(item)).filter(Boolean);
  }

  async function handleRpc({ id, method, params }) {
    const mk = getMK();
    try {
      if (method === "getState") {
        pushState(true);
        emitToHost("rpc_result", id, { ok: true });
        return;
      }

      if (!mk) throw new Error("MusicKit 尚未初始化完成");

      const sf = mk.storefrontId || "tw";

      switch (method) {
        case "togglePlay": {
          if (mk.isPlaying) await mk.pause();
          else await mk.play();
          pushState();
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "pause": {
          await mk.pause();
          pushState();
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "next": {
          await mk.skipToNextItem();
          pushState();
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "previous": {
          await mk.skipToPreviousItem();
          pushState();
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "seek": {
          await mk.seekToTime(Number(params.sec || 0));
          pushState();
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "setVolume": {
          mk.volume = Math.max(0, Math.min(1, Number(params.volume ?? 1)));
          pushState();
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "toggleShuffle": {
          mk.shuffleMode = mk.shuffleMode ? 0 : 1;
          pushState();
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "cycleRepeat": {
          mk.repeatMode = (Number(mk.repeatMode || 0) + 1) % 3;
          pushState();
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "playQueueIndex": {
          await mk.changeToMediaAtIndex(Number(params.index || 0));
          pushState();
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "playItem": {
          const kind = params.type || "song";
          const targetId = params.id;
          if (kind === "stations" || kind === "station") {
            mk.shuffleMode = 0;
            activeCollectionKey = "";
            try {
              await mk.setQueue({ station: targetId, startPlaying: true });
            } catch (_) {
              const stRes = await apiGet(mk, `/v1/catalog/${sf}/stations/${targetId}`);
              const stObj = stRes && stRes.data && stRes.data[0];
              if (!stObj) throw new Error("找不到該 Apple Music 電台");
              await mk.setQueue({ station: stObj.id || targetId, startPlaying: true });
            }
            await mk.play();
            pushState(true);
            emitToHost("rpc_result", id, { ok: true });
            break;
          }
          const isCollection =
            kind === "albums" ||
            kind === "album" ||
            kind === "library-albums" ||
            kind === "playlists" ||
            kind === "playlist" ||
            kind === "library-playlists";
          const colKey = isCollection ? `${kind}:${targetId}` : "";
          const wantedId = String(params.songId || "");
          const wantedCat = String(params.catalogId || "");
          const wantedTitle = String(params.title || "").trim().toLowerCase();
          const wantedArtist = String(params.artist || "").trim().toLowerCase();

          if (params.shuffle === true) {
            mk.shuffleMode = 0;
            const queueOpts = { startPlaying: false, ...buildQueueDescriptor(kind, targetId) };
            const totalTracks = Number(params.trackCount || 0);
            if (totalTracks > 1) {
              queueOpts.startWith = Math.floor(Math.random() * totalTracks);
            }
            await mk.setQueue(queueOpts);
            activeCollectionKey = colKey;
            mk.shuffleMode = 1;
            await mk.play();
            pushState(true);
            emitToHost("rpc_result", id, { ok: true });
            break;
          }

          const prevShuffle = Boolean(mk.shuffleMode);
          const keepShuffle = params.shuffle === false ? false : prevShuffle;

          if (typeof params.startWith === "number") {
            // Fast path: if this exact collection is already loaded (e.g., right after Shuffle),
            // jump straight to the clicked song inside the current queue without rebuilding or re-shuffling.
            if (colKey && activeCollectionKey === colKey && params.shuffle !== false) {
              const curItems = (mk.queue && mk.queue.items) || [];
              const existingIdx = findTrackIndex(curItems, wantedId, wantedCat, wantedTitle, wantedArtist);
              if (existingIdx >= 0 && typeof mk.changeToMediaAtIndex === "function") {
                await mk.changeToMediaAtIndex(existingIdx);
                await mk.play();
                pushState(true);
                emitToHost("rpc_result", id, { ok: true });
                break;
              }
            }

            mk.shuffleMode = 0;
            await mk.setQueue({
              startPlaying: false,
              startWith: params.startWith,
              ...buildQueueDescriptor(kind, targetId),
            });
            activeCollectionKey = colKey;

            const items = (mk.queue && mk.queue.items) || [];
            const pos = Number(mk.queue && typeof mk.queue.position === "number" ? mk.queue.position : -1);
            const cur = pos >= 0 ? items[pos] : null;
            if ((wantedId || wantedCat || wantedTitle) && !itemMatchesTrack(cur, wantedId, wantedCat, wantedTitle, wantedArtist)) {
              const exactIdx = findTrackIndex(items, wantedId, wantedCat, wantedTitle, wantedArtist);
              if (exactIdx >= 0 && typeof mk.changeToMediaAtIndex === "function") {
                await mk.changeToMediaAtIndex(exactIdx);
              }
            }

            await mk.play();
            if (keepShuffle) {
              mk.shuffleMode = 1;
              const nowItem = mk.nowPlayingItem;
              if ((wantedId || wantedCat || wantedTitle) && !itemMatchesTrack(nowItem, wantedId, wantedCat, wantedTitle, wantedArtist)) {
                const afterItems = (mk.queue && mk.queue.items) || [];
                const idxAfter = findTrackIndex(afterItems, wantedId, wantedCat, wantedTitle, wantedArtist);
                if (idxAfter >= 0 && typeof mk.changeToMediaAtIndex === "function") {
                  await mk.changeToMediaAtIndex(idxAfter);
                  await mk.play();
                }
              }
            }

            pushState(true);
            emitToHost("rpc_result", id, { ok: true });
            break;
          }

          if (params.shuffle === false) {
            mk.shuffleMode = 0;
          }
          await mk.setQueue({ startPlaying: true, ...buildQueueDescriptor(kind, targetId) });
          activeCollectionKey = colKey;
          await mk.play();
          pushState(true);
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "playTrackList": {
          const songIds = Array.isArray(params.ids) ? params.ids.map(String).filter(Boolean) : [];
          if (!songIds.length) throw new Error("沒有可播放的歌曲");
          const startIdx = Math.max(0, Math.min(songIds.length - 1, Number(params.startWith || 0)));
          const doShuffle = params.shuffle === true;
          mk.shuffleMode = 0;
          await mk.setQueue({
            songs: songIds,
            startWith: doShuffle && songIds.length > 1 ? Math.floor(Math.random() * songIds.length) : startIdx,
            startPlaying: false,
          });
          activeCollectionKey = "";
          if (doShuffle) mk.shuffleMode = 1;
          await mk.play();
          pushState(true);
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "startTrackStation": {
          let songId = String(params.catalogId || params.id || "").trim();
          if (!songId) throw new Error("缺少歌曲識別碼");
          if (songId.startsWith("i.")) {
            const catRes = await apiGet(mk, `/v1/me/library/songs/${songId}/catalog`).catch(() => null);
            const catItem = catRes && catRes.data && catRes.data[0];
            if (catItem && catItem.id) songId = String(catItem.id);
          }
          const stRes = await apiGet(mk, `/v1/catalog/${sf}/songs/${songId}/station`);
          const stObj = stRes && stRes.data && stRes.data[0];
          if (!stObj || !stObj.id) throw new Error("此歌曲暫時無法建立電台");
          mk.shuffleMode = 0;
          activeCollectionKey = "";
          await mk.setQueue({ station: stObj.id, startPlaying: true });
          await mk.play();
          pushState(true);
          emitToHost("rpc_result", id, {
            ok: true,
            stationId: stObj.id,
            stationName: (stObj.attributes && stObj.attributes.name) || "",
          });
          break;
        }
        case "playNext": {
          const desc = buildQueueDescriptor(params.type || "songs", params.id);
          await mk.playNext(desc);
          pushState(true);
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "playLater": {
          const desc = buildQueueDescriptor(params.type || "songs", params.id);
          await mk.playLater(desc);
          pushState(true);
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "addToPlaylist": {
          const playlistId = params.playlistId;
          const trackId = String(params.catalogId || params.id || "").trim();
          const isLibSong = trackId.startsWith("i.") || (!params.catalogId && params.type === "library-songs");
          const trackType = isLibSong ? "library-songs" : "songs";
          if (!playlistId || !trackId) throw new Error("缺少歌單或歌曲識別碼");
          try {
            await apiMutate(mk, "POST", `/v1/me/library/playlists/${playlistId}/tracks`, {}, {
              data: [{ id: trackId, type: trackType }],
            });
          } catch (err) {
            const fallbackLibId = String(params.id || "").trim();
            if (fallbackLibId && fallbackLibId.startsWith("i.") && fallbackLibId !== trackId) {
              await apiMutate(mk, "POST", `/v1/me/library/playlists/${playlistId}/tracks`, {}, {
                data: [{ id: fallbackLibId, type: "library-songs" }],
              });
            } else {
              throw err;
            }
          }
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "createPlaylist": {
          const name = String(params.name || "").trim();
          if (!name) throw new Error("請輸入播放列表名稱");
          const body = { attributes: { name } };
          if (params.trackId) {
            const trId = String(params.catalogId || params.trackId).trim();
            const isLibSong = trId.startsWith("i.") || (!params.catalogId && params.trackType === "library-songs");
            body.relationships = {
              tracks: {
                data: [
                  {
                    id: trId,
                    type: isLibSong ? "library-songs" : "songs",
                  },
                ],
              },
            };
          }
          const created = await apiMutate(mk, "POST", "/v1/me/library/playlists", {}, body);
          const createdPl = created && Array.isArray(created.data) ? created.data[0] : null;
          emitToHost("rpc_result", id, {
            ok: true,
            playlist: createdPl ? normalizeCollection([createdPl], "library-playlists")[0] : null,
          });
          break;
        }
        case "addToLibrary": {
          const colType = params.type || "songs";
          const targetId = params.catalogId || params.id;
          if (!targetId) throw new Error("缺少項目識別碼");
          let idKey = "ids[songs]";
          if (colType === "albums" || colType === "album") idKey = "ids[albums]";
          else if (colType === "playlists" || colType === "playlist") idKey = "ids[playlists]";
          await apiMutate(mk, "POST", "/v1/me/library", { [idKey]: String(targetId) });
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "loveSong": {
          const targetId = String(params.catalogId || params.id || "").trim();
          const isLibSong = targetId.startsWith("i.");
          const ratingType = isLibSong ? "library-songs" : "songs";
          if (!targetId) throw new Error("缺少歌曲識別碼");
          await apiMutate(mk, "PUT", `/v1/me/ratings/${ratingType}/${targetId}`, {}, {
            type: "ratings",
            attributes: { value: 1 },
          });
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "signOut": {
          try {
            if (mk.isPlaying) await mk.pause();
          } catch (_) {}
          if (typeof mk.unauthorize === "function") {
            await mk.unauthorize();
          }
          cachedUserName = "";
          cachedUserAvatar = "";
          profileScanCount = 0;
          lastProfileScanAt = 0;
          lastQueueSig = "";
          activeCollectionKey = "";
          pushState(true);
          emitToHost("rpc_result", id, { ok: true });
          break;
        }
        case "getHome": {
          const apiLang = mapApiLang(params && params.lang);
          const recQuery = apiLang ? { limit: 8, l: apiLang } : { limit: 8 };
          const chartQuery = apiLang
            ? { types: "songs,albums,playlists", limit: 12, l: apiLang }
            : { types: "songs,albums,playlists", limit: 12 };
          const [recs, charts] = await Promise.all([
            mk.isAuthorized
              ? apiGet(mk, "/v1/me/recommendations", recQuery).catch(() => ({ data: [] }))
              : Promise.resolve({ data: [] }),
            apiGet(mk, `/v1/catalog/${sf}/charts`, chartQuery).catch(() => ({ results: {} })),
          ]);

          const shelves = [];
          const recGroups = (recs && recs.data) || [];
          for (const g of recGroups.slice(0, 5)) {
            const title = (g.attributes && g.attributes.title && g.attributes.title.stringForDisplay) || "為你推薦";
            const items = normalizeCollection(g.relationships && g.relationships.contents ? g.relationships.contents.data : []);
            if (!cachedUserName) {
              for (const it of items) {
                const sub = it.subtitle || "";
                const m = sub.match(/^專屬(.+?)的/);
                if (m && m[1]) {
                  cachedUserName = m[1].trim();
                  break;
                }
              }
            }
            if (items.length) shelves.push({ title, items });
          }

          const chartResults = (charts && charts.results) || {};
          const topSongs = chartResults.songs && chartResults.songs[0] ? normalizeSongs(chartResults.songs[0].data) : [];
          const topAlbums = chartResults.albums && chartResults.albums[0] ? normalizeCollection(chartResults.albums[0].data, "albums") : [];
          const topPlaylists = chartResults.playlists && chartResults.playlists[0] ? normalizeCollection(chartResults.playlists[0].data, "playlists") : [];

          emitToHost("rpc_result", id, {
            ok: true,
            shelves,
            topSongs,
            topAlbums,
            topPlaylists,
          });
          break;
        }
        case "search": {
          const term = String(params.term || "").trim();
          if (!term) {
            emitToHost("rpc_result", id, { ok: true, songs: [], artists: [], albums: [], playlists: [], stations: [] });
            break;
          }
          const apiLang = mapApiLang(params && params.lang);
          const searchQuery = {
            term,
            types: "songs,artists,albums,playlists,stations",
            limit: 16,
          };
          if (apiLang) searchQuery.l = apiLang;
          const res = await apiGet(mk, `/v1/catalog/${sf}/search`, searchQuery);
          const results = (res && res.results) || {};
          emitToHost("rpc_result", id, {
            ok: true,
            songs: normalizeSongs(results.songs && results.songs.data),
            artists: normalizeArtists(results.artists && results.artists.data),
            albums: normalizeCollection(results.albums && results.albums.data, "albums"),
            playlists: normalizeCollection(results.playlists && results.playlists.data, "playlists"),
            stations: normalizeCollection(results.stations && results.stations.data, "stations"),
          });
          break;
        }
        case "getLibrary": {
          if (!mk.isAuthorized) {
            emitToHost("rpc_result", id, { ok: true, playlists: [], albums: [], songs: [], recentTracks: [] });
            break;
          }
          const [pl, al, sg, rc] = await Promise.all([
            apiGet(mk, "/v1/me/library/playlists", { limit: 40 }).catch(() => ({ data: [] })),
            apiGet(mk, "/v1/me/library/albums", { limit: 30 }).catch(() => ({ data: [] })),
            apiGet(mk, "/v1/me/library/songs", { limit: 50 }).catch(() => ({ data: [] })),
            apiGet(mk, "/v1/me/recent/played/tracks", { limit: 30 }, { cache: "no-store" }).catch(() => ({ data: [] })),
          ]);
          emitToHost("rpc_result", id, {
            ok: true,
            playlists: normalizeCollection(pl && pl.data, "library-playlists"),
            albums: normalizeCollection(al && al.data, "library-albums"),
            songs: normalizeSongs(sg && sg.data),
            recentTracks: normalizeSongs(rc && rc.data),
          });
          break;
        }
        case "getRecentTracks": {
          if (!mk.isAuthorized) {
            emitToHost("rpc_result", id, { ok: true, tracks: [] });
            break;
          }
          const apiLang = mapApiLang(params && params.lang);
          const q = apiLang ? { limit: 30, l: apiLang } : { limit: 30 };
          const rc = await apiGet(mk, "/v1/me/recent/played/tracks", q, { cache: "no-store" }).catch(() => ({ data: [] }));
          emitToHost("rpc_result", id, {
            ok: true,
            tracks: normalizeSongs(rc && rc.data),
          });
          break;
        }
        case "getCollectionDetail": {
          const colType = params.type || "playlists";
          const colId = params.id;
          let path;
          if (colType === "library-playlists") path = `/v1/me/library/playlists/${colId}`;
          else if (colType === "library-albums") path = `/v1/me/library/albums/${colId}`;
          else if (colType === "albums") path = `/v1/catalog/${sf}/albums/${colId}`;
          else path = `/v1/catalog/${sf}/playlists/${colId}`;

          const apiLang = mapApiLang(params && params.lang);
          const colQuery = apiLang ? { include: "tracks", l: apiLang } : { include: "tracks" };
          const isUserLib = colType.startsWith("library-");
          const fetchOpts = isUserLib || (params && params.noCache) ? { cache: "no-store" } : undefined;
          const res = await apiGet(mk, path, colQuery, fetchOpts);
          const obj = res && res.data && res.data[0] ? res.data[0] : null;
          if (!obj) throw new Error("找不到專輯或歌單內容");
          const attr = obj.attributes || {};
          const tracksRel = obj.relationships && obj.relationships.tracks ? obj.relationships.tracks : null;
          const rawTracks = tracksRel && Array.isArray(tracksRel.data) ? [...tracksRel.data] : [];
          let nextUrl = tracksRel && tracksRel.next ? tracksRel.next : "";
          let pageCount = 0;
          while (nextUrl && pageCount < 4) {
            pageCount++;
            const pageRes = await apiGet(mk, nextUrl, undefined, fetchOpts).catch(() => null);
            if (!pageRes || !Array.isArray(pageRes.data) || !pageRes.data.length) break;
            rawTracks.push(...pageRes.data);
            nextUrl = pageRes.next || "";
          }
          const tracks = normalizeSongs(rawTracks);
          emitToHost("rpc_result", id, {
            ok: true,
            detail: {
              id: obj.id,
              type: obj.type || colType,
              name: attr.name || "",
              subtitle: attr.artistName || attr.curatorName || "",
              description: attr.description ? (attr.description.standard || attr.description.short || "") : "",
              artwork: formatArtwork(attr.artwork, 600),
              tracks,
            },
          });
          break;
        }
        case "getArtistDetail": {
          const apiLang = mapApiLang(params && params.lang);
          const wantedName = String(params.artistName || "").trim();
          const wantedNameLower = wantedName.toLowerCase();
          let resolvedId = String(params.artistId || "").trim();

          const pickBestArtist = (list) => {
            if (!Array.isArray(list) || !list.length) return "";
            if (wantedNameLower) {
              const exact = list.find((a) => String((a.attributes && a.attributes.name) || "").trim().toLowerCase() === wantedNameLower);
              if (exact && exact.id) return String(exact.id);
            }
            return list[0] && list[0].id ? String(list[0].id) : "";
          };

          if (!resolvedId && (params.songCatalogId || params.songId)) {
            let songCid = String(params.songCatalogId || params.songId || "").trim();
            if (songCid.startsWith("i.")) {
              const catSongRes = await apiGet(mk, `/v1/me/library/songs/${songCid}/catalog`).catch(() => null);
              const catSong = catSongRes && catSongRes.data && catSongRes.data[0];
              songCid = catSong && catSong.id ? String(catSong.id) : "";
            }
            if (songCid) {
              const artRes = await apiGet(mk, `/v1/catalog/${sf}/songs/${songCid}/artists`).catch(() => null);
              resolvedId = pickBestArtist(artRes && artRes.data);
            }
          }

          if (!resolvedId && params.albumId) {
            let albCid = String(params.albumId || "").trim();
            if (albCid.startsWith("l.")) {
              const catAlbRes = await apiGet(mk, `/v1/me/library/albums/${albCid}/catalog`).catch(() => null);
              const catAlb = catAlbRes && catAlbRes.data && catAlbRes.data[0];
              albCid = catAlb && catAlb.id ? String(catAlb.id) : "";
            }
            if (albCid) {
              const artRes = await apiGet(mk, `/v1/catalog/${sf}/albums/${albCid}/artists`).catch(() => null);
              resolvedId = pickBestArtist(artRes && artRes.data);
            }
          }

          if (!resolvedId && wantedName) {
            const q = { term: wantedName, types: "artists", limit: 5 };
            if (apiLang) q.l = apiLang;
            const sRes = await apiGet(mk, `/v1/catalog/${sf}/search`, q).catch(() => null);
            const candidates = sRes && sRes.results && sRes.results.artists ? sRes.results.artists.data : [];
            resolvedId = pickBestArtist(candidates);
          }

          if (!resolvedId) {
            throw new Error("找不到該藝人的資料頁面");
          }

          const artQuery = {
            views: "top-songs,full-albums,singles",
            include: "albums,station",
          };
          if (apiLang) artQuery.l = apiLang;

          let artistRes = await apiGet(mk, `/v1/catalog/${sf}/artists/${resolvedId}`, artQuery).catch(() => null);
          if (!artistRes || !artistRes.data || !artistRes.data[0]) {
            const fallbackQuery = apiLang ? { include: "albums,station", l: apiLang } : { include: "albums,station" };
            artistRes = await apiGet(mk, `/v1/catalog/${sf}/artists/${resolvedId}`, fallbackQuery);
          }
          const obj = artistRes && artistRes.data && artistRes.data[0];
          if (!obj) throw new Error("找不到該藝人的資料頁面");

          const attr = obj.attributes || {};
          const views = obj.views || {};
          const rels = obj.relationships || {};
          const genericGenres = new Set(["Music", "音樂", "音乐", "ミュージック"]);
          const genres = Array.isArray(attr.genreNames)
            ? attr.genreNames.filter((g) => g && !genericGenres.has(g)).slice(0, 3)
            : [];
          const bio = attr.editorialNotes
            ? stripSimpleHtml(attr.editorialNotes.standard || attr.editorialNotes.short || "")
            : "";
          const stationData = rels.station && Array.isArray(rels.station.data) ? rels.station.data[0] : null;
          const stationId = stationData && stationData.id ? String(stationData.id) : "";

          const topSongs = normalizeSongs(views["top-songs"] && views["top-songs"].data).slice(0, 15);
          const rawFullAlbums =
            (views["full-albums"] && Array.isArray(views["full-albums"].data) && views["full-albums"].data.length
              ? views["full-albums"].data
              : rels.albums && Array.isArray(rels.albums.data)
                ? rels.albums.data
                : []);
          const rawSingles = views.singles && Array.isArray(views.singles.data) ? views.singles.data : [];

          const dedupeCols = (list) => {
            const seen = new Set();
            return normalizeCollection(list, "albums").filter((c) => {
              if (!c.id || seen.has(c.id)) return false;
              seen.add(c.id);
              return true;
            });
          };

          const albums = dedupeCols(rawFullAlbums);
          const albumIds = new Set(albums.map((a) => a.id));
          const singles = dedupeCols(rawSingles).filter((s) => !albumIds.has(s.id));

          emitToHost("rpc_result", id, {
            ok: true,
            artist: {
              id: obj.id || resolvedId,
              name: attr.name || wantedName,
              artwork: formatArtwork(attr.artwork, 600),
              genres,
              bio,
              stationId,
              topSongs,
              albums,
              singles,
            },
          });
          break;
        }
        case "getLyrics": {
          const songId = params.catalogId;
          if (!songId) {
            emitToHost("rpc_result", id, { ok: true, lines: [] });
            break;
          }
          // Prefer Apple Music syllable-lyrics (word-by-word Sing karaoke TTML), fallback to line-level lyrics
          let ttml = "";
          const sylRes = await apiGet(mk, `/v1/catalog/${sf}/songs/${songId}/syllable-lyrics`).catch(() => null);
          const sylItem = sylRes && sylRes.data && sylRes.data[0] ? sylRes.data[0] : null;
          if (sylItem && sylItem.attributes && sylItem.attributes.ttml) {
            ttml = sylItem.attributes.ttml;
          }
          if (!ttml) {
            const res = await apiGet(mk, `/v1/catalog/${sf}/songs/${songId}/lyrics`).catch(() => null);
            const item = res && res.data && res.data[0] ? res.data[0] : null;
            ttml = item && item.attributes ? item.attributes.ttml : "";
          }
          emitToHost("rpc_result", id, {
            ok: true,
            lines: parseTtmlLyrics(ttml),
          });
          break;
        }
        default:
          throw new Error("未知的 RPC 方法: " + method);
      }
    } catch (err) {
      emitToHost("rpc_result", id, {
        ok: false,
        error: err && err.message ? err.message : String(err),
      });
    }
  }

  let hooked = false;
  let lastTimePush = 0;
  let lastStatePushAt = 0;
  function attachListeners() {
    const mk = getMK();
    if (!mk || hooked) return Boolean(mk);
    hooked = true;
    for (const ev of [
      "playbackStateDidChange",
      "nowPlayingItemDidChange",
      "queueItemsDidChange",
      "authorizationStatusDidChange",
    ]) {
      try {
        mk.addEventListener(ev, () => {
          lastStatePushAt = Date.now();
          pushState(false);
        });
      } catch (_) {}
    }
    try {
      mk.addEventListener("playbackTimeDidChange", () => {
        const now = Date.now();
        if (now - lastTimePush >= 1500) {
          lastTimePush = now;
          lastStatePushAt = now;
          pushState(false);
        }
      });
    } catch (_) {}
    lastStatePushAt = Date.now();
    pushState(true);
    return true;
  }

  window.__AM_ENGINE_BRIDGE__ = {
    handleRpc,
    pause: () => {
      const mk = getMK();
      if (mk && mk.isPlaying) mk.pause();
    },
  };

  // Disable heavy CSS animations/transitions in hidden MusicKit engine window unless shown for login
  try {
    const idleStyle = document.createElement("style");
    idleStyle.id = "nyx-engine-idle-style";
    idleStyle.textContent =
      "html.nyx-engine-idle *, html.nyx-engine-idle *::before, html.nyx-engine-idle *::after { animation: none !important; transition: none !important; }";
    (document.head || document.documentElement).appendChild(idleStyle);
    const syncEngineIdle = () => {
      document.documentElement.classList.toggle("nyx-engine-idle", document.hidden);
    };
    syncEngineIdle();
    document.addEventListener("visibilitychange", syncEngineIdle);
  } catch (_) {}

  document.addEventListener("musickitloaded", () => attachListeners(), { once: true });

  const bootTimer = setInterval(() => {
    if (attachListeners()) {
      clearInterval(bootTimer);
    }
  }, 160);

  setInterval(() => {
    const mk = getMK();
    const now = Date.now();
    if (mk && mk.isPlaying && now - lastStatePushAt >= 3500) {
      lastStatePushAt = now;
      pushState(false);
    }
  }, 4000);
})();
