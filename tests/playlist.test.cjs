const assert = require("node:assert/strict");
require("../js/catalogue.js");
require("../js/playlist-sync.js");
const saved = [
  {
    slug: "saved",
    soundcloudUrl: "https://soundcloud.com/artist/song",
    artwork: "assets/artwork/a.webp",
    story: "My notes",
  },
  { slug: "omitted", soundcloudUrl: "https://soundcloud.com/artist/omitted" },
];
const live = [
  {
    id: 123,
    permalink_url: "https://soundcloud.com/artist/song",
    title: "Song",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 456,
    permalink_url: "https://soundcloud.com/artist/new",
    title: "New",
    created_at: "2026-02-01T00:00:00Z",
  },
  { id: 789 },
];
const result = globalThis.SaintPlaylist.merge(live, saved);
assert.equal(result.length, 3);
assert.equal(result[2].slug, "soundcloud-456");
assert.equal(result[2].artwork, "assets/artwork/cover-placeholder.svg");
assert.equal(result[0].story, "My notes");
assert.equal(result[0].slug, "saved");
assert.equal(result[1].slug, "omitted");
assert.equal(
  globalThis.SaintPlaylist.merge(
    [{ id: 7, permalink_url: "javascript:alert(1)" }],
    [],
  ).length,
  0,
);
console.log(
  "PASS: live additions, newest first, stable links, retained notes/art, partial metadata and unsafe URLs.",
);

const full = globalThis.SaintPlaylist.merge(live.slice(0, 2), saved);
assert.equal(full[0].slug, "soundcloud-456");
const protectedLatest = globalThis.SaintPlaylist.merge([live[1]], saved);
assert.equal(protectedLatest[0].slug, "saved");
// Bottom position wins even if its upload timestamp is older.
live[1].created_at = "2020-01-01T00:00:00Z";
assert.equal(
  globalThis.SaintPlaylist.merge(live.slice(0, 2), saved)[0].slug,
  "soundcloud-456",
);
console.log("PASS: bottom-of-playlist precedence and known-latest protection.");
