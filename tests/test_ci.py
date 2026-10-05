"""Catch inherited workflow selectors that no longer exist after the centre migration."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class WorkflowTest(unittest.TestCase):
    def test_all_selected_test_modules_exist_and_cover_centre_regressions(self):
        workflow = (ROOT / '.github/workflows/build.yml').read_text(encoding='utf-8')
        command = re.search(r'run: python -m unittest ([^\n]+)', workflow).group(1)
        modules = command.split()
        for module in modules:
            self.assertTrue((ROOT / 'tests' / (module + '.py')).is_file(), module)
        for module in ('test_center_api', 'test_center_network', 'test_sample', 'test_ci',
                       'test_center_api_remote', 'test_center_domain_remote', 'test_center_multinode_remote', 'test_center_join', 'test_center_devices', 'test_center_safety', 'test_center_gateway', 'test_center_links', 'test_center_review', 'test_center_remote', 'test_center_roles', 'test_gateway_parent', 'test_multinode', 'test_integration'):
            self.assertIn(module, modules)
        self.assertIn('node --test tests/test_frontend.js', workflow)

    def test_the_browser_job_runs_the_screens(self):
        workflow = (ROOT / '.github/workflows/build.yml').read_text(encoding='utf-8')
        job = workflow.split('  browser:', 1)[1].split('  windows-installer:', 1)[0]
        for module in ('test_e2e_browser', 'test_e2e_center', 'test_center_join', 'test_center_devices', 'test_center_safety', 'test_center_review', 'test_center_links', 'test_gateway_parent', 'test_acceptance', 'test_omr'):
            self.assertIn(module, job)
            self.assertTrue((ROOT / 'tests' / (module + '.py')).is_file(), module)
        self.assertIn('HS_CHROMIUM', job)

    def test_installer_publication_requires_an_explicit_version_tag(self):
        workflow = (ROOT / '.github/workflows/build.yml').read_text(encoding='utf-8')
        release = workflow.split('- name: Publish an explicitly tagged release', 1)[1]
        self.assertIn("if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')", release)
        self.assertIn("if: github.event_name == 'workflow_dispatch' || startsWith(github.ref, 'refs/tags/v')", workflow)
        installer = workflow.split('  windows-installer:', 1)[1]
        self.assertIn('needs: [test, browser]', installer, 'a release must also pass real screen checks')


class ShippedFilesTest(unittest.TestCase):
    """The installer copies GATEWAY_SETUP.md and the release uses RELEASE_NOTES.md: both were missing (review A06)."""

    def test_the_installer_preflight_passes(self):
        import subprocess
        import sys
        r = subprocess.run([sys.executable, str(ROOT / 'tools' / 'build_windows.py'), '--check'], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_every_file_the_workflow_ships_exists(self):
        workflow = (ROOT / '.github/workflows/build.yml').read_text(encoding='utf-8')
        for f in re.findall(r'(docs/[A-Z_]+\.md)', workflow):
            self.assertTrue((ROOT / f).is_file(), f)
        self.assertIn('build_windows.py --check', workflow)   # checked on every push, not only when a tag is built


class InstallerTest(unittest.TestCase):
    """Review F03: the firewall lets in only the centre's own network, and the installer speaks Arabic first."""

    def test_firewall_private_networks_only_and_arabic_first(self):
        raw = (ROOT / 'installer' / 'hessa.iss').read_bytes()
        self.assertTrue(raw.startswith(b'\xef\xbb\xbf'), 'UTF-8 with BOM, or Inno Setup misreads the Arabic texts')
        iss = raw.decode('utf-8-sig')
        self.assertNotIn('profile=any', iss)
        self.assertIn('profile=private,domain', iss)
        langs = re.findall(r'^Name: "(\w+)"; MessagesFile', iss, re.M)
        self.assertEqual(langs[0], 'arabic')
        for key in re.findall(r'\{cm:(\w+)\}', iss):
            self.assertIn('arabic.' + key + '=', iss)
            self.assertIn('english.' + key + '=', iss)
