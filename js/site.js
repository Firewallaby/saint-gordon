(function () {
  "use strict";
  document.body.classList.add("js");
  const config = window.SAINT_CONFIG || {};
  const localTracks = window.SAINT_TRACKS || [];
  function prepareTracks(rawList) {
    return window.SaintCatalogue.order(
      (rawList || localTracks).map((track) => {
        const local = localTracks.find(
          (item) => item.slug === track.slug || (track.soundcloudId && item.soundcloudId === track.soundcloudId)
        );
        const hasCustomArtwork = Boolean(
          local?.artwork &&
            !local.artworkPlaceholder &&
            local.artwork !== "assets/artwork/cover-placeholder.svg" &&
            !/\/soundcloud-/.test(local.artwork),
        );
        const artistCredits = local?.artistCredits?.length
          ? local.artistCredits
          : track.artistCredits;
        const localOverrides = {};
        [
          "summary",
          "meaning",
          "production",
          "story",
          "spotifyUrl",
          "appleMusicUrl",
        ].forEach((field) => {
          if (local && Object.prototype.hasOwnProperty.call(local, field))
            localOverrides[field] = local[field];
        });
        return {
          ...track,
          ...localOverrides,
          ...(hasCustomArtwork
            ? {
                artwork: local.artwork,
                artworkThumb: local.artworkThumb || local.artwork,
                artworkAlt: local.artworkAlt || track.artworkAlt,
                artworkPlaceholder: false,
              }
            : {}),
          artist: artistCredits?.length
            ? artistCredits.join(", ")
            : "Artist credit needed",
          artistCredits,
          credits: local?.credits?.length ? local.credits : track.credits,
        };
      }),
    );
  }
  const publishedTracks = window.SAINT_SYNCED_TRACKS;
  const canSyncPlaylist = !publishedTracks && config.playlistUrl && window.SaintPlaylist?.sync;
  const cachedDynamic = canSyncPlaylist ? window.SaintPlaylist.getCached() : null;
  let tracks = prepareTracks(publishedTracks || cachedDynamic || localTracks);
  document.querySelectorAll("[data-copy]").forEach((node) => {
    const [section, key] = node.dataset.copy.split(".");
    const value = window.SAINT_CONTENT?.[section]?.[key];
    // Respect direct HTML edits instead of silently replacing them with old copy.
    const normalize = (text) => text.replace(/\s+/g, " ").trim();
    const base = node.dataset.copyBase;
    if (
      typeof value === "string" &&
      (!base || normalize(node.textContent) === normalize(base))
    )
      node.textContent = value;
  });
  const e = (value) =>
    String(value == null ? "" : value).replace(
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
  const hasContent = (value) => {
    if (!value || typeof value !== "string") return false;
    const text = value.trim();
    if (!text) return false;
    const lower = text.toLowerCase();
    if (lower === "notes pending." || lower === "notes pending") return false;
    if (
      lower.includes("not been supplied") ||
      lower.includes("not yet been supplied")
    )
      return false;
    if (text === "From the Saint Gordon Collective playlist.") return false;
    if (
      lower.includes("dm me") ||
      lower.includes("for free mixing") ||
      lower.includes("aspiring artists") ||
      lower.includes("saint gordon has always been") ||
      lower.includes("wanted to make it into a collective")
    )
      return false;
    return true;
  };
  const formatTrackNote = (value) =>
    hasContent(value)
      ? e(value)
          .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
          .replace(/\n/g, "<br>")
      : "";
  const validUrl = (value, soundcloudOnly = false) => {
    try {
      const u = new URL(value);
      return u.protocol === "https:" &&
        (!soundcloudOnly ||
          [
            "soundcloud.com",
            "www.soundcloud.com",
            "on.soundcloud.com",
          ].includes(u.hostname))
        ? u.href
        : "";
    } catch (_) {
      return "";
    }
  };
  const art = (t) => {
    if (!t || !t.artwork) return "assets/artwork/cover-placeholder.svg";
    if (/^(assets\/)[\w/ .-]+\.(svg|png|jpe?g|webp)$/i.test(t.artwork)) {
      return t.artwork;
    }
    try {
      const u = new URL(t.artwork);
      if (
        u.protocol === "https:" &&
        (u.hostname.endsWith(".sndcdn.com") || u.hostname === "soundcloud.com")
      ) {
        return u.href;
      }
    } catch (_) {}
    return "assets/artwork/cover-placeholder.svg";
  };
  const isPlaceholderArt = (t) =>
    t.placeholder ||
    t.artworkPlaceholder ||
    art(t) === "assets/artwork/cover-placeholder.svg";
  // Recover gracefully from a missing/misspelled local artwork filename.
  document.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (image.tagName !== "IMG" || image.dataset.fallbackUsed) return;
      image.dataset.fallbackUsed = "true";
      image.src = "assets/artwork/cover-placeholder.svg";
      image.alt = "Cover art to follow";
    },
    true,
  );
  const thumb = (t) => {
    const raw = t.artworkThumb || t.artwork;
    if (raw && /^(assets\/)[\w/ .-]+\.(svg|png|jpe?g|webp)$/i.test(raw)) {
      return raw;
    }
    try {
      const u = new URL(raw);
      if (
        u.protocol === "https:" &&
        (u.hostname.endsWith(".sndcdn.com") || u.hostname === "soundcloud.com")
      ) {
        return u.href;
      }
    } catch (_) {}
    return art(t);
  };
  const date = (t) =>
    /^\d{4}-\d{2}-\d{2}$/.test(t.releaseDate || "") &&
    !isNaN(Date.parse(t.releaseDate))
      ? new Date(t.releaseDate + "T12:00:00").toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "";
  const link = (t) => "song.html?track=" + encodeURIComponent(t.slug);
  const label = (t) =>
    t.placeholder ? "Placeholder / not a release" : t.type || "Release";
  const creditsFor = (track) => {
    const entries = Array.isArray(track.credits) ? [...track.credits] : [];
    const hasRole = (role) =>
      entries.some((entry) =>
        typeof entry === "string"
          ? entry.toLowerCase().startsWith(role.toLowerCase() + ":")
          : String(entry?.role || "").toLowerCase() === role.toLowerCase(),
      );
    const hasCredit = (role, name) =>
      entries.some((entry) =>
        typeof entry === "string"
          ? entry.toLowerCase() === `${role}: ${name}`.toLowerCase()
          : String(entry?.role || "").toLowerCase() === role.toLowerCase() &&
            String(entry?.name || "").toLowerCase() === name.toLowerCase(),
      );
    const addDefault = (role, name) => {
      if (name && !hasCredit(role, name)) entries.push({ role, name });
    };
    const artistCredits = Array.isArray(track.artistCredits)
      ? track.artistCredits
      : [];
    artistCredits.forEach((name) => addDefault("Artist", name));
    if (!artistCredits.length && !hasRole("Artist"))
      addDefault("Artist", "Artist credit needed");
    if (/Lil Peep Cover/i.test(track.title || ""))
      addDefault("Original Artist", "Lil Peep");
    addDefault("Engineer", "Saint Gordon");
    return entries;
  };
  const card = (t, i) =>
    `<a class="card" href="${link(t)}"><div class="card-art"><img loading="lazy" src="${e(thumb(t))}" alt="${e(isPlaceholderArt(t) ? "Placeholder print study for " + t.title : t.artworkAlt || "Cover artwork for " + t.title)}"></div><div class="micro"><span>FRAGMENT / ${String(tracks.indexOf(t) + 1).padStart(3, "0")}</span>${date(t) ? "<span>" + e(date(t)) + "</span>" : ""}</div><h3>${e(t.title)}</h3><p>${e(label(t))}</p></a>`;
  const menu = document.querySelector(".menu-toggle"),
    nav = document.querySelector("#navigation");
  menu.addEventListener("click", () => {
    const open = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("open", open);
    menu.textContent = open ? "CLOSE −" : "INDEX +";
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      menu.getAttribute("aria-expanded") === "true"
    ) {
      menu.click();
      menu.focus();
    }
  });
  document
    .querySelectorAll("[data-year]")
    .forEach((n) => (n.textContent = new Date().getFullYear()));
  const page = document.body.dataset.page;
  nav.querySelectorAll("a").forEach((a) => {
    if (
      a.getAttribute("href") ===
      (page === "song" ? "collection" : page === "manifesto" ? "about" : page) +
        ".html"
    )
      a.setAttribute("aria-current", "page");
  });
  const profile = validUrl(config.profileUrl, true);
  document.querySelectorAll("[data-profile]").forEach((n) => {
    const links = [];
    if (profile)
      links.push(
        `<a href="${e(profile)}" target="_blank" rel="noopener noreferrer">SoundCloud ↗</a>`,
      );
    const spotify = (config.socialLinks || []).find((s) =>
      /spotify/i.test(s.label),
    );
    if (spotify && validUrl(spotify.url))
      links.push(
        `<a href="${e(validUrl(spotify.url))}" target="_blank" rel="noopener noreferrer">Spotify ↗</a>`,
      );
    const apple = (config.socialLinks || []).find((s) =>
      /apple/i.test(s.label),
    );
    if (apple && validUrl(apple.url))
      links.push(
        `<a href="${e(validUrl(apple.url))}" target="_blank" rel="noopener noreferrer">Apple Music ↗</a>`,
      );
    n.innerHTML = links.join(" ");
  });
  function mountPlayer(node, t) {
    const number = tracks.indexOf(t) + 1;
    window.SaintPlayer.mount(node, t, {
      label: number > 0 ? "FRAGMENT / " + String(number).padStart(3, "0") : "AUDIO DECK",
    });
  }
  function renderMusic() {
    if (page === "index") {
      const featured = tracks.find((track) => !track.placeholder);
      const host = document.querySelector("#featured");
      if (featured) {
        const featStreaming = [
          validUrl(featured.soundcloudUrl)
            ? `<a class="streaming-pill" href="${e(validUrl(featured.soundcloudUrl))}" target="_blank" rel="noopener noreferrer">SoundCloud ↗</a>`
            : "",
          validUrl(
            featured.spotifyUrl ||
              (config.socialLinks || []).find((s) => /spotify/i.test(s.label))
                ?.url,
          )
            ? `<a class="streaming-pill" href="${e(validUrl(featured.spotifyUrl || (config.socialLinks || []).find((s) => /spotify/i.test(s.label))?.url))}" target="_blank" rel="noopener noreferrer">Spotify ↗</a>`
            : "",
          validUrl(
            featured.appleMusicUrl ||
              (config.socialLinks || []).find((s) => /apple/i.test(s.label))
                ?.url,
          )
            ? `<a class="streaming-pill" href="${e(validUrl(featured.appleMusicUrl || (config.socialLinks || []).find((s) => /apple/i.test(s.label))?.url))}" target="_blank" rel="noopener noreferrer">Apple Music ↗</a>`
            : "",
        ]
          .filter(Boolean)
          .join(" ");
        const featBar = featStreaming
          ? `<div class="track-streaming-links micro"><span class="streaming-label">LISTEN:</span> ${featStreaming}</div>`
          : "";
        const summaryMarkup = hasContent(featured.summary)
          ? `<p>${e(featured.summary)}</p>`
          : "";
        host.dataset.featuredSlug = featured.slug || "";
        host.dataset.featuredUrl = featured.soundcloudUrl || "";
        host.innerHTML = `<div class="feature"><a class="feature-art" href="${link(featured)}"><img src="${e(art(featured))}" alt="${e(isPlaceholderArt(featured) ? "Placeholder artwork" : featured.artworkAlt || "Cover artwork for " + featured.title)}"></a><div><span class="badge">${e(label(featured))}</span><h3>${e(featured.title)}</h3><span class="micro">${e(featured.artist)}${date(featured) ? " / " + e(date(featured)) : ""}</span>${summaryMarkup}<div id="featured-player"></div>${featBar}<a class="text-link" href="${link(featured)}">Track details ↗</a></div></div>`;
        mountPlayer(document.querySelector("#featured-player"), featured);
      } else host.innerHTML = "<p>No tracks have been added yet.</p>";
      document.querySelector("#selected").innerHTML =
        tracks
          .filter((t) => !t.placeholder)
          .map(card)
          .join("") || "<p>More works will appear here.</p>";
      window.SaintCarousel.mount(document.querySelector("#selected"));
    }
    if (page === "collection") {
      const playlist = validUrl(config.playlistUrl, true),
        host = document.querySelector("#playlist");
      host.innerHTML = playlist
        ? `<iframe title="Saint Gordon Collective SoundCloud playlist" src="https://w.soundcloud.com/player/?url=${encodeURIComponent(playlist)}&auto_play=false&show_user=true&color=%23303030" allow="autoplay" loading="lazy"></iframe><p class="micro">Playback provided by SoundCloud. <a href="${e(playlist)}" target="_blank" rel="noopener noreferrer">Open the original playlist</a> if the embed cannot load.</p>`
        : '<div class="empty-state"><span class="micro">NO TRANSMISSION CONNECTED</span><p>The official SoundCloud playlist has not been supplied.</p></div>';
      document.querySelector("#track-count").textContent =
        tracks.length +
        " ENTRIES / " +
        tracks.filter((t) => !t.placeholder).length +
        " RELEASES";
      document.querySelector("#catalogue").innerHTML =
        tracks
          .map(
            (t, i) =>
              `<a class="track-row" href="${link(t)}"><span class="micro">${String(tracks.indexOf(t) + 1).padStart(3, "0")}</span><img src="${e(thumb(t))}" alt="" loading="lazy"><div><h3>${e(t.title)}</h3><span class="micro">${e(t.artist)}</span></div><div class="row-end"><span class="badge">${e(label(t))}</span>${t.slug !== "sex-with-my-ex-dakota-violet" && date(t) ? '<div class="micro">' + e(date(t)) + "</div>" : ""}</div></a>`,
          )
          .join("") ||
        '<div class="empty-state">No releases have been added yet.</div>';
    }
    if (page === "song") {
      const slug = new URLSearchParams(location.search).get("track");
      const t = tracks.find(
        (track) =>
          track.slug === slug ||
          String(track.soundcloudId) === slug ||
          track.slug === "soundcloud-" + slug,
      );
      const host = document.querySelector("#song-detail");
      if (!t) {
        if (canSyncPlaylist) {
          document.title = "Locating release — Saint Gordon Collective";
          host.innerHTML =
            '<section class="error-page"><span class="micro">CONNECTING TRANSMISSION</span><h1>Locating release...</h1><p>Checking live SoundCloud playlist for this track...</p></section>';
          window.SaintPlaylist.sync(config.playlistUrl, tracks).then(
            (updated) => {
              const found = (updated || []).find(
                (track) =>
                  track.slug === slug ||
                  String(track.soundcloudId) === slug ||
                  track.slug === "soundcloud-" + slug,
              );
              if (found) {
                tracks = prepareTracks(updated);
                renderMusic();
              } else {
                document.title = "Fragment not found — Saint Gordon Collective";
                host.innerHTML =
                  '<section class="error-page"><span class="micro">ENTRY NOT FOUND</span><h1>Track not found.</h1><p>The track link is incomplete or no longer belongs to the collection.</p><a class="paper-button" href="collection.html">Return to the Collection</a></section>';
              }
            },
          );
          return;
        }
        document.title = "Fragment not found — Saint Gordon Collective";
        host.innerHTML =
          '<section class="error-page"><span class="micro">ENTRY NOT FOUND</span><h1>Track not found.</h1><p>The track link is incomplete or no longer belongs to the collection.</p><a class="paper-button" href="collection.html">Return to the Collection</a></section>';
        return;
      }
      document.title = t.title + " — Saint Gordon Collective";
      document.querySelector("meta[name=description]").content =
        hasContent(t.summary) ? t.summary : t.title + " by " + t.artist;
      const rawMeaning = hasContent(t.meaning)
        ? t.meaning
        : hasContent(t.summary)
          ? t.summary
          : "";
      const sections = [
        ["About the Song", rawMeaning],
        ["The Making Of", t.production],
        ["Behind the Track", t.story],
      ].filter(([_, text]) => hasContent(text));
      const trackCredits = creditsFor(t);
      const artCaption = t.placeholder
        ? "<span>DEMONSTRATION ENTRY</span>"
        : isPlaceholderArt(t)
          ? "<span>TEMPORARY ARTWORK</span>"
          : "";
      const creditsMarkup = trackCredits.length
        ? `<section><h2>Credits</h2><ul>${trackCredits
            .map(
              (credit) =>
                "<li>" +
                e(
                  typeof credit === "string"
                    ? credit
                    : credit.role + ": " + credit.name,
                ) +
                "</li>",
            )
            .join("")}</ul></section>`
        : "";
      const relatedCards =
        tracks
          .filter((track) => track.slug !== t.slug)
          .slice(0, 3)
          .map(card)
          .join("") || "<p>More works will appear here.</p>";
      const streamingLinks = [];
      if (t.soundcloudUrl && validUrl(t.soundcloudUrl)) {
        streamingLinks.push(
          `<a class="streaming-pill" href="${e(validUrl(t.soundcloudUrl))}" target="_blank" rel="noopener noreferrer">SoundCloud ↗</a>`,
        );
      }
      const spotify =
        t.spotifyUrl ||
        (config.socialLinks || []).find((s) => /spotify/i.test(s.label))?.url;
      if (spotify && validUrl(spotify)) {
        streamingLinks.push(
          `<a class="streaming-pill" href="${e(validUrl(spotify))}" target="_blank" rel="noopener noreferrer">Spotify ↗</a>`,
        );
      }
      const appleMusic =
        t.appleMusicUrl ||
        (config.socialLinks || []).find((s) => /apple/i.test(s.label))?.url;
      if (appleMusic && validUrl(appleMusic)) {
        streamingLinks.push(
          `<a class="streaming-pill" href="${e(validUrl(appleMusic))}" target="_blank" rel="noopener noreferrer">Apple Music ↗</a>`,
        );
      }
      const streamingBar = streamingLinks.length
        ? `<div class="track-streaming-links micro"><span class="streaming-label">LISTEN:</span> ${streamingLinks.join(" ")}</div>`
        : "";
      const sectionsMarkup = sections
        .map(
          ([title, text]) =>
            `<section><h2>${title}</h2><p>${formatTrackNote(text)}</p></section>`,
        )
        .join("");
      const linerMarkup =
        sectionsMarkup || creditsMarkup
          ? `<div class="liner">${sectionsMarkup}${creditsMarkup}</div>`
          : "";
      host.innerHTML = `<div class="song-head"><div><span class="badge">${e(label(t))}</span><h1>${e(t.title)}</h1></div><div class="micro">${e(t.artist)}${date(t) ? "<br>" + e(date(t)) : ""}</div></div><div class="song-layout"><div><div class="song-art"><img src="${e(art(t))}" alt="${e(isPlaceholderArt(t) ? "Placeholder print study" : t.artworkAlt || "Cover artwork for " + t.title)}"></div><div class="art-caption micro"><span>FRAGMENT / ${String(tracks.indexOf(t) + 1).padStart(3, "0")}</span>${artCaption}</div><div id="track-player"></div>${streamingBar}</div>${linerMarkup}</div><section class="related"><div class="section-heading"><h2>More tracks</h2><a href="collection.html">The complete collection ↗</a></div><div class="cards">${relatedCards}</div></section>`;
      mountPlayer(document.querySelector("#track-player"), t);
    }
  }
  renderMusic();
  window.addEventListener("saint:tracks-updated", (event) => {
    const updated = event.detail?.tracks;
    if (Array.isArray(updated) && updated.length) {
      tracks = prepareTracks(updated);
      if (page === "collection") {
        const count = document.querySelector("#track-count");
        if (count) {
          count.textContent =
            tracks.length +
            " ENTRIES / " +
            tracks.filter((t) => !t.placeholder).length +
            " RELEASES";
        }
        const catalogue = document.querySelector("#catalogue");
        if (catalogue) {
          catalogue.innerHTML =
            tracks
              .map(
                (t, i) =>
                  `<a class="track-row" href="${link(t)}"><span class="micro">${String(tracks.indexOf(t) + 1).padStart(3, "0")}</span><img src="${e(thumb(t))}" alt="" loading="lazy"><div><h3>${e(t.title)}</h3><span class="micro">${e(t.artist)}</span></div><div class="row-end"><span class="badge">${e(label(t))}</span>${t.slug !== "sex-with-my-ex-dakota-violet" && date(t) ? '<div class="micro">' + e(date(t)) + "</div>" : ""}</div></a>`,
              )
              .join("") ||
            '<div class="empty-state">No releases have been added yet.</div>';
        }
      }
      if (page === "index") {
        const selected = document.querySelector("#selected");
        if (selected) {
          selected.innerHTML =
            tracks
              .filter((t) => !t.placeholder)
              .map(card)
              .join("") || "<p>More works will appear here.</p>";
          window.SaintCarousel.mount(selected);
        }
        const featured = tracks.find((track) => !track.placeholder);
        const host = document.querySelector("#featured");
        const isPlaying = document.querySelector(
          '#featured .is-playing, #featured .player[data-state="buffering"]',
        );
        const sameFeatured =
          featured &&
          host &&
          host.dataset.featuredSlug === (featured.slug || "") &&
          host.dataset.featuredUrl === (featured.soundcloudUrl || "");
        if (featured && host && !isPlaying && !sameFeatured) {
          const oldPlayer = document.querySelector("#featured-player");
          if (oldPlayer && typeof oldPlayer._saintCleanup === "function") {
            oldPlayer._saintCleanup();
          }
          host.dataset.featuredSlug = featured.slug || "";
          host.dataset.featuredUrl = featured.soundcloudUrl || "";
          const featStreaming = [
            validUrl(featured.soundcloudUrl)
              ? `<a class="streaming-pill" href="${e(validUrl(featured.soundcloudUrl))}" target="_blank" rel="noopener noreferrer">SoundCloud ↗</a>`
              : "",
            validUrl(
              featured.spotifyUrl ||
                (config.socialLinks || []).find((s) => /spotify/i.test(s.label))
                  ?.url,
            )
              ? `<a class="streaming-pill" href="${e(validUrl(featured.spotifyUrl || (config.socialLinks || []).find((s) => /spotify/i.test(s.label))?.url))}" target="_blank" rel="noopener noreferrer">Spotify ↗</a>`
              : "",
            validUrl(
              featured.appleMusicUrl ||
                (config.socialLinks || []).find((s) => /apple/i.test(s.label))
                  ?.url,
            )
              ? `<a class="streaming-pill" href="${e(validUrl(featured.appleMusicUrl || (config.socialLinks || []).find((s) => /apple/i.test(s.label))?.url))}" target="_blank" rel="noopener noreferrer">Apple Music ↗</a>`
              : "",
          ]
            .filter(Boolean)
            .join(" ");
          const featBar = featStreaming
            ? `<div class="track-streaming-links micro"><span class="streaming-label">LISTEN:</span> ${featStreaming}</div>`
            : "";
          const summaryMarkup = hasContent(featured.summary)
            ? `<p>${e(featured.summary)}</p>`
            : "";
          host.innerHTML = `<div class="feature"><a class="feature-art" href="${link(featured)}"><img src="${e(art(featured))}" alt="${e(isPlaceholderArt(featured) ? "Placeholder artwork" : featured.artworkAlt || "Cover artwork for " + featured.title)}"></a><div><span class="badge">${e(label(featured))}</span><h3>${e(featured.title)}</h3><span class="micro">${e(featured.artist)}${date(featured) ? " / " + e(date(featured)) : ""}</span>${summaryMarkup}<div id="featured-player"></div>${featBar}<a class="text-link" href="${link(featured)}">Track details ↗</a></div></div>`;
          mountPlayer(document.querySelector("#featured-player"), featured);
        }
      }
    }
  });
  if (canSyncPlaylist) {
    setTimeout(() => {
      window.SaintPlaylist.sync(config.playlistUrl, tracks);
    }, 1500);
    setInterval(() => {
      window.SaintPlaylist.sync(config.playlistUrl, tracks);
    }, 5 * 60 * 1000);
  }
  if (page === "manifesto") {
    document.querySelector("#origins").textContent =
      config.origins || "Biography pending.";
  }
  const artistHost = document.querySelector("#artist-profiles");
  if (artistHost) {
    const artists = window.SAINT_ARTISTS || {};

    const artistLinks = (artist) =>
      (artist.links || [])
        .filter((item) => validUrl(item.url))
        .map(
          (item) =>
            `<a href="${e(validUrl(item.url))}" target="_blank" rel="noopener noreferrer">${e(item.label)} ↗</a>`,
        )
        .join("");
    artistHost.innerHTML = `<div class="artist-accordion">${(
      artists.profiles || []
    )
      .map(
        (artist) => `
      <details class="artist-profile" ${artist.expanded ? "open" : ""}>
        <summary>${e(artist.name)}<span aria-hidden="true" class="artist-expand">+</span></summary>
        <div class="artist-profile-body">
          ${artist.portrait ? `<img src="${e(art({ artwork: artist.portrait }))}" alt="Portrait of ${e(artist.name)}">` : '<div class="artist-portrait-placeholder"><span class="micro">PORTRAIT TO FOLLOW</span></div>'}
          <div><h4>Role</h4><p>${e(artist.role)}</p><h4>About</h4><p>${e(artist.bio)}</p><h4>Links</h4><div class="artist-links">${artistLinks(artist) || "<p><em>links coming soon</em></p>"}</div></div>
        </div>
      </details>`,
      )
      .join("")}</div>`;
  }
  if (page === "contact") {
    const entries = [];
    if (config.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email))
      entries.push(
        `<a href="mailto:${e(config.email)}">${e(config.email)} ↗</a>`,
      );
    if (profile)
      entries.push(
        `<a href="${e(profile)}" target="_blank" rel="noopener noreferrer">Saint Gordon on SoundCloud ↗</a>`,
      );
    (config.socialLinks || []).forEach((s) => {
      const url = validUrl(s.url);
      if (url)
        entries.push(
          `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(s.label)} ↗</a>`,
        );
    });
    document.querySelector("#contact-links").innerHTML =
      entries.join("") || "<p>Contact details have not yet been supplied.</p>";
    if (
      !(config.socialLinks || []).some(
        (s) => /instagram/i.test(s.label) && validUrl(s.url),
      )
    ) {
      document
        .querySelector("#contact-links")
        .insertAdjacentHTML(
          "beforeend",
          '<p class="channel-unavailable"><span>Instagram</span><small>Link coming soon</small></p>',
        );
    }
    const contactForm = document.querySelector("#contact-form");
    const contactDialog = document.querySelector("#contact-dialog");
    contactForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (contactForm.reportValidity()) contactDialog.showModal();
    });
    contactDialog
      ?.querySelector("[data-close-contact-dialog]")
      .addEventListener("click", () => contactDialog.close());
    contactDialog?.addEventListener("click", (event) => {
      if (event.target === contactDialog) contactDialog.close();
    });
  }
})();
