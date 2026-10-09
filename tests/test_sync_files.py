"""Photos and documents copied between PCs: with three or more PCs two sync threads can ask for the same file at the same moment.
Only one may download it; the stored file must be exactly the original (it used to come out longer)."""
import hashlib
import os
import shutil
import sys
import tempfile
import threading
import time
import types
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
import sync  # noqa: E402

DATA = os.urandom(300_000)
SHA = hashlib.sha256(DATA).hexdigest()


class SlowPeer:
    """Answers /sync/file in small pieces, slowly, like a busy network."""
    def __init__(self):
        self.calls = 0

    def request(self, method, path, raw=False, headers=None, sink=None):
        self.calls += 1
        start = int((headers or {}).get('Range', 'bytes=0-')[6:-1] or 0)
        for i in range(start, len(DATA), 20_000):
            sink.write(DATA[i:i + 20_000])
            sink.flush()
            time.sleep(0.01)
        return types.SimpleNamespace(status=206 if start else 200), None

    def close(self):
        pass


class SameFileTwiceTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix='hs-files-')
        self.addCleanup(shutil.rmtree, self.dir, True)
        svc = sync.SyncService.__new__(sync.SyncService)
        svc.lock = threading.RLock()
        svc.fetching = set()
        svc.uploads = self.dir
        svc.sync_logger = types.SimpleNamespace(write=lambda *a: None)
        svc.journal = types.SimpleNamespace(alert=lambda *a, **k: None)
        svc.file_path = lambda src: os.path.join(self.dir, 'cas', os.path.basename(src))
        self.svc = svc

    def test_two_threads_asking_for_the_same_file_store_it_once_and_intact(self):
        src = '/files/cas/' + SHA + '.jpg'
        peers = [SlowPeer(), SlowPeer()]
        results = []
        threads = [threading.Thread(target=lambda p=p: results.append(self.svc.fetch_file(p, src, SHA, len(DATA)))) for p in peers]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        with open(self.svc.file_path(src), 'rb') as f:
            got = f.read()
        self.assertEqual(len(got), len(DATA))
        self.assertEqual(hashlib.sha256(got).hexdigest(), SHA)
        self.assertIn(True, results)
        self.assertEqual(self.svc.fetching, set())                           # nothing stays marked as "being downloaded"
        self.assertTrue(self.svc.fetch_file(SlowPeer(), src, SHA, len(DATA)))   # asked again later: it is already here


if __name__ == '__main__':
    unittest.main()
