import json
from http.server import BaseHTTPRequestHandler

from scripts.update_soundcloud import build


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            tracks, _ = build(download_artwork=False)
            payload = json.dumps(tracks, ensure_ascii=False).encode('utf-8')
        except Exception as error:
            self.log_error('SoundCloud update failed: %s', error)
            self.send_response(503)
            self.send_header('Cache-Control', 'no-store')
            payload = b'{"error":"SoundCloud releases are temporarily unavailable"}'
        else:
            self.send_response(200)
            self.send_header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
