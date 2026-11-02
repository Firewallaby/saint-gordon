# Saint Gordon Collective — A Digital Relic

A portable, build-free website made with vanilla HTML, CSS and JavaScript. No npm, framework, API key, database, remote fonts or runtime dependencies beyond the official SoundCloud player and Widget API.

## Update music automatically — no API key

You have three automated ways to keep the site updated with SoundCloud releases:

1. **Instant Manual Sync**: Double-click **Update Music.command** in this folder (or run `python3 scripts/update_soundcloud.py`). It fetches the playlist, downloads missing artwork, updates `js/soundcloud-data.js`, refreshes `dist/`, and creates a backup.
2. **Background Watcher**: Run `python3 scripts/update_soundcloud.py --watch` (or with `--interval 15` for 15 minutes). It runs continuously and automatically syncs whenever you upload a new track to SoundCloud.
3. **macOS System Service**: Run `bash scripts/install_autoupdater.sh` to install a background `launchd` service that checks SoundCloud every 30 minutes silently. Run with `--uninstall` to remove it.
4. **Dynamic In-Browser Sync**: Visitors opening the site automatically query the live SoundCloud playlist in the background. Newly discovered releases appear in the carousel and collection without requiring a site rebuild, and are cached in browser `localStorage`.
5. **GitHub Actions**: If hosted on GitHub, `.github/workflows/autoupdate.yml` automatically checks SoundCloud every 6 hours and commits new tracks/artwork.

The updater reads the public playlist, resolves every track through SoundCloud's public oEmbed service, and includes only uploads attributed to `https://soundcloud.com/ceannairefr`. Playlist bottom becomes latest. It downloads available artwork, preserves supplied local artwork and custom notes, and generates `js/soundcloud-data.js`. The carousel, archive and song pages follow automatically. Private entries requiring secret links are not requested. Reposts or other uploaders are excluded.

After it finishes, refresh your local preview. It also updates `dist/` and the portable ZIP. **A hosted site still needs the refreshed dist folder uploaded**; this script does not have hosting credentials or publish online.

It reads the public page's embedded playlist data, not private API endpoints or extracted API credentials. If SoundCloud changes its public page format, blocks access, or a track cannot be resolved, the fetch stage stops before changing the catalogue. This is a practical no-key updater, not a guarantee against third-party outages. Backups are in `.update-backups/`. `python3 scripts/update_soundcloud.py --check` validates the complete import without writing files.

Edit notes/artwork in `js/tracks.js` using JSON syntax (quoted keys, no trailing commas), then rerun the updater. Artist profiles remain in `js/artists.js`. Do not edit generated `js/soundcloud-data.js` directly. Once generated data exists, incomplete browser-widget responses cannot overwrite it.

## Edit the pages

Open this folder in a plain-text/code editor. Edit the source files in the top-level folder, not `dist`:

- Main page wording: `js/content.js`, grouped by Home, Archive, About and Contact. Change the quoted text; use `\n` for a new line. HTML files hold the layout and fallback copy.
- Songs, artwork paths and social links: `js/tracks.js`. Add Instagram under `socialLinks` using the example below. Until then the contact page clearly labels it “Link coming soon”.
- Fonts, sizes, spacing and colours: `css/style.css`.
- Images: put files in `assets/artwork/` and change the relevant image path.

Save, then refresh your browser. If an older version remains, hard refresh (Command–Shift–R on Mac). There is no built-in visual editor. The `dist` folder and ZIP are deployment copies; regenerate those after editing if you use them to publish.

## Open it

Open `index.html` in a browser. Navigation and the catalogue work directly under `file://`; there are no fetched JSON files or JavaScript modules. SoundCloud may block local-file origins, browser privacy protections or third-party cookies. If playback does not connect, use the visible official player or SoundCloud link. For a more reliable preview, serve this directory with any static server, for example `python3 -m http.server 8765`, and open `http://localhost:8765`.

## What is connected

- Profile: https://soundcloud.com/ceannairefr
- Playlist: https://soundcloud.com/ceannairefr/sets/saint-gordon-pieces
- Individual tracks: 13 real titles and URLs verified manually from the supplied official playlist on 9 October 2026. These form the local fallback; live playlist metadata is merged on page load using the official Widget API. Release dates are omitted unless verified. Credits and liner notes are pending. Abandonment is featured as the first playlist entry; no claim is made that it is the newest release.
- Artwork: 11 matched covers and one Collective image supplied from the user’s cover-art folder. Optimised local WebP versions preserve the originals. Come Back to Me and Italian retain labelled temporary print studies. The file named FAKE SHIT is used for Feel Alone because the artwork itself says Feel Alone.
- Biography, members, song stories, credits and contact email: pending. No personal or production history has been invented.
- About: based on the supplied direction of raw emotion, creativity and experimentation.

The site reads playlist tracks using the official SoundCloud Widget API `getSounds` method. New entries returned by SoundCloud appear in the carousel, archive and their own song pages (`song.html?track=soundcloud-ID`). Matching local entries retain their artwork, notes and stable links. The bottom playlist entry leads, regardless of upload dates; unknown dates remain hidden. Partial responses retain the known latest saved entry. Nothing is scraped and no API key is needed.

SoundCloud sometimes returns only partial playlist metadata (five complete entries were returned during this preview). Saved tracks are retained. Private, blocked or omitted entries cannot be guaranteed to import automatically; add those manually below. A new page visit checks again. If playback controls have already been used, the page avoids refreshing underneath the listener. No files are rewritten by the browser.

## Artist profiles

Edit `js/artists.js`: each entry in `profiles` has `name`, `role`, `bio`, `portrait`, `expanded` and `links`. The supplied solo portrait appears in the artist sections. The main homepage hero uses the three-person Collective photograph. Replace the template wording with your own. Five named artist templates are included. Saint Gordon opens by default; every profile uses the same compact layout.

## Quickest way to add a song

Open `js/tracks.js`. Paste this immediately after `window.SAINT_TRACKS = [` and change the three values:

```js
{
  slug: "your-new-song",
  title: "Your New Song",
  soundcloudUrl: "https://soundcloud.com/ceannairefr/your-new-song",
},
```

Save and refresh. It gets its own song page and becomes the latest track when dates are incomplete. The carousel automatically includes every release, including the latest track. No separate card editing is needed.

No cover yet? A monochrome “Sound first / Cover art to follow” image appears automatically. Add `artwork: "assets/artwork/your-cover.webp",` when ready. Broken image paths also fall back safely. Artist defaults to Saint Gordon Collective. Dates, notes and credits are optional; keep slugs unique and stable.

The all-works carousel needs no separate editing. It supports swipe, scrolling, keyboard arrows and previous/next buttons.

## Add a release with full details

1. Put the cover in `assets/artwork/`, ideally a square JPG/WebP at 1000–1600 pixels. Use lowercase filenames with hyphens. Optional `artworkThumb` points to a smaller file for archive rows and cards. Set `artworkPlaceholder: false` when supplying a real cover.
2. Open `js/tracks.js` in a text editor. Duplicate one object at the **top** of `window.SAINT_TRACKS` (newest release first).
3. Give it a unique, stable `slug` and fill in these fields:

```js
{
  slug: "your-song-title",
  title: "Your Song Title",
  artist: "Saint Gordon Collective",
  soundcloudUrl: "https://soundcloud.com/your-account/your-track",
  artwork: "assets/artwork/your-song.jpg",
  artworkAlt: "Describe the cover artwork here",
  releaseDate: "2026-10-09",
  placeholder: false,
  artworkPlaceholder: false,
  type: "Single",
  summary: "A short, factual introduction.",
  meaning: "Explain the themes in ordinary modern English.",
  production: "Describe how the song was recorded and produced.",
  story: "Add the artist’s own memories and creative decisions.",
  credits: [
    { role: "Production", name: "Actual contributor name" },
    { role: "Artwork", name: "Actual contributor name" }
  ]
}
```

4. No featured flag is needed. The homepage and archive use the latest track automatically: the bottom of a complete live playlist wins; the saved file uses newest-first order when the live playlist is incomplete or unavailable. Keep that order when dates are unknown. The carousel includes every release automatically.
5. Save and refresh. Link to `song.html?track=your-song-title`. The archive, homepage and related music update together. Keep slugs stable so old links continue working.

Use commas between objects. Use double quotes for strings; escape internal quotes as `\"`, or use curly quotation marks. Use `\n` for paragraph breaks in liner notes. Content is escaped before rendering; HTML in data is treated as text. Empty notes display honest pending messages. An empty track array is supported.

## Profile, playlist, email and members

Edit `window.SAINT_CONFIG` at the top of `js/tracks.js`. Leave absent values empty. Only supplied, valid links appear.

```js
email: "your-real-address@example.com",
socialLinks: [{ label: "Instagram", url: "https://www.instagram.com/your-account/" }],
members: [{ name: "Actual member name", role: "Actual role" }]
```

Replace the examples with real values before saving. Edit `origins` and `philosophy` in the same object. The About statement and homepage introduction are in `js/content.js`.

## Player and limitations

`js/player.js` loads `https://w.soundcloud.com/player/api.js` only if a track has a valid SoundCloud URL. It embeds the official player with autoplay off and listens to READY, PLAY, PAUSE, PLAY_PROGRESS, SEEK, FINISH and ERROR. Duration and position are in milliseconds; volume is 0–100. Seeking uses the official `seekTo` method. Controls remain disabled until the widget is ready and disable again after an error. A timeout provides a clear fallback rather than a permanent loading message. The official player is collapsed by default and accessible through the “Open the SoundCloud player” disclosure; creator attribution and the original track link stay visible.

This is not a restyled iframe, an unofficial stream or a simulated audio player. The waveform-like indicator responds to playback state, not audio amplitude. SoundCloud availability, track privacy, regional limits and browser restrictions still apply. Some mobile browsers control volume at device level. No audio autoplays. Navigation between HTML pages stops playback; there is no persistent cross-page queue. Live playlist updates change the rendered catalogue, not the saved `js/tracks.js` file.

Widget API reference: https://developers.soundcloud.com/docs/api/html5-widget

## Files and design

- `js/content.js`: editable page wording.
- `js/catalogue.js`: newest-release ordering.
- `index.html`: entrance, latest release, selected works, About preview.
- `archive.html`: official playlist and local track catalogue.
- `song.html`: data-driven, directly linkable song template.
- `about.html`: the Collective’s creative direction, origins and members. `manifesto.html` redirects old links.
- `contact.html`: real outbound channels and optional mail link.
- `credits.html`: type, original artwork and playback attribution.
- `css/style.css`: shared design system, responsive rules and reduced motion.
- `js/tracks.js`: all editable catalogue and profile data.
- `js/site.js`: navigation and rendering.
- `js/player.js`: official SoundCloud controller and fallbacks.
- `assets/fonts/`: local OPTI Engravers Old English webfont, source notes, and UnifrakturMaguntia fallback with its SIL OFL license.
- `assets/artwork/`: original placeholder print studies.
- `tests/`: optional development checks, never required to run the site.

Colours are exclusively black, white and neutral grey. Typography combines local blackletter, system sans-serif and monospace. Mobile navigation becomes a collapsible index. Reduced-motion preferences stop animation and smooth scrolling. Native buttons and range inputs provide keyboard controls, with visible focus rings and accessible names. Without JavaScript the navigation and editorial content remain accessible; dynamic music entries need JavaScript.

## Deploy anywhere

Upload the HTML files and the `css`, `js` and `assets` directories together to any basic static host. Put `index.html` at the public root. Preserve directory names and filename case. Query-string song routes require no rewrite rules. HTTPS is recommended for SoundCloud. No build is necessary. Do not upload `tests` unless you want them public.

The optional private Sites deployment uses `dist/`, a plain copy of the HTML files and three asset/code folders. The source of truth remains the root files. `.openai/hosting.json` is hosting metadata and is not needed for ordinary static hosting. To refresh the optional snapshot, copy the root HTML/CSS/JS/assets into `dist/` before republishing. Do not edit the snapshot independently.

## Verification

Run `node tests/player.test.cjs` for dependency-free tests of the custom player with a mocked official API. Run `python3 tests/check_static.py` to check local references, track uniqueness, branding and required files. Neither command installs anything; neither is needed by visitors.

See `TESTING.md` for the checks performed and limits of live verification. New track URLs should be checked in the browser after editing.

## Display font

Engravers Old English uses the bundled OPTI/Castcraft webfont, so visitors need no installed font or external font service. Bold display styling is retained. Source and personal-use provenance are recorded in `assets/fonts/ENGRAVERS-LICENSE-NOTES.md`; the distributor supplied webfont instructions but no separate author license. The openly licensed UnifrakturMaguntia remains the fallback.

The updater versions every script and stylesheet together. Browser widget metadata no longer replaces the saved catalogue: run the updater to refresh music. If an already-open tab shows old content, refresh it or reopen the homepage.
