"""Unified licence hub + AF codes in server/license.py (trial-hub kid, calendar dates)."""
# CI: pyflakes must stay clean (no unused imports).
import base64
import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'server'))

import afcodes  # noqa: E402
import license as L  # noqa: E402


class _Assist:
    def __init__(self):
        self.values = {'install_id': 'hub-test-install'}

    def kv(self, key, value=None, delete=False):
        if delete:
            self.values.pop(key, None)
            return None
        if value is not None:
            self.values[key] = value
        return self.values.get(key)

    def hub_url(self):
        return ''


def _trial_keypair():
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives import serialization

    private = Ed25519PrivateKey.generate()
    pem = private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    raw = private.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    pub = base64.urlsafe_b64encode(raw).decode().rstrip('=')
    return pem, pub


class AfActivateTest(unittest.TestCase):
    def setUp(self):
        os.environ['HS_MACHINE_ID'] = 'hub-pc-guid'
        self.addCleanup(os.environ.pop, 'HS_MACHINE_ID', None)
        self.home = tempfile.mkdtemp(prefix='hs-hub-')
        self.addCleanup(shutil.rmtree, self.home, True)
        pem, pub = _trial_keypair()
        self.pem, self.pub = pem, pub
        keys_path = os.path.join(self.home, 'licence_keys.txt')
        with open(keys_path, 'w', encoding='utf-8') as f:
            f.write(f'trial-hub:{pub}\n')
        self.lic = L.License(self.home, lambda: (None, None), required=True,
                             assist=_Assist(), cfg={}, root=self.home)

    def test_hub_trial_code_unlocks_with_expected_dates_and_key(self):
        device = self.lic.af_device()
        first = date.today()
        signed = afcodes.issue_code(self.pem, 'teachers', 'trial', first, 14, device=device)
        last = first + timedelta(days=13)
        self.assertEqual(signed['first_day'], first.isoformat())
        self.assertEqual(signed['last_day'], last.isoformat())
        r = afcodes.read_code(signed['code'], [self.pub], 'teachers', device=device, today=first,
                              trial_only_keys=frozenset({self.pub}))
        self.assertTrue(r.full_access)
        self.assertEqual(r.terms['edition'], 'trial')
        out = self.lic.activate(signed['code'], who='test')
        self.assertEqual(out['until'], last.isoformat())
        st = self.lic.status()
        self.assertEqual(st['state'], 'trial')
        self.assertEqual(st['until'], last.isoformat())

    def test_trial_hub_public_key_rejects_standard_edition(self):
        device = self.lic.af_device()
        signed = afcodes.issue_code(self.pem, 'teachers', 'standard', date.today(), 31, device=device)
        r = afcodes.read_code(signed['code'], [self.pub], 'teachers', device=device, today=date.today(),
                              trial_only_keys=frozenset({self.pub}))
        self.assertFalse(r.full_access)
        self.assertEqual(r.reason, 'trial_key_edition')


class HubSignerCrossTest(unittest.TestCase):
    def test_node_signer_matches_python_dates_and_edition(self):
        import subprocess
        from zoneinfo import ZoneInfo

        script = os.path.join(ROOT, 'licence-hub', 'test', 'export_code.mjs')
        out = subprocess.check_output(['node', script], cwd=ROOT, text=True)
        data = json.loads(out)
        cairo_today = datetime.now(ZoneInfo('Africa/Cairo')).date()
        result = afcodes.read_code(data['code'], [data['public']], 'teachers', device=data['device'], today=cairo_today)
        self.assertTrue(result.valid)
        self.assertEqual(result.terms.get('edition'), 'trial')
        self.assertRegex(result.terms.get('first_day', ''), r'^\d{4}-\d{2}-\d{2}$')
        self.assertRegex(result.terms.get('last_day', ''), r'^\d{4}-\d{2}-\d{2}$')
        first = date.fromisoformat(result.terms['first_day'])
        last = date.fromisoformat(result.terms['last_day'])
        self.assertEqual((last - first).days + 1, 14)
        self.assertEqual(afcodes.key_tag(data['public']), afcodes.key_tag(data['public']))


if __name__ == '__main__':
    unittest.main()
