/* Read playlist metadata through SoundCloud's documented Widget API only.
 * No scraping, private API, API key or audio extraction.
 */
(function (root) {
  "use strict";
  function trackUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && u.hostname === "soundcloud.com"
        ? u.href.replace(/\/$/, "")
        : "";
    } catch (_) {
      return "";
    }
  }
  function merge(sounds, saved) {
    const incoming = sounds
      .filter((s) => s && s.id && trackUrl(s.permalink_url))
      .map((sound) => {
        const local =
          saved.find(
            (t) => trackUrl(t.soundcloudUrl) === trackUrl(sound.permalink_url),
          ) || {};
        const stamp = sound.release_date || sound.created_at;
        const parsed = stamp ? new Date(stamp) : null;
        const releaseDate =
          parsed && !isNaN(parsed)
            ? parsed.toISOString().slice(0, 10)
            : local.releaseDate || "";
        const cdnArt = sound.artwork_url
          ? sound.artwork_url.replace(/-large\./, "-t500x500.")
          : "";
        const artwork =
          local.artwork &&
          local.artwork !== "assets/artwork/cover-placeholder.svg"
            ? local.artwork
            : cdnArt || local.artwork || "assets/artwork/cover-placeholder.svg";
        const artworkPlaceholder =
          local.artworkPlaceholder !== undefined
            ? local.artworkPlaceholder
            : !artwork || artwork === "assets/artwork/cover-placeholder.svg";
        return {
          ...local,
          soundcloudId: sound.id || local.soundcloudId,
          slug: local.slug || "soundcloud-" + sound.id,
          title: sound.title || local.title || "Untitled track",
          artist:
            sound.user?.username || local.artist || "Saint Gordon Collective",
          soundcloudUrl: trackUrl(sound.permalink_url),
          releaseDate,
          artwork,
          artworkThumb: local.artworkThumb || artwork,
          artworkPlaceholder,
          summary:
            local.summary &&
            local.summary !== "From the Saint Gordon Collective playlist."
              ? local.summary
              : (sound.description && sound.description.trim()) ||
                (local.summary !== "From the Saint Gordon Collective playlist."
                  ? local.summary
                  : "") ||
                "",
        };
      });
    // Widgets can return only part of a playlist's metadata. Retain saved
    // releases instead of dropping them when SoundCloud omits an item.
    const known = new Set(
      incoming.map((track) => trackUrl(track.soundcloudUrl)),
    );
    const complete =
      sounds.length > 0 &&
      incoming.length === sounds.length &&
      (!saved.length || known.has(trackUrl(saved[0].soundcloudUrl)));
    if (complete) {
      // This playlist appends new releases at the bottom.
      return [
        ...incoming.reverse(),
        ...saved.filter((track) => !known.has(trackUrl(track.soundcloudUrl))),
      ];
    }
    // A partial widget response cannot establish the playlist's bottom track.
    // Refresh metadata without replacing the known latest release.
    const updates = new Map(
      incoming.map((track) => [trackUrl(track.soundcloudUrl), track]),
    );
    const savedUrls = new Set(
      saved.map((track) => trackUrl(track.soundcloudUrl)),
    );
    return [
      ...saved.map(
        (track) => updates.get(trackUrl(track.soundcloudUrl)) || track,
      ),
      ...incoming
        .reverse()
        .filter((track) => !savedUrls.has(trackUrl(track.soundcloudUrl))),
    ];
  }
  function getCached() {
    try {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem("saint_dynamic_tracks");
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }
  function setCached(tracks) {
    try {
      if (typeof localStorage !== "undefined" && Array.isArray(tracks)) {
        localStorage.setItem("saint_dynamic_tracks", JSON.stringify(tracks));
      }
    } catch (_) {}
  }
  function load(playlistUrl, saved) {
    return new Promise((resolve) => {
      if (!trackUrl(playlistUrl)) return resolve(null);
      if (typeof document === "undefined") return resolve(null);
      let frame = document.querySelector("#playlist iframe");
      let created = false;
      if (!frame) {
        frame = document.createElement("iframe");
        frame.style.position = "absolute";
        frame.style.width = "0";
        frame.style.height = "0";
        frame.style.border = "none";
        frame.style.visibility = "hidden";
        frame.setAttribute("aria-hidden", "true");
        frame.tabIndex = -1;
        frame.src =
          "https://w.soundcloud.com/player/?url=" +
          encodeURIComponent(playlistUrl) +
          "&auto_play=false&show_user=false";
        document.body.appendChild(frame);
        created = true;
      }
      let finished = false;
      const finish = (result) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (created && frame.parentNode) {
          try {
            frame.parentNode.removeChild(frame);
          } catch (_) {}
        }
        resolve(result);
      };
      const timer = setTimeout(() => finish(null), 12000);
      if (!root.SaintPlayer || typeof root.SaintPlayer.api !== "function") {
        return finish(null);
      }
      root.SaintPlayer.api()
        .then((SC) => {
          const widget = SC.Widget(frame);
          widget.bind(SC.Widget.Events.READY, () => {
            widget.getSounds((sounds) => {
              const tracks = Array.isArray(sounds) ? merge(sounds, saved || []) : [];
              finish(tracks.length ? tracks : null);
            });
          });
          widget.bind(SC.Widget.Events.ERROR, () => finish(null));
        })
        .catch(() => finish(null));
    });
  }
  function sync(playlistUrl, saved) {
    return load(playlistUrl, saved).then((updated) => {
      if (Array.isArray(updated) && updated.length > 0) {
        setCached(updated);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("saint:tracks-updated", {
              detail: { tracks: updated },
            }),
          );
        }
        return updated;
      }
      return saved;
    });
  }
  root.SaintPlaylist = { load, merge, sync, getCached, setCached };
})(typeof window === "undefined" ? globalThis : window);
