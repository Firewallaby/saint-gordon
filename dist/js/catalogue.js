/* Release ordering is shared by the homepage and archive. */
(function (root) {
  "use strict";
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const parsed = new Date(value + "T12:00:00Z");
    return !isNaN(parsed) && parsed.toISOString().slice(0, 10) === value;
  }
  function order(tracks) {
    const releases = tracks.filter((track) => !track.placeholder);
    const placeholders = tracks.filter((track) => track.placeholder);
    // Saved catalogue is newest-first; live playlist is reversed before merging.
    return [...releases, ...placeholders];
  }
  function fragments(tracks, featuredSlug, preferredSlugs = []) {
    const available = tracks.filter(
      (track) => !track.placeholder && track.slug !== featuredSlug,
    );
    const preferred = [...new Set(preferredSlugs)]
      .map((slug) => available.find((track) => track.slug === slug))
      .filter(Boolean);
    return [
      ...preferred,
      ...available.filter((track) => !preferred.includes(track)),
    ].slice(0, 3);
  }
  root.SaintCatalogue = { order, validDate, fragments };
})(typeof window === "undefined" ? globalThis : window);
