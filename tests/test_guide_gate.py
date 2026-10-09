"""Factory help gate (Apps-Factory packages/af-guide, controls HELP-01..HELP-08, owner's decision 2026-10-09).

Every guide has a title, a "what you get", its steps and a "how you know it worked" in both languages; every ready-made
profile has a learning path (المنهج) whose lessons are real guides and facts the server reports (center.GUIDE_FACTS); the
administrator's path starts by setting the centre up; every menu page is reached by a guide; every problem opens a guide;
and every Arabic help text is simple formal Arabic - neither street Egyptian nor stiff office words."""
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
            out = os.path.join(d, 'catalogue.json')
            subprocess.run(['node', os.path.join(ROOT, 'tests', 'guide_catalogue.js'), out], cwd=ROOT, check=True,
                           stdout=subprocess.DEVNULL, timeout=120)
            with open(out, encoding='utf-8') as f:
                cls.cat = json.load(f)
        cls.cat['facts'] = list(center.GUIDE_FACTS)
        cls.cat['pages'] = [p for p in access_catalogue(words('ar'))['pages'] if p != 'help']
        cls.cat['role_perms'] = {p[0]: '*' if p[0] == auth.LOCKED_PROFILE else list(p[2]) for p in auth.BUILTIN_PROFILES}

    def test_catalogue_passes_the_factory_gate(self):
        self.assertGreater(len(self.cat['guides']), 30)
        self.assertGreater(len(self.cat['situations']), 40)
        self.assertEqual(afguide.errors(self.cat), [])

    def test_every_ready_made_profile_has_a_path(self):
        self.assertEqual(set(self.cat['roles']), {p[0] for p in auth.BUILTIN_PROFILES})
        covered = {r for p in self.cat['paths'] for r in p['roles']}
        self.assertEqual(covered, set(self.cat['roles']))

    def test_every_lesson_is_one_the_role_can_do(self):
        """A lesson the role has no right for is hidden on screen; a path must not shrink to nothing for its own people."""
        perms = {p[0]: set(auth.ALL if p[0] == auth.LOCKED_PROFILE else p[2]) for p in auth.BUILTIN_PROFILES}
        guides = {g['id']: g for g in self.cat['guides']}
        for path in self.cat['paths']:
            for role in path['roles']:
                for lesson in path['lessons']:
                    need = guides[lesson['guide']]['perm']
                    need = [need] if isinstance(need, str) else need or []
                    with self.subTest(path=path['id'], role=role, lesson=lesson['guide']):
                        self.assertTrue(not need or perms[role] & set(need), f'{role} cannot do the lesson {lesson["guide"]}')

    def test_the_whole_arabic_help_is_simple_formal_arabic(self):
        self.assertGreater(len(self.cat['other_ar']), 700)
        bad = {k: afguide.register(v) for k, v in self.cat['other_ar'].items() if afguide.register(v)}
        self.assertEqual(bad, {})

    def test_progress_marks_where_the_person_stands(self):
        desk = next(p for p in self.cat['paths'] if p['id'] == 'desk')
        here, flags = afguide.progress(desk['lessons'], {'passwordChanged': True, 'myShiftOpened': True})
        self.assertEqual(here, 2)
        self.assertEqual(flags[:3], [True, True, False])


if __name__ == '__main__':
    unittest.main()
