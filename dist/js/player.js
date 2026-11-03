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
    host.innerHTML = `<section class="player" aria-label="Music player for ${escape(track.title)}"><div class="player-top"><span>SAINT GORDON / AUDIO DECK</span><span class="signal" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span></div><div class="player-main"><button class="play-button"${url ? "" : " disabled"} aria-label="Play ${escape(track.title)}" aria-pressed="false"><span class="play-icon" aria-hidden="true"></span></button><div><input class="seek" type="range" min="0" max="1000" value="0" step="1" disabled aria-label="Playback position" aria-valuetext="0:00"><div class="player-times"><span class="current">0:00</span><span class="duration">--:--</span></div></div></div><div class="player-spectrum" aria-hidden="true">${spectrumBars}</div><label class="player-volume">VOLUME <input class="volume" type="range" min="0" max="100" value="80" disabled aria-label="Volume"></label><p class="player-status" role="status">${url ? "Connecting to SoundCloud…" : "Audio unavailable — a SoundCloud track has not been supplied."}</p>${url ? `<p class="attribution">${escape(track.artist)} · <a href="${escape(attributionUrl)}" target="_blank" rel="noopener noreferrer">Listen on SoundCloud</a></p><iframe class="player-source" title="SoundCloud audio source: ${escape(track.title)}" src="${widgetUrl}" aria-hidden="true" tabindex="-1" allow="autoplay"></iframe><iframe class="player-fallback" title="SoundCloud fallback: ${escape(track.title)}" aria-hidden="true" tabindex="-1" allow="autoplay"></iframe>` : ""}</section>`;
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
