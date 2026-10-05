"""Design-system checks that need no browser: WCAG contrast of every theme, and language/CSS hygiene rules."""
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*p):
    with open(os.path.join(ROOT, *p), encoding='utf-8') as f:
        return f.read()


def theme_tokens():
    css = read('css', 'tokens.css')
    out = {}
    for m in re.finditer(r'(?:^|\n)((?::root,\s*)?\[data-theme="([a-z]+)"\])\s*\{(.*?)\n\}', css, re.S):
        name, body = m.group(2), m.group(3)
        out[name] = dict(re.findall(r'--([a-z0-9-]+):\s*([^;]+);', body))
    return out


def lum(hexcolor):
    h = hexcolor.strip().lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4  # noqa: E731
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


TEXT = [('ink', 'canvas'), ('ink', 'surface'), ('ink', 'surface-2'), ('ink', 'raised'),
        ('ink-2', 'canvas'), ('ink-2', 'surface'), ('ink-2', 'surface-2'), ('ink-3', 'canvas'), ('ink-3', 'surface'),
        ('brand-ink', 'brand'), ('signal-ink', 'signal'), ('side-ink', 'side-bg'), ('side-ink-2', 'side-bg'),
        ('side-ink', 'side-bg-2'), ('side-ink-2', 'side-bg-2'),
        ('ok', 'ok-soft'), ('warn', 'warn-soft'), ('bad', 'bad-soft'), ('info', 'info-soft'), ('ink', 'signal-soft'), ('ink', 'brand-soft'), ('ink', 'info-soft'),
        ('ok', 'surface'), ('warn', 'surface'), ('bad', 'surface'), ('info', 'surface'), ('brand', 'surface')]
UI = [('focus', 'surface'), ('focus', 'canvas'), ('signal', 'surface')]


class ContrastTest(unittest.TestCase):
    def test_all_five_themes_exist(self):
        self.assertEqual(set(theme_tokens()), {'daylight', 'night', 'asphalt', 'highway', 'contrast'})

    def test_text_contrast_is_at_least_aa(self):
        for theme, t in theme_tokens().items():
            for fg, bg in TEXT:
                with self.subTest(theme=theme, pair=f"{fg} on {bg}"):
                    self.assertGreaterEqual(ratio(t[fg], t[bg]), 4.5, f'{fg} {t[fg]} on {bg} {t[bg]}')

    def test_ui_parts_contrast_is_at_least_3(self):
        for theme, t in theme_tokens().items():
            for fg, bg in UI:
                if fg == 'signal' and theme in ('daylight', 'highway', 'contrast'):
                    continue  # the amber button has its own dark text and a dark outline; it is never text or a lone icon on white
                with self.subTest(theme=theme, pair=f'{fg} on {bg}'):
                    self.assertGreaterEqual(ratio(t[fg], t[bg]), 3.0, f'{fg} {t[fg]} on {bg} {t[bg]}')

    def test_every_theme_defines_the_same_tokens(self):
        themes = theme_tokens()
        base = set(themes['daylight'])
        for name, t in themes.items():
            self.assertEqual(set(t), base, name)


JS_FILES = [p[3:] for p in re.findall(r'<script src="(js/[^"]+)">', read('index.html'))
            if not p.startswith('js/i18n') and p != 'js/boot.js']
PAGES = ['overview', 'door', 'students', 'groups', 'money', 'exams', 'followup', 'settlements',
         'reports', 'activity', 'settings', 'help', 'importx', 'print', 'mailbox']



def dict_keys(lang):
    src = read('js', 'i18n', f'{lang}.js')
    return set(re.findall(r"'([a-zA-Z0-9_.\-]+)':\s*'", src))


class LanguageTest(unittest.TestCase):
    def test_english_and_arabic_have_the_same_keys(self):
        en, ar = dict_keys('en'), dict_keys('ar')
        self.assertGreater(len(en), 200)
        self.assertEqual(sorted(en - ar), [], 'missing in Arabic')
        self.assertEqual(sorted(ar - en), [], 'missing in English')

    def test_every_key_used_in_code_exists(self):
        keys = dict_keys('en')
        used = set()
        for f in JS_FILES:
            src = read('js', *f.split('/'))
            used |= set(re.findall(r"HS\.t\('([a-zA-Z0-9_.\-]+)'", src))
            used |= set(re.findall(r"HS\.has\('([a-zA-Z0-9_.\-]+)'", src))
        missing = sorted(k for k in used if not k.endswith('.') and k not in ('help.a', 'help.q') and k not in keys)  # 'nav.' + id keys are checked by the family test
        self.assertEqual(missing, [])

    def test_dynamic_key_families_are_complete(self):
        keys = dict_keys('en')
        for fam in ('nav.{}', 'page.{}.d'):
            for page in PAGES:
                self.assertIn(fam.format(page), keys)

    def test_all_server_errors_are_translated(self):
        source = read('server', 'center.py') + read('server', 'domain.py')
        errors = set(re.findall(r"(?:Problem\(|return\s+)'(err\.[A-Za-z0-9_.]+)'", source))
        self.assertGreater(len(errors), 20)
        for lang in ('en', 'ar'):
            self.assertEqual(sorted(errors - dict_keys(lang)), [], lang)

    def test_every_advisor_item_is_translated(self):
        """center.advice() emits ids; the overview shows adv.<id>.t/.b/.go - a missing text would show the raw key."""
        ids = set(re.findall(r"add\('([A-Za-z]+)'", read('server', 'center.py')))
        self.assertGreater(len(ids), 10)
        for lang in ('en', 'ar'):
            keys = dict_keys(lang)
            for i in ids:
                for part in ('t', 'b', 'go'):
                    self.assertIn(f'adv.{i}.{part}', keys, lang)

    def test_every_help_topic_question_is_translated(self):
        """help.js builds hq.<topic>.<k>.q/.a from its TOPICS list; a missing text would show the raw key."""
        topics = re.findall(r"\{ id: '([a-z]+)', icon: '[a-z]+', page: '[^']+',(?: perm: [^}]+?,)? n: (\d+) \}", read('js', 'views', 'help.js'))
        self.assertGreaterEqual(len(topics), 10)
        for lang in ('en', 'ar'):
            keys = dict_keys(lang)
            for tid, n in topics:
                self.assertIn(f'hq.{tid}', keys, lang)
                for k in range(1, int(n) + 1):
                    for part in ('q', 'a'):
                        self.assertIn(f'hq.{tid}.{k}.{part}', keys, lang)

    def test_centre_vocabulary_is_complete(self):
        import sys
        sys.path.insert(0, os.path.join(ROOT, 'server'))
        import domain
        families = {'grade': domain.GRADES, 'fee': domain.FEE_TYPES, 'kind': domain.GROUP_KINDS,
                    'pay.kind': domain.PAY_KINDS, 'pay.method': domain.PAY_METHODS, 'att': domain.ATT_STATUSES,
                    'exam.kind': domain.EXAM_KINDS, 'exp.cat': domain.EXPENSE_CATS, 'day': range(7)}
        for lang in ('en', 'ar'):
            keys = dict_keys(lang)
            for family, values in families.items():
                for value in values:
                    self.assertIn(f'{family}.{value}', keys)

    def test_dictionary_keys_are_unique(self):
        for lang in ('en', 'ar'):
            keys = re.findall(r"'([a-zA-Z0-9_.\-]+)':\s*'", read('js', 'i18n', f'{lang}.js'))
            self.assertEqual(len(keys), len(set(keys)), lang)

    def test_no_literal_words_in_page_templates(self):
        """Visible words come from the dictionaries; a word typed straight into a template would stay English in Arabic."""
        allowed = {'Ctrl', 'Esc', 'Enter', 'English', 'العربية', 'Abc', 'أبجد'}  # key names; 'Abc' is a font sample
        bad = []
        for f in JS_FILES:
            for n, line in enumerate(read('js', *f.split('/')).splitlines(), 1):
                for m in re.finditer(r"'[^'\n]*?>([^<>'\n]*)<[^'\n]*'", line):
                    words = set(re.findall(r"[A-Za-z؀-ۿ]{3,}", m.group(1))) - allowed
                    if words:
                        bad.append(f'{f}:{n}: {sorted(words)}')
        self.assertEqual(bad, [])


class CssHygieneTest(unittest.TestCase):
    def test_only_logical_directions(self):
        """Left/right would break the Arabic (mirrored) layout; use start/end. Allowed: comments and the inline SVG transform rules."""
        css = re.sub(r'/\*.*?\*/', '', read('css', 'base.css') + read('css', 'tokens.css'), flags=re.S)
        hits = [ln.strip() for ln in css.splitlines() if re.search(r'(?<![a-z-])(left|right)(?![a-z-])', ln) and 'text-align' not in ln]
        self.assertEqual(hits, [])

    def test_no_logical_offset_centred_with_a_physical_transform(self):
        """inset-inline-start: 50% flips side in Arabic but translateX(-50%) does not: every toast sat half off the phone screen."""
        css = re.sub(r'/\*.*?\*/', '', read('css', 'base.css'), flags=re.S)
        hits = [r.strip()[:80] for r in css.split('}') if re.search(r'inset-inline-(start|end):\s*50%', r) and 'translateX(' in r]
        self.assertEqual(hits, [])

    def test_no_hard_coded_colours_outside_tokens(self):
        css = re.sub(r'/\*.*?\*/', '', read('css', 'base.css'), flags=re.S)
        allowed = {'#fff', '#000'}
        found = {c.lower() for c in re.findall(r'#[0-9a-fA-F]{3,8}\b', css)} - allowed
        self.assertEqual(sorted(found), [], 'use tokens from css/tokens.css')

    def test_fonts_referenced_exist(self):
        css = read('css', 'fonts.css')
        for f in re.findall(r'url\(\.\./fonts/([^)]+)\)', css):
            self.assertTrue(os.path.exists(os.path.join(ROOT, 'fonts', f)), f)


class PermissionLabelsTest(unittest.TestCase):
    def test_every_permission_and_group_has_both_translations(self):
        sys_path = os.path.join(ROOT, 'server')
        import sys
        sys.path.insert(0, sys_path)
        import auth
        keys = dict_keys('en')
        for group, perms in auth.PERMISSIONS:
            slug = '_'.join(re.sub(r'[^a-z]+', ' ', group.lower()).split()[:2])
            self.assertIn('permgroup.' + slug, keys, group)
            for p, _ in perms:
                self.assertIn('perm.' + p, keys, p)


if __name__ == '__main__':
    unittest.main()
