"""Local store for commercial licence (Apps-Factory hub flow): install id, hub URL, licence request state.

Not replicated or restored from backups — same rules as Trip Orders assist.db licence keys.
"""
import os
import re
import secrets
import sqlite3
import threading
from urllib.parse import urlsplit

KV_SQL = 'CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)'
_ID = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.:\-/]{0,79}$')
_LONG = re.compile(r'\d{8,}')


def valid_hub_url(url):
    if not isinstance(url, str) or any(ch.isspace() or ord(ch) < 32 for ch in url):
        return False
    try:
        p = urlsplit(url)
        port = p.port
        return bool(p.hostname and p.username is None and p.password is None and not p.fragment and not p.query
                    and (port is None or 1 <= port <= 65535)
                    and (p.scheme == 'https' or (p.scheme == 'http' and p.hostname in ('127.0.0.1', 'localhost'))))
    except ValueError:
        return False


def new_install_id():
    return secrets.token_hex(8)


class Assist:
    """Minimal Assist surface used by server/license.py hub mixin (hub URL + kv)."""

    def __init__(self, data_dir, cfg, practice=False):
        self.data_dir = data_dir
        self.cfg = cfg if isinstance(cfg, dict) else {}
        self.practice = practice
        self.lock = threading.RLock()
        os.makedirs(data_dir, exist_ok=True)
        self.db = sqlite3.connect(os.path.join(data_dir, 'assist.db'), check_same_thread=False, isolation_level=None)
        self.db.execute(KV_SQL)
        self._ensure_identity()

    def kv(self, key, value=None, delete=False):
        with self.lock:
            if delete:
                self.db.execute('DELETE FROM kv WHERE k=?', (key,))
                return None
            if value is not None:
                self.db.execute('INSERT INTO kv(k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', (key, str(value)))
                return value
            row = self.db.execute('SELECT v FROM kv WHERE k=?', (key,)).fetchone()
            return row[0] if row else None

    def _ensure_identity(self):
        if not self.kv('install_id'):
            self.kv('install_id', new_install_id())

    def hub_url(self):
        url = (os.environ.get('FACTORY_HUB_URL') or self.cfg.get('hub_url') or self.kv('hub_url') or '').strip().rstrip('/')
        return url if valid_hub_url(url) else ''

    def save_hub_url(self, url):
        url = (url or '').strip().rstrip('/')
        if url and not valid_hub_url(url):
            raise ValueError('The licence hub address must start with https://')
        if url:
            self.kv('hub_url', url)
        else:
            self.kv('hub_url', delete=True)

    def receiver_public(self):
        return {'url': self.hub_url(), 'urlFromEnvironment': bool(os.environ.get('FACTORY_HUB_URL') or self.cfg.get('hub_url')),
                'hasToken': False, 'sending': False, 'installId': self.kv('install_id') or ''}
