"""The parent link on its way to the gateway: the address the program hands out is the page the gateway serves, and a replaced
or removed link is really revoked there - also when the internet was down or the PC restarted in between."""
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import Server, make_authority, wait_until  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
import gateway_client as gwc  # noqa: E402


class FakeGateway:
    """Records what the office PC asks of the gateway; can be switched off like a dead internet connection."""

    def __init__(self):
        self.cards, self.removed, self.up = {}, [], True
        outer = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def reply(self, code, obj):
                data = json.dumps(obj).encode()
                self.send_response(code)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_PUT(self):
                body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
                if not outer.up:
                    return self.reply(500, {'error': 'down'})
                for c in body.get('cards', []):
                    outer.cards[c['tokenHash']] = c
                for h in body.get('remove', []):
                    outer.cards.pop(h, None)
                    outer.removed.append(h)
                self.reply(200, {'ok': True})

            def do_GET(self):
                self.reply(200 if outer.up else 500, {'events': [], 'photos': []})

            def do_POST(self):
                self.rfile.read(int(self.headers.get('Content-Length') or 0))
                self.reply(200, {'ok': True})

        self.srv = ThreadingHTTPServer(('127.0.0.1', 0), H)
        self.url = f'http://127.0.0.1:{self.srv.server_address[1]}'
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def close(self):
        self.srv.shutdown()
        self.srv.server_close()


class ParentLinkTest(unittest.TestCase):
    def setUp(self):
        self.gw = FakeGateway()
        self.addCleanup(self.gw.close)
        self.s = Server('gwlink').start()
        self.addCleanup(self.s.cleanup)
        self.c = make_authority(self.s)
        for sid, name in (('pl-1', 'Synthetic Link One'), ('pl-2', 'Synthetic Link Two')):
            self.c.post('/api/commit', {'label': 'x', 'ops': [{'e': 'students', 'id': sid, 'op': 'put', 'row': {
                'name': name, 'gradeCode': 'S1', 'code': '1000' + sid[-1], 'active': True}}]})
        self.c.post('/api/gateway/save', {'url': self.gw.url, 'pollSeconds': 600})
        self.c.post('/api/gateway/generate', {})

    def link(self, sid, replace=False):
        r = self.c.post('/api/c/portal', {'studentId': sid, 'replace': replace})
        token = r['url'].rsplit('/', 1)[1]
        return r['url'], gwc.token_hash(token)

    def test_link_is_the_page_the_gateway_serves_and_the_old_one_is_revoked(self):
        url, h1 = self.link('pl-1')
        self.assertEqual(url, self.gw.url + '/t/' + url.rsplit('/', 1)[1])
        text = self.c.get('/api/c/wa?studentId=pl-1&kind=report&lang=en')['text']
        self.assertIn(url, text)                                             # the message carries the same, working address
        wait_until(lambda: h1 in self.gw.cards, 30, what='the first card')
        self.assertEqual(self.gw.cards[h1]['body']['name'], 'Synthetic Link One')
        _, h2 = self.link('pl-1', replace=True)
        wait_until(lambda: h2 in self.gw.cards and h1 not in self.gw.cards, 30, what='the old link to be forgotten by the gateway')
        self.assertIn(h1, self.gw.removed)

    def test_a_revoke_during_an_outage_and_a_restart_is_still_delivered(self):
        _, h1 = self.link('pl-1')
        wait_until(lambda: h1 in self.gw.cards, 30, what='the first card')
        self.gw.up = False                                                   # the internet is gone
        _, h2 = self.link('pl-1', replace=True)
        self.assertEqual(self.gw.removed, [])
        self.c.post('/api/gateway/save', {'url': self.gw.url, 'pollSeconds': 600})
        self.s.stop()                                                        # ... and the PC is restarted before it comes back
        self.s.start()
        self.c = self.s.client()
        self.c.login(*__import__('harness').ADMIN)
        self.gw.up = True
        self.link('pl-2')                                                     # any parent-link action wakes the sender
        wait_until(lambda: h1 in self.gw.removed and h2 in self.gw.cards, 60, what='the revoke after the restart')
        self.assertNotIn(h1, self.gw.cards)

    def test_a_removed_student_loses_the_link(self):
        _, h = self.link('pl-2')
        wait_until(lambda: h in self.gw.cards, 30, what='the card')
        self.c.post('/api/commit', {'label': 'delete', 'ops': [{'e': 'students', 'id': 'pl-2', 'op': 'del', 'ver': next(
            x for x in self.c.get('/api/state')['students'] if x['id'] == 'pl-2')['ver']}]})
        self.link('pl-1')                                                     # wakes the sender
        wait_until(lambda: h in self.gw.removed, 30, what='the removed student card')


if __name__ == '__main__':
    unittest.main()
