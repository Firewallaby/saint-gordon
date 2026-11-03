#!/usr/bin/env python3
"""Key-free, on-demand public playlist import. Python 3 standard library only."""
import argparse
import datetime
import json
import re
import shutil
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROFILE = 'https://soundcloud.com/ceannairefr'
PLAYLIST = PROFILE + '/sets/saint-gordon-pieces'


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'SaintGordonSiteUpdater/1.0', 'Accept': '*/*'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


def assignment(text, name):
    match = re.search(re.escape(name) + r'\s*=\s*', text)
    if not match:
        return []
    return json.JSONDecoder().raw_decode(text[match.end():])[0]


def playlist_ids(html):
    data = assignment(html, 'window.__sc_hydration')
    playlists = [item['data'] for item in data if item.get('hydratable') == 'playlist']
    playlist = next((p for p in playlists if p.get('permalink_url') == PLAYLIST), None)
    if not playlist or playlist.get('sharing') != 'public':
        raise ValueError('The public playlist could not be read. No site files changed.')
    tracks = playlist.get('tracks', [])
    if not tracks or len(tracks) != playlist.get('track_count'):
        raise ValueError('SoundCloud returned an incomplete playlist. No site files changed.')
    if any(not isinstance(t.get('id'), int) for t in tracks):
        raise ValueError('Playlist track IDs are incomplete.')
    return tracks


def split_artist_names(value):
    value = re.split(r"\s+(?:mixed|engineered|produced)\s+by\b", value, maxsplit=1, flags=re.I)[0]
    value = re.split(r"[\n.;!?]", value, maxsplit=1)[0]
    value = re.sub(r"\s*[-–—]\s*(?:cover|version)\b.*$", "", value, flags=re.I)
    return [name.strip(" \t:;()[]") for name in re.split(r"\s*(?:,|&|\band\b)\s*", value, flags=re.I) if name.strip(" \t:;()[]")]


def infer_artist_credits(title, description, local):
    existing = local.get('artistCredits')
    if isinstance(existing, list) and existing:
        return existing

    names = []
    featured = re.search(r"\bfeat(?:uring)?\.?\s+(.+?)(?:\)|$)", title or '', re.I)
    if featured:
        names.extend(split_artist_names(featured.group(1)))

    patterns = (
        (r"\b(?:artists?|performers?|vocals?)\s*:\s*([^\n.!?]+)", True),
        (r"\b(?:cover|song|track|performed|sung|vocals?)\s+by\s+([^,\n.!?]+)", False),
        (r"(?:^|\n)\s*by\s+([^,\n.!?]+)", False),
    )
    for pattern, is_list in patterns:
        for match in re.finditer(pattern, description or '', re.I):
            if is_list:
                names.extend(split_artist_names(match.group(1)))
            else:
                names.append(match.group(1).strip(" \t:;()[]"))

    unique = []
    seen = set()
    for name in names:
        if name and name.casefold() not in seen:
            unique.append(name)
            seen.add(name.casefold())
    return unique


def build():
    saved = assignment((ROOT / 'js/tracks.js').read_text(), 'window.SAINT_TRACKS')
    generated = ROOT / 'js/soundcloud-data.js'
    previous = assignment(generated.read_text(), 'window.SAINT_SYNCED_TRACKS') if generated.exists() else []
    all_saved = saved + previous
    remote = playlist_ids(fetch(PLAYLIST).decode('utf-8'))
    output, artwork = [], {}
    for index, item in enumerate(reversed(remote), 1):
        track_id = item['id']
        embed_url = 'https://api.soundcloud.com/tracks/' + str(track_id)
        public = json.loads(fetch('https://soundcloud.com/oembed?' + urllib.parse.urlencode({'format': 'json', 'url': embed_url})))
        # oEmbed is requested without a secret token or authentication. Only
        # embeds attributed to this exact uploader are allowed into the site.
        if public.get('author_url', '').rstrip('/') != PROFILE:
            print('Skipping a track uploaded by another account.')
            continue
        if item.get('sharing', 'public') != 'public':
            continue
        suffix = ' by ' + public.get('author_name', '')
        title = public.get('title', '')
        if suffix and title.endswith(suffix):
            title = title[:-len(suffix)]
        if not title:
            raise ValueError('A track title is missing; import stopped.')
        local = next((t for t in all_saved if t.get('soundcloudId') == track_id or (item.get('permalink_url') and t.get('soundcloudUrl') == item['permalink_url']) or ' '.join(t.get('title', '').casefold().split()) == ' '.join(title.casefold().split())), {})
        track = dict(local)
        raw_desc = public.get('description') or ''
        is_promo = any(w in raw_desc.lower() for w in ['dm me', 'free mixing', 'aspiring artists', 'saint gordon has always been'])
        clean_desc = '' if is_promo else raw_desc
        track.update(slug=local.get('slug') or 'soundcloud-' + str(track_id), title=title,
                     artist=public['author_name'], soundcloudId=track_id,
                     soundcloudUrl=item.get('permalink_url') or (local.get('soundcloudUrl') if local.get('soundcloudUrl') and not local.get('soundcloudUrl').startswith('https://api.soundcloud.com/') else None) or embed_url,
                     summary=clean_desc or local.get('summary') or 'From the Saint Gordon Collective playlist.',
                     artistCredits=infer_artist_credits(title, clean_desc or local.get('summary') or '', local),
                     placeholder=False, type='SoundCloud track')
        if not track.get('meaning') or 'not been supplied' in track.get('meaning', ''):
            track['meaning'] = clean_desc or local.get('meaning') or ''
        if item.get('release_date'):
            track['releaseDate'] = item['release_date'][:10]
        # Prefer deliberately supplied local artwork; otherwise refresh oEmbed art.
        if not local.get('artwork') or local.get('artworkPlaceholder') or '/soundcloud-' in local.get('artwork', ''):
            url = public.get('thumbnail_url', '')
            parsed = urllib.parse.urlparse(url)
            if parsed.scheme == 'https' and parsed.hostname and parsed.hostname.endswith('.sndcdn.com'):
                blob = fetch(url)
                if not blob.startswith(b'\xff\xd8'):
                    raise ValueError('Artwork was not the expected JPEG; import stopped.')
                filename = 'assets/artwork/soundcloud-' + str(track_id) + '.jpg'
                artwork[filename] = blob
                track.update(artwork=filename, artworkThumb=filename, artworkPlaceholder=False, artworkAlt='Cover artwork for ' + title)
            else:
                track.update(artwork='assets/artwork/cover-placeholder.svg', artworkPlaceholder=True)
        output.append(track)
        print(f'{index}/{len(remote)}: {title}')
        time.sleep(0.15)
    if not output:
        raise ValueError('No public uploads from your account were returned. No files changed.')
    if len({t['slug'] for t in output}) != len(output):
        raise ValueError('Duplicate track slugs found; no files changed.')
    return output, artwork


def copy_file(src, dest):
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest)


def publish(tracks, artwork):
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = ROOT / '.update-backups' / stamp
    backup.mkdir(parents=True)
    target = ROOT / 'js/soundcloud-data.js'
    if target.exists():
        copy_file(target, backup / target.name)
    payload = '// Generated by scripts/update_soundcloud.py. Edit local overrides in tracks.js.\nwindow.SAINT_SYNCED_TRACKS = ' + json.dumps(tracks, ensure_ascii=False, indent=2) + ';\n'
    for filename, blob in artwork.items():
        path = ROOT / filename
        if path.exists():
            destination = backup / filename
            copy_file(path, destination)
        path.write_bytes(blob)
    temporary = target.with_suffix('.tmp')
    temporary.write_text(payload)
    temporary.replace(target)
    # Refresh every script and stylesheet version together, including rendering logic.
    for page in ROOT.glob('*.html'):
        html = page.read_text()
        updated = re.sub(r'((?:js|css)/[^"?\s]+)\?v=[^"\s]+', lambda match: match.group(1) + '?v=' + stamp, html)
        if updated != html:
            copy_file(page, backup / page.name)
            page.write_text(updated)
    # Keep the deployment copy and portable ZIP aligned with the source.
    paths = list(ROOT.glob('*.html')) + list(ROOT.glob('*.md'))
    for directory in ('js', 'css', 'assets'):
        paths.extend(p for p in (ROOT / directory).rglob('*') if p.is_file() and p.name != '.DS_Store')
    for path in paths:
        dest = ROOT / 'dist' / path.relative_to(ROOT)
        copy_file(path, dest)
    archive = ROOT / 'saint-gordon-collective.zip'
    with tempfile.NamedTemporaryFile(dir=ROOT, suffix='.zip', delete=False) as tmp:
        temp_zip = Path(tmp.name)
    try:
        with zipfile.ZipFile(temp_zip, 'w', zipfile.ZIP_DEFLATED) as z:
            for path in paths + list((ROOT / 'scripts').glob('*.py')) + [ROOT / 'Update Music.command']:
                z.write(path, 'saint-gordon-collective/' + str(path.relative_to(ROOT)))
        temp_zip.replace(archive)
    finally:
        temp_zip.unlink(missing_ok=True)
    print(f'Updated {len(tracks)} tracks, artwork, deployment folder and ZIP. Backup: {backup.name}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Read and validate without changing files')
    parser.add_argument('--watch', action='store_true', help='Run continuously in background, checking for new SoundCloud releases')
    parser.add_argument('--interval', type=int, default=30, help='Polling interval in minutes for --watch (default: 30)')
    args = parser.parse_args()

    if args.watch:
        print(f'Starting Saint Gordon autoupdater daemon (interval: {args.interval}m)...')
        while True:
            try:
                tracks, artwork = build()
                target = ROOT / 'js/soundcloud-data.js'
                prev_text = target.read_text() if target.exists() else ''
                new_text = '// Generated by scripts/update_soundcloud.py. Edit local overrides in tracks.js.\nwindow.SAINT_SYNCED_TRACKS = ' + json.dumps(tracks, ensure_ascii=False, indent=2) + ';\n'
                if prev_text.strip() != new_text.strip() or artwork:
                    print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Detected updates on SoundCloud. Publishing...")
                    publish(tracks, artwork)
                else:
                    print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Up to date ({len(tracks)} tracks). Next check in {args.interval}m.")
            except Exception as error:
                print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Check error: {error}. Retrying in {args.interval}m.", file=sys.stderr)
            time.sleep(args.interval * 60)
    else:
        try:
            tracks, artwork = build()
            if args.check:
                print(f'CHECK PASSED: {len(tracks)} public tracks. No files changed.')
            else:
                publish(tracks, artwork)
        except Exception as error:
            print('Update failed:', error, file=sys.stderr)
            print('If SoundCloud is unavailable, try again later. No login or key is required.', file=sys.stderr)
            sys.exit(1)
