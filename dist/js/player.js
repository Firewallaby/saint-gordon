/*
 * Saint Gordon — Fragment Deck.
 * A custom transport for SoundCloud: the SoundCloud widget streams the audio in
 * a hidden iframe while this deck draws the controls, the waveform scrubber and
 * a sticky "now playing" bar. If a browser refuses remote playback (common on
 * iOS) the real SoundCloud panel is revealed so one direct tap starts the audio;
 * the deck keeps controlling it afterwards.
 */
(function () {
  "use strict";
  let apiPromise;
  const players = new Set();
  const BARS = 64;
  const VOLUME_KEY = "saintDeckVolume";
  const escape = (s) =>
    String(s || "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function soundcloudUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === "https:" &&
        ((u.hostname === "api.soundcloud.com" && /^\/tracks\/\d+$/.test(u.pathname)) ||
        ["soundcloud.com", "www.soundcloud.com", "on.soundcloud.com"].includes(
          u.hostname,
        ))
        ? u.href
        : "";
    } catch (_) {
      return "";
    }
  }
  function format(ms) {
    const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    return (
      Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0")
    );
  }
  // Stable placeholder waveform, seeded by the track so it never jumps around
  // between visits. Replaced by SoundCloud's real waveform once it loads.
  function seededWave(seed, count) {
    let h = 2166136261;
    const text = String(seed || "saint-gordon");
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const rand = () => {
      h = (h + 0x6d2b79f5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const p1 = rand() * 6.28,
      p2 = rand() * 6.28;
    const out = [];
    for (let i = 0; i < count; i++) {
      const env = Math.min(1, (i + 1) / 5, (count - i) / 7);
      const v =
        0.55 +
        0.22 * Math.sin(i * 0.31 + p1) +
        0.14 * Math.sin(i * 0.87 + p2) +
        0.28 * (rand() - 0.5);
      out.push(Math.round(Math.max(0.12, Math.min(1, v * (0.35 + env * 0.65))) * 100));
    }
    return out;
  }
  function downsample(samples, count) {
    const bins = [];
    const size = samples.length / count;
    for (let i = 0; i < count; i++) {
      const slice = samples.slice(Math.floor(i * size), Math.max(Math.floor((i + 1) * size), Math.floor(i * size) + 1));
      let sum = 0,
        max = 0;
      slice.forEach((n) => {
        sum += n;
        if (n > max) max = n;
      });
      bins.push(slice.length ? (sum / slice.length) * 0.6 + max * 0.4 : 0);
    }
    const peak = Math.max(1, ...bins);
    return bins.map((v) => Math.round(Math.max(0.08, v / peak) * 100));
  }
  const waveLayers = (values) =>
    ["base", "hover", "played"]
      .map(
        (layer) =>
          `<div class="wave-bars wave-${layer}">${values
            .map((v, i) => `<span style="--h:${v}%;--i:${i}"></span>`)
            .join("")}</div>`,
      )
      .join("");
  const ICONS = {
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="7" y="5.5" width="3.5" height="13" rx="0.8" fill="currentColor"/><rect x="13.5" y="5.5" width="3.5" height="13" rx="0.8" fill="currentColor"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5a7 7 0 1 1-6.6 4.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4.6 4.6v4.7h4.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="15.4" text-anchor="middle" font-size="6.6" font-family="Courier New, monospace" font-weight="700" fill="currentColor">10</text></svg>',
    forward: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5a7 7 0 1 0 6.6 4.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M19.4 4.6v4.7h-4.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="15.4" text-anchor="middle" font-size="6.6" font-family="Courier New, monospace" font-weight="700" fill="currentColor">10</text></svg>',
    volume: '<svg class="ico-on" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M15 9.2a4 4 0 0 1 0 5.6M17.4 6.8a7.4 7.4 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><svg class="ico-off" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  };
  function api() {
    if (window.SC && window.SC.Widget) return Promise.resolve(window.SC);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://w.soundcloud.com/player/api.js";
      script.async = true;
      const timer = setTimeout(
        () => reject(new Error("SoundCloud timed out")),
        15000,
      );
      script.onload = () => {
        clearTimeout(timer);
        window.SC && window.SC.Widget
          ? resolve(window.SC)
          : reject(new Error("API unavailable"));
      };
      script.onerror = () => {
        clearTimeout(timer);
        reject(new Error("SoundCloud blocked"));
      };
      document.head.appendChild(script);
    });
    return apiPromise;
  }
  function storage() {
    try {
      return window.localStorage || null;
    } catch (_) {
      return null;
    }
  }
  function mount(host, track, options) {
    options = options || {};
    if (host && typeof host._saintCleanup === "function") host._saintCleanup();
    const url = soundcloudUrl(track.soundcloudUrl);
    const attributionUrl = url.startsWith("https://api.soundcloud.com/") ? "https://soundcloud.com/ceannairefr" : url;
    const widgetUrl = url
      ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&show_user=true&show_artwork=true&single_active=true&color=%23303030`
      : "";
    const label = options.label || "AUDIO DECK";
    const title = escape(track.title);
    const initialWave = seededWave(track.slug || track.title, BARS);
    host.innerHTML = `<section class="player" data-state="${url ? "loading" : "offline"}" aria-label="Music player for ${title}" style="--progress:0%;--pnum:0;--hover:0%;--vol:80%"><div class="deck-head"><span class="deck-id"><span class="deck-led" aria-hidden="true"></span><span class="deck-label">${escape(label)}</span><span class="deck-title">${title}</span></span><span class="deck-state" aria-hidden="true">${url ? "LOADING" : "OFFLINE"}</span></div><div class="deck-main"><button class="play-button"${url ? "" : " disabled"} aria-label="Play ${title}" aria-pressed="false" title="Play / pause (K)"><svg class="play-ring" viewBox="0 0 72 72" aria-hidden="true" focusable="false"><circle class="ring-track" cx="36" cy="36" r="34" pathLength="100"></circle><circle class="ring-fill" cx="36" cy="36" r="34" pathLength="100"></circle></svg><span class="play-icon" aria-hidden="true"></span></button><div class="deck-wave"><div class="wave"><div class="wave-stack" aria-hidden="true">${waveLayers(initialWave)}</div><span class="wave-head" aria-hidden="true"></span><span class="wave-tip" aria-hidden="true">0:00</span><input class="seek" type="range" min="0" max="1000" value="0" step="1" disabled aria-label="Playback position" aria-valuetext="0:00"><span class="wave-focus" aria-hidden="true"></span></div><div class="player-times"><span class="current">0:00</span><button type="button" class="time-toggle" title="Show remaining time" aria-label="Toggle remaining time"><span class="duration">--:--</span></button></div></div></div><div class="deck-controls"><div class="deck-transport"><button type="button" class="deck-btn pause-button" aria-label="Pause ${title}" title="Pause (K)" disabled>${ICONS.pause}</button><button type="button" class="deck-btn skip-back" aria-label="Back 10 seconds" title="Back 10s (J)" disabled>${ICONS.back}</button><button type="button" class="deck-btn skip-forward" aria-label="Forward 10 seconds" title="Forward 10s (L)" disabled>${ICONS.forward}</button></div><div class="player-volume"><button type="button" class="deck-btn mute-button" aria-label="Mute" aria-pressed="false" title="Mute (M)" disabled>${ICONS.volume}</button><input class="volume" type="range" min="0" max="100" value="80" disabled aria-label="Volume"></div>${url ? `<p class="attribution">${escape(track.artist)} · <a href="${escape(attributionUrl)}" target="_blank" rel="noopener noreferrer">Listen on SoundCloud ↗</a></p>` : ""}</div><p class="player-status" role="status">${url ? "Connecting to SoundCloud…" : "Audio unavailable — a SoundCloud track has not been supplied."}</p>${url ? `<div class="player-handoff">Your browser wants one direct tap. Press play on the SoundCloud panel below — the deck stays in sync after that.</div><iframe class="player-source" title="SoundCloud audio source: ${title}" src="${widgetUrl}" aria-hidden="true" tabindex="-1" allow="autoplay"></iframe><iframe class="player-fallback" title="SoundCloud fallback: ${title}" aria-hidden="true" tabindex="-1" allow="autoplay"></iframe>` : ""}</section>`;
    if (!url) return;
    const root = host.querySelector(".player"),
      q = (selector) => root.querySelector(selector),
      play = q(".play-button"),
      pauseBtn = q(".pause-button"),
      seek = q(".seek"),
      volume = q(".volume"),
      current = q(".current"),
      total = q(".duration"),
      status = q(".player-status"),
      source = q(".player-source"),
      fallback = q(".player-fallback"),
      stateChip = q(".deck-state"),
      wave = q(".wave"),
      waveStack = q(".wave-stack"),
      tip = q(".wave-tip"),
      timeToggle = q(".time-toggle"),
      skipBack = q(".skip-back"),
      skipForward = q(".skip-forward"),
      mute = q(".mute-button");
    let widget,
      duration = 0,
      ready = false,
      dragging = false,
      isPlaying = false,
      playRequested = false,
      awaitingPlay = false,
      playAttemptTimer,
      handoffTimer,
      fallbackActive = false,
      failed = false,
      hasPlayed = false,
      pendingSeek = null,
      showRemaining = false,
      muted = false,
      lastVolume = 80,
      currentMs = 0,
      mini,
      observer,
      deckInView = true;
    const store = storage();
    const saved = store ? Number(store.getItem(VOLUME_KEY)) : NaN;
    if (store && store.getItem(VOLUME_KEY) !== null && saved >= 0 && saved <= 100) {
      volume.value = String(saved);
      lastVolume = saved || 80;
    }
    play.disabled = false;
    const STATES = {
      loading: "LOADING",
      ready: "READY",
      buffering: "BUFFERING",
      playing: "PLAYING",
      paused: "PAUSED",
      ended: "ENDED",
      backup: "BACKUP",
      tap: "TAP TO PLAY",
    };
    const setDeck = (name) => {
      root.setAttribute("data-state", name);
      if (stateChip) stateChip.textContent = STATES[name] || name.toUpperCase();
    };
    const setControls = (enabled) => {
      [skipBack, skipForward, mute].forEach((b) => {
        if (b) b.disabled = !enabled;
      });
    };
    const paintVolume = () => {
      root.style.setProperty("--vol", Number(volume.value) + "%");
      if (mute) {
        const silent = muted || Number(volume.value) === 0;
        mute.setAttribute("aria-pressed", String(silent));
        mute.setAttribute("aria-label", silent ? "Unmute" : "Mute");
      }
    };
    const paintDuration = () => {
      if (!duration) return;
      total.textContent = showRemaining
        ? "-" + format(Math.max(0, duration - currentMs))
        : format(duration);
    };
    const paintProgress = (ms) => {
      const pct = duration > 0 ? Math.min(100, Math.max(0, (ms / duration) * 100)) : 0;
      const rounded = Math.round(pct * 100) / 100;
      root.style.setProperty("--progress", rounded + "%");
      root.style.setProperty("--pnum", String(rounded));
      root.classList.toggle("has-progress", ms > 0);
      if (mini) {
        mini.style.setProperty("--progress", rounded + "%");
        const time = mini.querySelector(".deck-mini-time");
        if (time) time.textContent = format(ms) + " / " + (duration ? format(duration) : "--:--");
      }
    };
    const clearPlayAttempt = () => {
      clearTimeout(playAttemptTimer);
      clearTimeout(handoffTimer);
      playAttemptTimer = handoffTimer = undefined;
    };
    const showFrame = (frame, visible) => {
      if (!frame) return;
      frame.setAttribute("aria-hidden", String(!visible));
      frame.setAttribute("tabindex", visible ? "0" : "-1");
    };
    const revealHandoff = () => {
      root.classList.add("needs-handoff");
      showFrame(source, true);
      setDeck("tap");
      status.textContent =
        "Remote start was blocked by this browser — press play on the SoundCloud panel below.";
    };
    const collapseHandoff = () => {
      root.classList.remove("needs-handoff");
      showFrame(source, false);
    };
    const activateFallback = (shouldPlay) => {
      failed = true;
      ready = false;
      playRequested = awaitingPlay = false;
      clearPlayAttempt();
      collapseHandoff();
      play.disabled = false;
      seek.disabled = volume.disabled = true;
      setControls(false);
      root.classList.toggle("is-playing", Boolean(shouldPlay));
      root.classList.add("is-fallback");
      showFrame(fallback, true);
      isPlaying = Boolean(shouldPlay);
      play.setAttribute("aria-pressed", String(Boolean(shouldPlay)));
      if (pauseBtn) pauseBtn.disabled = !shouldPlay;
      fallbackActive = true;
      setDeck(shouldPlay ? "playing" : "backup");
      fallback.src = widgetUrl.replace(
        "auto_play=false",
        "auto_play=" + String(Boolean(shouldPlay)),
      );
      status.textContent = shouldPlay
        ? "Playing through SoundCloud backup."
        : "SoundCloud backup ready. Press play to listen.";
    };
    const fail = () => {
      if (failed) return;
      const shouldPlay = playRequested || isPlaying;
      if (widget && isPlaying) {
        try {
          widget.pause();
        } catch (_) {}
      }
      activateFallback(shouldPlay);
    };
    const timeout = setTimeout(fail, 18000);
    const updateMini = () => {
      if (!mini) return;
      const visible = !deckInView && hasPlayed;
      mini.classList.toggle("is-visible", visible);
      mini.setAttribute("aria-hidden", String(!visible));
      const miniPlay = mini.querySelector(".deck-mini-play");
      if (miniPlay) {
        miniPlay.setAttribute("aria-pressed", String(isPlaying));
        miniPlay.setAttribute("aria-label", (isPlaying ? "Pause " : "Play ") + track.title);
      }
    };
    const state = (playing) => {
      isPlaying = playing;
      if (playing) {
        playRequested = awaitingPlay = false;
        hasPlayed = true;
        clearPlayAttempt();
      }
      root.classList.toggle("is-playing", playing);
      // The icon follows aria-pressed in CSS, avoiding emoji glyphs on mobile.
      play.setAttribute("aria-pressed", String(playing));
      play.setAttribute(
        "aria-label",
        (playing ? "Pause " : "Play ") + track.title,
      );
      if (pauseBtn) {
        pauseBtn.disabled = !playing;
        pauseBtn.setAttribute("aria-pressed", String(!playing && hasPlayed));
      }
      setDeck(playing ? "playing" : "paused");
      status.textContent = playing
        ? "Playing through SoundCloud."
        : "Paused. Press play to continue.";
      updateMini();
    };
    const pausePlayback = () => {
      playRequested = awaitingPlay = false;
      clearPlayAttempt();
      if (fallbackActive && fallback) {
        fallback.src = widgetUrl;
      }
      if (widget) {
        try {
          widget.pause();
        } catch (_) {}
      }
      state(false);
    };
    const startPlayback = () => {
      if (fallbackActive) {
        if (ready && widget) {
          failed = false;
          fallbackActive = false;
          status.textContent = "Starting playback…";
          widget.play();
          return;
        }
        activateFallback(true);
        return;
      }
      if (!ready || failed) {
        if (!failed) {
          playRequested = true;
          if (pauseBtn) pauseBtn.disabled = false;
          setDeck("buffering");
          status.textContent = "Starting when connected to SoundCloud…";
        }
        return;
      }
      playRequested = false;
      awaitingPlay = true;
      if (pauseBtn) pauseBtn.disabled = false;
      setDeck("buffering");
      status.textContent = "Starting playback…";
      widget.play();
      clearPlayAttempt();
      playAttemptTimer = setTimeout(() => {
        if (ready && !failed && !isPlaying) {
          widget.play();
          status.textContent = "Buffering audio from SoundCloud…";
          handoffTimer = setTimeout(() => {
            if (awaitingPlay && ready && !failed && !isPlaying) revealHandoff();
          }, 3200);
        }
      }, 900);
    };
    const position = (ms) => {
      currentMs = Number(ms) || 0;
      current.textContent = format(currentMs);
      seek.setAttribute(
        "aria-valuetext",
        format(currentMs) + " of " + format(duration),
      );
      if (!dragging && duration)
        seek.value = String(Math.min(1000, Math.round((currentMs / duration) * 1000)));
      paintProgress(currentMs);
      if (showRemaining) paintDuration();
    };
    const commitSeek = (ms) => {
      if (!duration) return;
      const target = Math.max(0, Math.min(duration, Math.round(ms)));
      position(target);
      if (!hasPlayed) pendingSeek = target;
      if (ready && widget) widget.seekTo(target);
    };
    const learnDuration = () => {
      widget.getDuration((ms) => {
        duration = Number(ms) || 0;
        paintDuration();
        seek.disabled = !duration;
        position(currentMs);
      });
    };
    const loadWaveform = () => {
      if (!widget || typeof widget.getCurrentSound !== "function" || typeof fetch !== "function") return;
      widget.getCurrentSound((sound) => {
        const raw = sound && sound.waveform_url;
        if (!raw || !waveStack) return;
        let jsonUrl;
        try {
          const u = new URL(raw.replace(/\.png(\?.*)?$/, ".json"));
          if (u.protocol !== "https:" || !/(^|\.)sndcdn\.com$/.test(u.hostname)) return;
          jsonUrl = u.href;
        } catch (_) {
          return;
        }
        fetch(jsonUrl)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data && Array.isArray(data.samples) && data.samples.length >= BARS) {
              waveStack.innerHTML = waveLayers(downsample(data.samples, BARS));
              root.classList.add("has-waveform");
            }
          })
          .catch(() => {});
      });
    };
    api()
      .then((SC) => {
        widget = SC.Widget(source);
        widget._saintSource = source;
        players.add(widget);
        widget.bind(SC.Widget.Events.READY, () => {
          clearTimeout(timeout);
          failed = false;
          ready = true;
          play.disabled = false;
          volume.disabled = false;
          setControls(true);
          setDeck(playRequested ? "buffering" : "ready");
          status.textContent = playRequested
            ? "Starting playback…"
            : "Ready. Press play to hear the track.";
          paintVolume();
          learnDuration();
          loadWaveform();
          widget.setVolume(muted ? 0 : Number(volume.value));
          if (playRequested) startPlayback();
        });
        widget.bind(SC.Widget.Events.PLAY, () => {
          failed = false;
          fallbackActive = false;
          root.classList.remove("is-fallback");
          clearPlayAttempt();
          collapseHandoff();
          const firstPlay = !hasPlayed;
          state(true);
          players.forEach((other) => {
            if (other === widget) return;
            if (other._saintSource && other._saintSource.isConnected === false) {
              players.delete(other);
              return;
            }
            try {
              other.pause();
            } catch (_) {
              players.delete(other);
            }
          });
          learnDuration();
          if (firstPlay && pendingSeek !== null) {
            widget.seekTo(pendingSeek);
            pendingSeek = null;
          }
        });
        widget.bind(SC.Widget.Events.PAUSE, () => {
          if (!failed) state(false);
          else if (isPlaying) state(false);
        });
        widget.bind(SC.Widget.Events.PLAY_PROGRESS, (data) => {
          if (failed) return;
          if ((awaitingPlay || playRequested) && !isPlaying && data && data.currentPosition > 0) {
            state(true);
          }
          position(data.currentPosition);
        });
        widget.bind(SC.Widget.Events.SEEK, (data) => {
          if (!failed) position(data.currentPosition);
        });
        widget.bind(SC.Widget.Events.FINISH, () => {
          if (!failed) {
            state(false);
            position(duration);
            setDeck("ended");
            status.textContent =
              "The transmission has ended. Press play to listen again.";
          }
        });
        widget.bind(SC.Widget.Events.ERROR, () => {
          clearTimeout(timeout);
          fail();
        });
      })
      .catch(() => {
        clearTimeout(timeout);
        fail();
      });
    const toggle = () => {
      if (isPlaying || awaitingPlay || playRequested) {
        pausePlayback();
      } else if (fallbackActive && !ready) {
        activateFallback(true);
      } else {
        startPlayback();
      }
    };
    const skip = (delta) => {
      if (!ready || !duration) return;
      commitSeek(currentMs + delta);
    };
    const toggleMute = () => {
      if (!ready) return;
      if (muted || Number(volume.value) === 0) {
        muted = false;
        volume.value = String(lastVolume || 80);
      } else {
        muted = true;
        lastVolume = Number(volume.value) || 80;
        volume.value = "0";
      }
      widget.setVolume(muted ? 0 : Number(volume.value));
      paintVolume();
    };
    play.addEventListener("click", toggle);
    if (pauseBtn) pauseBtn.addEventListener("click", pausePlayback);
    if (skipBack) skipBack.addEventListener("click", () => skip(-10000));
    if (skipForward) skipForward.addEventListener("click", () => skip(10000));
    if (mute) mute.addEventListener("click", toggleMute);
    if (timeToggle)
      timeToggle.addEventListener("click", () => {
        showRemaining = !showRemaining;
        timeToggle.setAttribute("title", showRemaining ? "Show total time" : "Show remaining time");
        paintDuration();
      });
    seek.addEventListener("input", () => {
      dragging = true;
      root.classList.add("is-scrubbing");
      const ms = (Number(seek.value) / 1000) * duration;
      current.textContent = format(ms);
      seek.setAttribute(
        "aria-valuetext",
        current.textContent + " of " + format(duration),
      );
      paintProgress(ms);
    });
    seek.addEventListener("change", () => {
      dragging = false;
      root.classList.remove("is-scrubbing");
      if (ready && duration) commitSeek((Number(seek.value) / 1000) * duration);
    });
    seek.addEventListener("blur", () => {
      dragging = false;
      root.classList.remove("is-scrubbing");
    });
    if (wave) {
      const ratioAt = (event) => {
        const rect = wave.getBoundingClientRect();
        if (!rect || !rect.width) return null;
        return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      };
      wave.addEventListener("pointermove", (event) => {
        if (!duration || event.pointerType === "touch") return;
        const ratio = ratioAt(event);
        if (ratio === null) return;
        root.style.setProperty("--hover", (ratio * 100).toFixed(2) + "%");
        root.classList.add("is-hovering");
        if (tip) tip.textContent = format(ratio * duration);
      });
      wave.addEventListener("pointerleave", () => {
        root.style.setProperty("--hover", "0%");
        root.classList.remove("is-hovering");
      });
      // Safari on iOS ignores taps on a range track, so taps seek explicitly.
      wave.addEventListener("click", (event) => {
        if (!ready || !duration) return;
        const ratio = ratioAt(event);
        if (ratio === null) return;
        if (Math.abs(ratio * 1000 - Number(seek.value)) < 4) return;
        seek.value = String(Math.round(ratio * 1000));
        commitSeek(ratio * duration);
      });
    }
    volume.addEventListener("input", () => {
      const value = Number(volume.value);
      muted = value === 0;
      if (value > 0) lastVolume = value;
      if (ready) widget.setVolume(value);
      paintVolume();
      if (store) {
        try {
          store.setItem(VOLUME_KEY, String(value));
        } catch (_) {}
      }
    });
    root.addEventListener("keydown", (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      const tag = event.target && event.target.tagName;
      if (key === " " && tag === "BUTTON") return;
      if (key === " " || key === "k" || key === "K") {
        event.preventDefault();
        toggle();
      } else if (key === "j" || key === "J") {
        skip(-10000);
      } else if (key === "l" || key === "L") {
        skip(10000);
      } else if (key === "m" || key === "M") {
        toggleMute();
      }
    });
    // Sticky "now playing" bar while the deck is scrolled out of view.
    if (
      typeof IntersectionObserver === "function" &&
      typeof document !== "undefined" &&
      document.body &&
      typeof document.createElement === "function"
    ) {
      mini = document.createElement("div");
      mini.className = "deck-mini";
      mini.setAttribute("aria-hidden", "true");
      mini.innerHTML = `<span class="deck-mini-bar" aria-hidden="true"><i></i></span><button type="button" class="deck-mini-play" aria-label="Play ${title}" aria-pressed="false"><span class="play-icon" aria-hidden="true"></span></button><button type="button" class="deck-mini-title" title="Back to the deck">${title}<small>${escape(track.artist)}</small></button><span class="deck-mini-time">0:00 / --:--</span>`;
      document.body.appendChild(mini);
      mini.querySelector(".deck-mini-play").addEventListener("click", toggle);
      mini.querySelector(".deck-mini-title").addEventListener("click", () => {
        root.scrollIntoView({ behavior: "smooth", block: "center" });
        play.focus({ preventScroll: true });
      });
      observer = new IntersectionObserver(
        (entries) => {
          deckInView = entries[entries.length - 1].isIntersecting;
          updateMini();
        },
        { threshold: 0.15 },
      );
      observer.observe(root);
    }
    paintVolume();
    const cleanup = () => {
      clearTimeout(timeout);
      clearPlayAttempt();
      if (observer) observer.disconnect();
      if (mini && mini.parentNode) mini.parentNode.removeChild(mini);
      if (widget) {
        try {
          widget.pause();
        } catch (_) {}
        players.delete(widget);
      }
      if (host) host._saintCleanup = null;
    };
    if (host) host._saintCleanup = cleanup;
    window.addEventListener("pagehide", cleanup, { once: true });
  }
  window.SaintPlayer = { mount, format, soundcloudUrl, api };
})();
