"""Factory help gate (Apps-Factory packages/af-guide, controls HELP-04, HELP-07, HELP-09, HELP-10, HELP-11; owner 2026-10-09).

Hessa keeps its own guide engine (js/views/guides.js); tests/guide_catalogue.js writes it in the factory format and the
vendored factory checker (server/afguide.py) reads all of it: every guide complete in both languages with real button names,
a course per ready-made profile whose lessons the profile is allowed to do, the states the server reports
(center.GUIDE_FACTS), every page covered, every problem linked to a guide or a page, and every Arabic text in
«العربية الميسّرة» (the release lint: short sentences, no street words, no stiff office words, digits 0-9)."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'server'))
sys.path.insert(0, os.path.join(ROOT, 'tests'))
import afguide  # noqa: E402
import auth  # noqa: E402
import center  # noqa: E402
from test_access_gate import catalogue as access_catalogue, words  # noqa: E402


@unittest.skipUnless(shutil.which('node'), 'node is needed to read the guides')
class GuideGate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, 'guide.json')
            subprocess.run(['node', os.path.join(ROOT, 'tests', 'guide_catalogue.js'), out], cwd=ROOT, check=True,
                           stdout=subprocess.DEVNULL, timeout=120)
            with open(out, encoding='utf-8') as f:
                data = json.load(f)
        cls.cat, cls.texts, cls.ui = data['cat'], data['texts'], data['ui']
        cls.access = access_catalogue(words('ar'))

    def findings(self, release=True):
        return afguide.check(self.cat, self.texts, ui=self.ui, access=self.access, release=release)

    def test_catalogue_passes_the_factory_gate(self):
        self.assertGreater(len(self.cat['guides']), 30)
        self.assertGreater(len(self.cat['problems']), 40)
        self.assertEqual([f for f in self.findings() if f.level == 'error'], [])

    def test_states_are_what_the_server_reports(self):
        self.assertLessEqual(set(self.cat['states']), set(center.GUIDE_FACTS))

    def test_every_ready_made_profile_has_a_course(self):
        covered = {p for r in self.cat['roles'] for p in r['profiles']}
        self.assertEqual(covered, {p[0] for p in auth.BUILTIN_PROFILES})

    def test_every_problem_offers_guide_me(self):
        self.assertEqual([p['id'] for p in self.cat['problems'] if not p.get('guide')], [])

    def test_the_whole_arabic_help_is_easy_arabic(self):
        other = {k: v for k, v in self.texts['ar'].items() if k.startswith('other.')}
        self.assertGreater(len(other), 50)
        self.assertEqual(afguide.lint(self.texts['ar'], 'ar'), [])


if __name__ == '__main__':
    unittest.main()
