import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import tempfile

spec = importlib.util.spec_from_file_location('updater', Path(__file__).parents[1] / 'scripts/update_soundcloud.py')
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)

class UpdaterTests(unittest.TestCase):
    def page(self, tracks, count=None):
        data = [{'hydratable':'playlist','data':{'permalink_url':u.PLAYLIST,'sharing':'public','track_count':len(tracks) if count is None else count,'tracks':tracks}}]
        return 'window.__sc_hydration = ' + json.dumps(data) + ';'

    def test_partial_playlist_rejected(self):
        with self.assertRaises(ValueError):
            u.playlist_ids(self.page([{'id':1}], 2))

    def test_block_page_rejected(self):
        with self.assertRaises(ValueError):
            u.playlist_ids('<html>Access denied</html>')

    def test_artist_credits_use_explicit_metadata_not_uploader(self):
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
        self.assertEqual(
            u.infer_artist_credits('Song (Feat. Saint Gordon)', '', {}),
            ['Saint Gordon'],
        )
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

    def test_bottom_first_owner_only_and_notes(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'js').mkdir()
            (root/'js/tracks.js').write_text('window.SAINT_TRACKS = '+json.dumps([{'slug':'my-song','title':'Latest','story':'Keep my story','artwork':'assets/artwork/local.jpg'}])+';')
            def fetch(url):
                if url == u.PLAYLIST:
                    return self.page([{'id':1},{'id':2},{'id':3}]).encode()
                track_id = int(url.split('%2F')[-1])
                return json.dumps({'title':('Latest' if track_id==3 else 'Old')+' by Saint Gordon','author_name':'Saint Gordon','author_url':u.PROFILE if track_id!=2 else 'https://soundcloud.com/someone-else'}).encode()
            with patch.object(u,'ROOT',root),patch.object(u,'fetch',fetch),patch.object(u.time,'sleep'):
                tracks,_=u.build()
            self.assertEqual([t['soundcloudId'] for t in tracks],[3,1])
            self.assertEqual(tracks[0]['story'],'Keep my story')
            self.assertEqual(tracks[0]['slug'],'my-song')
            self.assertEqual(tracks[0]['artwork'],'assets/artwork/local.jpg')
            self.assertEqual(tracks[0]['artistCredits'], [])
            self.assertFalse((root/'js/soundcloud-data.js').exists())

if __name__=='__main__': unittest.main()
