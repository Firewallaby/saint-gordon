# Verification — 9 October 2026

## Automated checks

- All local HTML links and assets resolve; image alt attributes and main landmarks exist.
- JavaScript syntax passes for all three source files.
- Track slugs are unique and artwork exists.
- The full brand name is used throughout visible pages.
- Mocked SoundCloud tests pass: missing/unsafe URL, no autoplay, READY, play, pause, progress, seeking, volume, finish, errors, blocked API and timeout.

## Browser checks

- Homepage, archive, song, About, Contact and credits render.
- Archive and related links route to individual song pages.
- Unknown slugs display a useful not-found message and archive link.
- Menu opens on mobile and closes with Escape; aria-expanded and navigation visibility update.
- At 320, 390, 768 and 1440 CSS pixels, checked pages have no horizontal document overflow.
- All 13 track titles and original URLs were read from the user-supplied official playlist and saved into the local data file. No runtime scraper or private API is used.
- Official playlist loaded all 13 entries and responded to track selections.
- The custom player loaded Abandonment and retrieved its 2:20 duration from the official Widget API.
- The site’s own palette and embedded artwork are monochrome. Reduced-motion CSS disables the decorative animation and smooth scrolling.

## Limits

Eleven supplied covers and a Collective image have been integrated. Come Back to Me and Italian retain clearly labelled temporary artwork. Release dates, biographies, individual song notes and full contributor credits remain pending. Playlist order is not treated as release chronology; the homepage says Featured track.

Live player checks: custom play and pause states synchronized with the official widget; keyboard seeking changed the position to 0:14, and keyboard volume changed from 80 to 79. Continuous audible playback and advancing playback time were not confirmed in this browser session. Audio fidelity cannot be assessed from browser state. Device-specific volume behavior and regional/private-track playback restrictions remain SoundCloud/browser concerns. No cross-page playback is provided.

## Follow-up interface changes

SoundCloud fallback is collapsed by default; expansion and collapse were verified in the browser while the custom player still reached READY. The homepage statement precedes The Signal, the hero overlay is removed, and Fragments excludes the featured slug. Unverified dates are omitted across all views. Contact Us includes the supplied SoundCloud profile. Engravers Old English is preferred locally, but an embeddable font file is still needed for consistent rendering on other devices.

## Editing and latest-release update — 10 October 2026

`node tests/catalogue.test.cjs` checks complete and partial dates, impossible dates, empty data, placeholders, and preservation of input order. The legacy featured flag no longer controls the homepage. Page copy is plain text from `js/content.js`; no HTML input is interpreted.

## Live playlist, carousel and artists — 10 October 2026

The live preview imported five complete playlist entries and their dates through Widget API getSounds. Partial responses now preserve saved catalogue entries. Automated merge checks cover new tracks, ordering, partial metadata, unsafe URLs, stable slugs and local notes/artwork. Browser checks confirmed the supplied artist portrait, horizontal carousel button movement, no page overflow at the preview width, and expandable artist profiles. No autoplay was used. Artist biography/role fields deliberately remain templates. Full automatic import of metadata omitted by SoundCloud cannot be verified or guaranteed.

The homepage hero was restored to the three-person Collective photograph; the solo portrait remains exclusive to artist profiles.
