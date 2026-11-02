from pathlib import Path
from html.parser import HTMLParser
import re, subprocess, json
root=Path(__file__).resolve().parents[1]
class Parser(HTMLParser):
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        for key in ('src','href'):
            target=attrs.get(key,'').split('?')[0].split('#')[0]
            if target and not re.match(r'^[a-z]+:',target):
                assert (root/target).exists(), f'Missing local target: {target}'
        if tag=='img': assert 'alt' in attrs, 'Image has no alt attribute'
for file in root.glob('*.html'):
    data=file.read_text(); Parser().feed(data)
    assert 'lang="en"' in data and 'id="main"' in data
    assert not re.search(r'\bSGC\b',data), 'Forbidden branding'
code="global.window={};require('./js/tracks.js');console.log(JSON.stringify(window.SAINT_TRACKS))"
tracks=json.loads(subprocess.check_output(['node','-e',code],cwd=root))
assert len({t['slug'] for t in tracks})==len(tracks)
for t in tracks:
    assert re.fullmatch('[a-z0-9-]+',t['slug'])
    assert (root/t.get('artwork', 'assets/artwork/cover-placeholder.svg')).exists()
for f in root.glob('js/*.js'):
    subprocess.run(['node','--check',str(root/f)],check=True)
assert (root/'assets/fonts/OFL.txt').exists()
print('PASS: all local HTML references, alt attributes, landmarks, branding, unique slugs, artwork, font license and JavaScript syntax.')
