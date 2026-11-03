(function () {
  "use strict";
  let apiPromise;
  const players = new Set();
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
  const spectrumHeights = [
    28, 52, 36, 75, 42, 90, 55, 31, 68, 44,
    84, 39, 60, 25, 73, 49, 95, 34, 62, 46,
    80, 30, 58, 88, 40, 69, 33, 92, 54, 27,
    76, 43, 64, 35, 86, 51, 72, 29, 57, 97,
  ];
  const spectrumBars = spectrumHeights
    .map(
      (height, index) =>
        `<i style="--bar-height:${height}%;--bar-delay:${-((index % 9) * 0.09)}s"></i>`,
    )
    .join("");
  const spectrumHeightAt = (position, index) => {
    const frame = Math.floor((Number(position) || 0) / 140);
    const base = spectrumHeights[(index + frame * 3) % spectrumHeights.length];
    const pulse = Math.abs(Math.sin(frame * 0.8 + index * 0.77));
    return Math.min(98, Math.round(12 + base * (0.25 + pulse * 0.75)));
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
  function mount(host, track) {
    const url = soundcloudUrl(track.soundcloudUrl);
    const attributionUrl = url.startsWith("https://api.soundcloud.com/") ? "https://soundcloud.com/ceannairefr" : url;
    const widgetUrl = url
      ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&show_user=true&show_artwork=true&single_active=true&color=%23303030`
      : "";
    host.innerHTML = `<section class="player" aria-label="Music player for ${escape(track.title)}"><div class="player-top"><span>SAINT GORDON / AUDIO DECK</span><div class="deck-top-actions"><button type="button" class="relic-mode-btn" aria-pressed="false" title="Toggle Cathode Ray Relic Mode"><span class="relic-led" aria-hidden="true"></span><span class="relic-btn-text">RELIC MODE</span></button><span class="signal" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span></div></div><div class="player-main"><button class="play-button"${url ? "" : " disabled"} aria-label="Play ${escape(track.title)}" aria-pressed="false"><span class="play-icon" aria-hidden="true"></span></button><div><input class="seek" type="range" min="0" max="1000" value="0" step="1" disabled aria-label="Playback position" aria-valuetext="0:00"><div class="player-times"><span class="current">0:00</span><span class="duration">--:--</span></div></div></div><div class="player-spectrum" aria-hidden="true">${spectrumBars}</div><div class="relic-crt" aria-hidden="true"><div class="crt-bezel"><div class="crt-header micro"><span class="crt-tag">TRANSDUCER CRT // 44.1kHz</span><span class="crt-mode-tag">OSCILLOSCOPE: TIME DOMAIN</span></div><div class="crt-screen"><canvas class="relic-canvas" width="640" height="180"></canvas><div class="crt-reticle"></div><div class="crt-scanlines"></div><div class="crt-glow"></div></div><div class="crt-controls"><div class="crt-switch-group"><span class="micro">TRACE:</span><button type="button" class="crt-opt-btn is-active" data-crt-mode="wave">WAVE</button><button type="button" class="crt-opt-btn" data-crt-mode="lissajous">LISSAJOUS</button><button type="button" class="crt-opt-btn" data-crt-mode="spectrum">SPECTRUM</button></div><div class="crt-switch-group"><span class="micro">PHOSPHOR:</span><button type="button" class="crt-color-btn is-active" data-phosphor="green">P31 GRN</button><button type="button" class="crt-color-btn" data-phosphor="amber">P3 AMB</button><button type="button" class="crt-color-btn" data-phosphor="silver">P4 WHT</button></div></div></div></div><label class="player-volume">VOLUME <input class="volume" type="range" min="0" max="100" value="80" disabled aria-label="Volume"></label><p class="player-status" role="status">${url ? "Connecting to SoundCloud…" : "Audio unavailable — a SoundCloud track has not been supplied."}</p>${url ? `<p class="attribution">${escape(track.artist)} · <a href="${escape(attributionUrl)}" target="_blank" rel="noopener noreferrer">Listen on SoundCloud</a></p><iframe class="player-source" title="SoundCloud audio source: ${escape(track.title)}" src="${widgetUrl}" aria-hidden="true" tabindex="-1" allow="autoplay"></iframe><iframe class="player-fallback" title="SoundCloud fallback: ${escape(track.title)}" aria-hidden="true" tabindex="-1" allow="autoplay"></iframe>` : ""}</section>`;
    if (!url) return;
    const root = host.querySelector(".player"),
      play = root.querySelector(".play-button"),
      seek = root.querySelector(".seek"),
      volume = root.querySelector(".volume"),
      current = root.querySelector(".current"),
      total = root.querySelector(".duration"),
      status = root.querySelector(".player-status"),
      spectrum = root.querySelector(".player-spectrum"),
      fallback = root.querySelector(".player-fallback");
    let widget,
      duration = 0,
      ready = false,
      dragging = false,
      isPlaying = false,
      playRequested = false,
      playAttemptTimer,
      fallbackActive = false,
      failed = false,
      currentMs = 0;
    play.disabled = false;
    const clearPlayAttempt = () => {
      clearTimeout(playAttemptTimer);
      playAttemptTimer = undefined;
    };
    const activateFallback = (shouldPlay) => {
      failed = true;
      ready = false;
      playRequested = false;
      clearPlayAttempt();
      play.disabled = false;
      seek.disabled = volume.disabled = true;
      root.classList.remove("is-playing");
      isPlaying = false;
      fallbackActive = true;
      fallback.src = widgetUrl.replace(
        "auto_play=false",
        "auto_play=" + String(Boolean(shouldPlay)),
      );
      status.textContent = shouldPlay
        ? "Switching to SoundCloud playback…"
        : "SoundCloud backup ready. Press play to listen.";
    };
    const fail = () => {
      if (failed) return;
      const shouldPlay = playRequested || isPlaying;
      if (widget && isPlaying) widget.pause();
      activateFallback(shouldPlay);
    };
    const timeout = setTimeout(fail, 18000);
    const state = (playing) => {
      isPlaying = playing;
      if (playing) {
        playRequested = false;
        clearPlayAttempt();
      }
      root.classList.toggle("is-playing", playing);
      // The icon follows aria-pressed in CSS, avoiding emoji glyphs on mobile.
      play.setAttribute("aria-pressed", String(playing));
      play.setAttribute(
        "aria-label",
        (playing ? "Pause " : "Play ") + track.title,
      );
      status.textContent = playing
        ? "Playing through SoundCloud."
        : "Paused. Press play to continue.";
    };
    const renderSpectrum = (ms) => {
      const progress = duration > 0 ? ms / duration : 0;
      const activeBarCount = Math.round(progress * 40);
      Array.from(spectrum.children).forEach((bar, index) => {
        bar.style.setProperty(
          "--bar-height",
          spectrumHeightAt(ms, index) + "%",
        );
        if (index <= activeBarCount) {
          bar.classList.add("is-past");
        } else {
          bar.classList.remove("is-past");
        }
      });
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
          status.textContent = "Starting when connected to SoundCloud…";
        }
        return;
      }
      playRequested = false;
      status.textContent = "Starting playback…";
      widget.play();
      clearPlayAttempt();
      playAttemptTimer = setTimeout(() => {
        if (ready && !failed && !isPlaying) {
          widget.play();
          status.textContent = "Buffering audio from SoundCloud…";
        }
      }, 900);
    };
    const position = (ms) => {
      currentMs = Number(ms) || 0;
      current.textContent = format(ms);
      seek.setAttribute(
        "aria-valuetext",
        format(ms) + " of " + format(duration),
      );
      if (!dragging && duration)
        seek.value = String(Math.min(1000, Math.round((ms / duration) * 1000)));
      renderSpectrum(ms);
    };
    api()
      .then((SC) => {
        widget = SC.Widget(root.querySelector(".player-source"));
        players.add(widget);
        widget.bind(SC.Widget.Events.READY, () => {
          clearTimeout(timeout);
          failed = false;
          ready = true;
          play.disabled = false;
          volume.disabled = false;
          status.textContent = playRequested
            ? "Starting playback…"
            : "Ready. Press play to hear the track.";
          widget.setVolume(Number(volume.value));
          widget.getDuration((ms) => {
            duration = Number(ms) || 0;
            total.textContent = format(duration);
            seek.disabled = !duration;
          });
          if (playRequested) startPlayback();
        });
        widget.bind(SC.Widget.Events.PLAY, () => {
          failed = false;
          fallbackActive = false;
          clearPlayAttempt();
          players.forEach((other) => {
            if (other !== widget) other.pause();
          });
          state(true);
          widget.getDuration((ms) => {
            duration = Number(ms) || 0;
            total.textContent = format(duration);
            seek.disabled = !duration;
          });
        });
        widget.bind(SC.Widget.Events.PAUSE, () => {
          if (!failed) state(false);
          else if (isPlaying) state(false);
        });
        widget.bind(SC.Widget.Events.PLAY_PROGRESS, (data) => {
          if (!failed) position(data.currentPosition);
        });
        widget.bind(SC.Widget.Events.SEEK, (data) => {
          if (!failed) position(data.currentPosition);
        });
        widget.bind(SC.Widget.Events.FINISH, () => {
          if (!failed) {
            state(false);
            position(duration);
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
    play.addEventListener("click", () => {
      if (isPlaying) {
        if (widget) widget.pause();
        else state(false);
      } else if (fallbackActive && !ready) {
        activateFallback(true);
      } else {
        startPlayback();
      }
    });
    spectrum.addEventListener("click", (e) => {
      if (!duration || !widget || dragging) return;
      const rect = spectrum.getBoundingClientRect();
      if (!rect || !rect.width) return;
      const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const ratio = clickX / rect.width;
      const targetMs = Math.round(ratio * duration);
      position(targetMs);
      widget.seekTo(targetMs);
    });

    // Relic Mode & Cathode Ray Oscilloscope Engine
    let relicModeActive = false;
    let crtMode = "wave";
    let crtPhosphor = "green";
    let crtAnimId = null;

    const relicBtn = root.querySelector(".relic-mode-btn");
    const crtBox = root.querySelector(".relic-crt");
    const canvas = root.querySelector(".relic-canvas");
    const modeTag = root.querySelector(".crt-mode-tag");
    const modeBtns = root.querySelectorAll ? Array.from(root.querySelectorAll(".crt-opt-btn")) : [];
    const colorBtns = root.querySelectorAll ? Array.from(root.querySelectorAll(".crt-color-btn")) : [];

    const phosphorThemes = {
      green: { beam: "#ffffff", glow: "#00ff66", bg: "rgba(3, 10, 6, 0.24)", tag: "P31 GREEN PHOSPHOR" },
      amber: { beam: "#ffffff", glow: "#ffaa33", bg: "rgba(12, 7, 2, 0.24)", tag: "P3 AMBER PHOSPHOR" },
      silver: { beam: "#ffffff", glow: "#f0f0f0", bg: "rgba(8, 8, 8, 0.24)", tag: "P4 WHITE PHOSPHOR" }
    };

    function updateModeTag() {
      if (!modeTag) return;
      const modeNames = {
        wave: "OSCILLOSCOPE: TIME DOMAIN",
        lissajous: "PHASE SPACE: LISSAJOUS X-Y",
        spectrum: "FREQUENCY: CRT BARS"
      };
      modeTag.textContent = modeNames[crtMode] || "OSCILLOSCOPE";
    }

    function drawCrt() {
      if (!relicModeActive || !canvas || !canvas.getContext) return;
      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;
      const cy = h / 2;
      const theme = phosphorThemes[crtPhosphor] || phosphorThemes.green;

      // Persistence decay wipe
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, w, h);

      const noise = (Math.random() - 0.5) * (isPlaying ? 2.5 : 0.8);
      const t = (currentMs / 1000) * 3.2;

      ctx.save();
      ctx.shadowColor = theme.glow;
      ctx.shadowBlur = isPlaying ? 14 : 7;
      ctx.strokeStyle = theme.glow;
      ctx.fillStyle = theme.glow;

      if (crtMode === "wave") {
        ctx.lineWidth = isPlaying ? 2.4 : 1.6;
        ctx.beginPath();
        for (let x = 0; x < w; x += 2) {
          const normX = x / w;
          let y = cy + noise;
          if (isPlaying) {
            const bass = Math.sin(t * 5.5 + normX * 8) * 26;
            const mid = Math.sin(t * 13 + normX * 22) * 14;
            const high = Math.sin(t * 26 + normX * 48) * 6;
            const envelope = Math.sin(normX * Math.PI);
            y += (bass + mid + high) * envelope;
          } else {
            y += Math.sin(x * 0.05 + Date.now() * 0.005) * 1.5;
          }
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = theme.beam;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (crtMode === "lissajous") {
        const radiusX = w * 0.36;
        const radiusY = h * 0.38;
        const cx = w / 2;
        const freqA = isPlaying ? 3 : 2;
        const freqB = isPlaying ? 4 : 3;
        const phase = isPlaying ? t * 1.3 : Date.now() * 0.001;
        const rot = isPlaying ? t * 0.2 : 0;

        ctx.lineWidth = 2;
        ctx.beginPath();
        const steps = 180;
        for (let i = 0; i <= steps; i++) {
          const theta = (i / steps) * Math.PI * 2;
          const lx = Math.sin(freqA * theta + phase) * radiusX;
          const ly = Math.cos(freqB * theta) * radiusY;
          const rx = lx * Math.cos(rot) - ly * Math.sin(rot) + cx;
          const ry = lx * Math.sin(rot) + ly * Math.cos(rot) + cy + noise;
          if (i === 0) ctx.moveTo(rx, ry);
          else ctx.lineTo(rx, ry);
        }
        ctx.stroke();

        ctx.strokeStyle = theme.beam;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (crtMode === "spectrum") {
        const barCount = 32;
        const barWidth = Math.floor(w / barCount) - 3;
        const startX = Math.floor((w - barCount * (barWidth + 3)) / 2);

        for (let i = 0; i < barCount; i++) {
          const x = startX + i * (barWidth + 3);
          let barHeight = 6;
          if (isPlaying) {
            const harmonic = Math.sin(t * 3.8 + i * 0.45) * 0.5 + 0.5;
            const bassKick = i < 8 ? Math.abs(Math.sin(t * 7.5)) * 40 : 0;
            const midEnergy = i >= 8 && i < 22 ? Math.abs(Math.cos(t * 11 + i)) * 28 : 0;
            const highShimmer = i >= 22 ? Math.abs(Math.sin(t * 16 - i)) * 16 : 0;
            barHeight = Math.min(h - 22, Math.max(6, harmonic * 40 + bassKick + midEnergy + highShimmer));
          } else {
            barHeight = 4 + Math.sin(i * 0.4 + Date.now() * 0.003) * 2;
          }
          const y = h - 14 - barHeight;

          ctx.fillStyle = theme.glow;
          ctx.fillRect(x, y, barWidth, barHeight);

          ctx.fillStyle = theme.beam;
          ctx.fillRect(x, y, barWidth, 2);
        }
      }

      ctx.restore();

      if (relicModeActive && typeof requestAnimationFrame !== "undefined") {
        crtAnimId = requestAnimationFrame(drawCrt);
      }
    }

    function setRelicMode(active) {
      relicModeActive = active;
      if (relicBtn) relicBtn.setAttribute("aria-pressed", String(active));
      if (crtBox) crtBox.setAttribute("aria-hidden", String(!active));
      root.classList.toggle("is-relic-mode", active);
      if (typeof document !== "undefined" && document.body) {
        document.body.classList.toggle("relic-mode-active", active);
      }

      if (active) {
        if (!crtAnimId && typeof requestAnimationFrame !== "undefined") {
          crtAnimId = requestAnimationFrame(drawCrt);
        }
      } else {
        if (crtAnimId && typeof cancelAnimationFrame !== "undefined") {
          cancelAnimationFrame(crtAnimId);
          crtAnimId = null;
        }
      }
    }

    if (relicBtn) {
      relicBtn.addEventListener("click", () => {
        setRelicMode(!relicModeActive);
      });
    }

    if (modeBtns && modeBtns.length) {
      modeBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          modeBtns.forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          crtMode = btn.getAttribute("data-crt-mode") || "wave";
          updateModeTag();
        });
      });
    }

    if (colorBtns && colorBtns.length) {
      colorBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          colorBtns.forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          crtPhosphor = btn.getAttribute("data-phosphor") || "green";
          root.classList.remove("crt-amber", "crt-silver");
          if (crtPhosphor === "amber") root.classList.add("crt-amber");
          else if (crtPhosphor === "silver") root.classList.add("crt-silver");
        });
      });
    }

    if (canvas) {
      canvas.addEventListener("click", (e) => {
        if (!duration || !widget || dragging) return;
        const rect = canvas.getBoundingClientRect();
        if (!rect || !rect.width) return;
        const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const ratio = clickX / rect.width;
        const targetMs = Math.round(ratio * duration);
        position(targetMs);
        widget.seekTo(targetMs);
      });
    }
    seek.addEventListener("input", () => {
      dragging = true;
      current.textContent = format((Number(seek.value) / 1000) * duration);
      seek.setAttribute(
        "aria-valuetext",
        current.textContent + " of " + format(duration),
      );
    });
    seek.addEventListener("change", () => {
      if (ready && duration)
        widget.seekTo((Number(seek.value) / 1000) * duration);
      dragging = false;
    });
    seek.addEventListener("blur", () => {
      dragging = false;
    });
    volume.addEventListener("input", () => {
      if (ready) widget.setVolume(Number(volume.value));
    });
    window.addEventListener(
      "pagehide",
      () => {
        clearTimeout(timeout);
        if (widget) {
          widget.pause();
          players.delete(widget);
        }
      },
      { once: true },
    );
  }
  window.SaintPlayer = { mount, format, soundcloudUrl, api };
})();
