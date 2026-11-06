import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('updater', Path(__file__).parents[1] / 'scripts/update_soundcloud.py')
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)


class UpdaterTests(unittest.TestCase):
    def test_invalid_feed_and_profile_are_rejected(self):
        with self.assertRaises(ValueError):
            u.feed_tracks(b'<rss><channel><link>https://soundcloud.com/someone-else</link></channel></rss>')
        with self.assertRaises(ValueError):
            u.profile_track_urls('<html>Access denied</html>')

    def test_artist_credits_use_explicit_metadata(self):
        self.assertEqual(
            u.infer_artist_credits(
                'Sex With My Ex - Lil Peep Cover',
                'This is a song cover by Dakota Violet, her first studio recording.',
                {},
            ),
            ['Dakota Violet'],
        )
        self.assertEqual(
            u.infer_artist_credits(
                'Abandonment',
                'Artists: Whosarmd, King Kayy\nMixed by Saint Gordon',
                {},
            ),
            ['Whosarmd', 'King Kayy'],
        )
        self.assertEqual(u.infer_artist_credits('Song (Feat. Saint Gordon)', '', {}), ['Saint Gordon'])
        self.assertEqual(u.infer_artist_credits('New song', '', {}), [])

    def test_existing_artist_credits_are_preserved(self):
        self.assertEqual(
            u.infer_artist_credits(
                'New title (Feat. Saint Gordon)',
                'Artists: Someone Else',
                {'artistCredits': ['M0NIQUE', 'Saint Gordon']},
            ),
            ['M0NIQUE', 'Saint Gordon'],
        )

    def test_profile_and_feed_union_preserves_saved_tracks_and_is_repeatable(self):
        profile_only = u.PROFILE + '/profile-only'
        html = '<article itemprop="track"><a itemprop="url" href="/ceannairefr/profile-only">Profile only</a></article>'
        feed = f'''<rss><channel><link>{u.PROFILE}</link>
          <item><guid>tag:soundcloud,2010:tracks/1</guid><link>{u.PROFILE}/existing</link>
            <title>Same Title</title><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate></item>
          <item><guid>tag:soundcloud,2010:tracks/2</guid><link>{u.PROFILE}/new</link>
            <title>Same Title</title><pubDate>Tue, 03 Nov 2026 10:00:00 GMT</pubDate></item>
          <item><link>https://soundcloud.com/another-account/repost</link></item>
        </channel></rss>'''
        hydration = [{'hydratable': 'sound', 'data': {
            'id': 3, 'title': 'Profile only', 'permalink_url': profile_only,
            'sharing': 'public', 'user': {'permalink_url': u.PROFILE, 'username': 'Saint Gordon'},
            'created_at': '2026-11-04T10:00:00Z',
        }}]
        responses = {u.FEED: feed, u.PROFILE_TRACKS: html,
                     profile_only: 'window.__sc_hydration = ' + json.dumps(hydration)}
        saved = {'slug': 'stable-slug', 'title': 'Same Title', 'soundcloudUrl': u.PROFILE + '/existing',
                 'soundcloudId': 1, 'story': 'Keep the story', 'artwork': 'assets/artwork/local.jpg'}
        older = {'slug': 'older', 'soundcloudId': 4, 'soundcloudUrl': u.PROFILE + '/older'}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'js').mkdir()
            (root / 'js/tracks.js').write_text('window.SAINT_TRACKS = ' + json.dumps([saved]) + ';')
            target = root / 'js/soundcloud-data.js'
            target.write_text(u.catalogue_payload([saved, older]))
            with patch.object(u, 'ROOT', root), patch.object(u, 'fetch', lambda url: responses[url].encode()):
                tracks, artwork = u.build()
                self.assertEqual([t['soundcloudId'] for t in tracks], [3, 2, 1, 4])
                self.assertEqual(tracks[2]['story'], 'Keep the story')
                self.assertEqual(tracks[2]['slug'], 'stable-slug')
                self.assertEqual(tracks[2]['artwork'], 'assets/artwork/local.jpg')
                self.assertEqual(tracks[1]['slug'], 'soundcloud-2')
                self.assertEqual(tracks[0]['releaseDate'], '2026-11-04')
                self.assertFalse(artwork)
                self.assertTrue(u.has_updates(tracks, artwork))
                u.copy_file(target, root / 'dist/js/soundcloud-data.js')
                for folder in (root, root / 'dist'):
                    (folder / 'js/soundcloud-data.js').write_text(u.catalogue_payload(tracks))
                updated, artwork = u.build()
                self.assertFalse(u.has_updates(updated, artwork))


if __name__ == '__main__':
    unittest.main()
