"""Fake NetFree for tests: answers every request with "418 Blocked by NetFree", like the user's filtered internet.

    python netfree418.py [port]          # default 8418
    HF_ENDPOINT=http://127.0.0.1:8418 HF_HOME=/tmp/empty-hf python app.py   # everything from Hugging Face is "blocked"

Point any URL an installer probes or downloads at http://127.0.0.1:8418/... to see how it behaves when blocked.
Stop it with:  fuser -k 8418/tcp
"""
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer


class Blocked(BaseHTTPRequestHandler):
    def _block(self):
        body = b"Blocked by NetFree"
        self.send_response(418, "Blocked by NetFree")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    do_GET = do_HEAD = do_POST = _block

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8418), Blocked).serve_forever()
