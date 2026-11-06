#!/usr/bin/env python3
"""Import public Saint Gordon releases. Python 3 standard library only."""
import argparse
import datetime
import email.utils
import json
import re
import shutil
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import zipfile
from xml.etree import ElementTree
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROFILE = 'https://soundcloud.com/ceannairefr'
PROFILE_TRACKS = PROFILE + '/tracks'
FEED = 'https://feeds.soundcloud.com/users/soundcloud:users:397958661/sounds.rss'
ITUNES = '{http://www.itunes.com/dtds/podcast-1.0.dtd}'
PLACEHOLDER = 'assets/artwork/cover-placeholder.svg'


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


def profile_track_url(url):
    return bool(re.fullmatch(re.escape(PROFILE) + r'/[\w-]+', url))


def feed_tracks(xml):
    channel = ElementTree.fromstring(xml).find('channel')
    if channel is None or (channel.findtext('link') or '').rstrip('/') != PROFILE:
        raise ValueError('SoundCloud did not return the Saint Gordon feed.')
    tracks = []
    for entry in channel.findall('item'):
        url = entry.findtext('link') or ''
        if not profile_track_url(url):
            continue
        track_id = re.fullmatch(r'tag:soundcloud,2010:tracks/(\d+)', entry.findtext('guid') or '')
        title = entry.findtext('title')
        if not track_id or not title:
            raise ValueError('A SoundCloud feed entry is incomplete.')
        image = entry.find(ITUNES + 'image')
        tracks.append({
            'id': int(track_id[1]),
            'title': title,
            'url': url,
            'artist': entry.findtext(ITUNES + 'author') or 'Saint Gordon',
            'description': entry.findtext('description') or '',
            'published': email.utils.parsedate_to_datetime(entry.findtext('pubDate')),
            'artwork': image.get('href', '') if image is not None else '',
        })
    if not tracks:
        raise ValueError('SoundCloud returned an empty release feed.')
    return tracks


def profile_track_urls(html):
    # SoundCloud renders the newest uploads as MusicRecording entries for public crawlers.
    entries = re.findall(r'<article\b[^>]*itemprop="track"[^>]*>(.*?)</article>', html, re.S)
    urls = []
    for entry in entries:
        match = re.search(r'<a\s+itemprop="url"\s+href="([^"]+)"', entry)
        if match:
            url = urllib.parse.urljoin(PROFILE, match[1])
            if profile_track_url(url):
                urls.append(url)
    if not urls:
        raise ValueError('SoundCloud did not return public tracks on the profile page.')
    return urls


def public_track(url):
    html = fetch(url).decode('utf-8')
    hydration = assignment(html, 'window.__sc_hydration')
    for entry in hydration:
        if entry.get('hydratable') != 'sound':
            continue
        track = entry['data']
        user = track.get('user') or {}
        if (track.get('permalink_url') == url and track.get('sharing') == 'public'
                and user.get('permalink_url') == PROFILE):
            return {
                'id': track['id'],
                'title': track['title'],
                'url': url,
                'artist': user['username'],
                'description': track.get('description') or '',
                'published': datetime.datetime.fromisoformat((track.get('published_at') or track['created_at']).replace('Z', '+00:00')),
                'artwork': track.get('artwork_url') or '',
            }
    raise ValueError('Could not verify the public SoundCloud track ' + url)


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
    known = previous + saved
    by_id = {track['soundcloudId']: track for track in reversed(known) if track.get('soundcloudId')}
    by_url = {track['soundcloudUrl']: track for track in reversed(known) if track.get('soundcloudUrl')}

    remote = {track['url']: track for track in feed_tracks(fetch(FEED))}
    for url in profile_track_urls(fetch(PROFILE_TRACKS).decode('utf-8')):
        if url not in remote:
            remote[url] = public_track(url)

    output, artwork = [], {}
    for item in sorted(remote.values(), key=lambda track: track['published'], reverse=True):
        track_id, title, url = item['id'], item['title'], item['url']
        local = by_id.get(track_id) or by_url.get(url) or {}
        track = dict(local)
        description = item['description'].strip()
        if description == title + ' by ' + item['artist'] or any(
            term in description.lower() for term in ('dm me', 'free mixing', 'aspiring artists', 'saint gordon has always been')
        ):
            description = ''
        track.update(
            slug=local.get('slug') or 'soundcloud-' + str(track_id),
            title=title,
            artist=item['artist'],
            soundcloudId=track_id,
            soundcloudUrl=url,
            summary=local.get('summary') or description or 'From Saint Gordon on SoundCloud.',
            artistCredits=infer_artist_credits(title, description or local.get('summary') or '', local),
            placeholder=False,
            type='SoundCloud track',
        )
        if not local:
            track['releaseDate'] = item['published'].date().isoformat()
        if not track.get('meaning') or 'not been supplied' in track['meaning']:
            track['meaning'] = description or local.get('meaning') or ''
        if not track.get('artwork') or track.get('artworkPlaceholder'):
            art_url = urllib.parse.urlparse(item['artwork'])
            if art_url.scheme == 'https' and art_url.hostname and art_url.hostname.endswith('.sndcdn.com'):
                resized = re.sub(r'-(?:t\d+x\d+|large)(\.[a-z]+)$', r'-t500x500\1', item['artwork'])
                blob = fetch(resized)
                if blob.startswith(b'\xff\xd8'):
                    extension = 'jpg'
                elif blob.startswith(b'\x89PNG\r\n\x1a\n'):
                    extension = 'png'
                else:
                    raise ValueError('SoundCloud returned invalid artwork for ' + title)
                filename = f'assets/artwork/soundcloud-{track_id}.{extension}'
                artwork[filename] = blob
                track.update(artwork=filename, artworkThumb=filename, artworkPlaceholder=False,
                             artworkAlt='Cover artwork for ' + title)
            else:
                track.update(artwork=PLACEHOLDER, artworkThumb=PLACEHOLDER, artworkPlaceholder=True)
        output.append(track)

    # Feed inclusion is optional on SoundCloud. Keep older saved releases the feed omits.
    ids = {track['soundcloudId'] for track in output}
    urls = {track['soundcloudUrl'] for track in output}
    output.extend(track for track in previous if track.get('soundcloudId') not in ids
                  and track.get('soundcloudUrl') not in urls)
    if len({track['slug'] for track in output}) != len(output) or len({track['soundcloudId'] for track in output}) != len(output):
        raise ValueError('Duplicate SoundCloud releases found; no files changed.')
    return output, artwork


def catalogue_payload(tracks):
    return ('// Generated by scripts/update_soundcloud.py. Edit local overrides in tracks.js.\n'
            'window.SAINT_SYNCED_TRACKS = ' + json.dumps(tracks, ensure_ascii=False, indent=2) + ';\n')


def has_updates(tracks, artwork):
    for directory in (ROOT, ROOT / 'dist'):
        target = directory / 'js/soundcloud-data.js'
        if not target.exists() or target.read_text() != catalogue_payload(tracks):
            return True
        for filename, blob in artwork.items():
            path = directory / filename
            if not path.exists() or path.read_bytes() != blob:
                return True
    return False


def copy_file(src, dest):
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest)


def publish(tracks, artwork):
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    backup = ROOT / '.update-backups' / stamp
    backup.mkdir(parents=True)
    target = ROOT / 'js/soundcloud-data.js'
    if target.exists():
        copy_file(target, backup / target.name)
    payload = catalogue_payload(tracks)
    for filename, blob in artwork.items():
        path = ROOT / filename
        if path.exists():
            destination = backup / filename
            copy_file(path, destination)
        path.write_bytes(blob)
    temporary = target.with_suffix('.tmp')
    temporary.write_text(payload)
    temporary.replace(target)
    # Refresh the generated catalogue even when the browser has the previous file cached.
    for page in ROOT.glob('*.html'):
        html = page.read_text()
        updated = re.sub(r'(js/soundcloud-data\.js)\?v=[^"\s]+', lambda match: match.group(1) + '?v=' + stamp, html)
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
                if has_updates(tracks, artwork):
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
            elif has_updates(tracks, artwork):
                publish(tracks, artwork)
            else:
                print(f'Up to date ({len(tracks)} public tracks).')
        except Exception as error:
            print('Update failed:', error, file=sys.stderr)
            print('If SoundCloud is unavailable, try again later. No login or key is required.', file=sys.stderr)
            sys.exit(1)
