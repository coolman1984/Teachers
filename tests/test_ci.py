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
                       'test_center_api_remote', 'test_center_domain_remote', 'test_center_multinode_remote', 'test_center_join', 'test_center_devices', 'test_center_safety', 'test_center_gateway', 'test_center_links', 'test_center_review', 'test_center_remote', 'test_center_roles', 'test_qbank', 'test_ai', 'test_gateway_parent', 'test_multinode', 'test_integration'):
            self.assertIn(module, modules)
        self.assertIn('node --test tests/test_frontend.js', workflow)

    def test_the_browser_job_runs_the_screens(self):
        workflow = (ROOT / '.github/workflows/build.yml').read_text(encoding='utf-8')
        job = workflow.split('  browser:', 1)[1].split('  windows-installer:', 1)[0]
        for module in ('test_e2e_browser', 'test_e2e_center', 'test_center_join', 'test_center_devices', 'test_center_safety', 'test_center_review', 'test_center_links', 'test_gateway_parent', 'test_acceptance', 'test_omr', 'test_qbank', 'test_ai'):
            self.assertIn(module, job)
            self.assertTrue((ROOT / 'tests' / (module + '.py')).is_file(), module)
        self.assertIn('HS_CHROMIUM', job)

    def test_installer_publication_requires_a_tag_or_a_new_version_on_main(self):
        workflow = (ROOT / '.github/workflows/build.yml').read_text(encoding='utf-8')
        release = workflow.split('- name: Publish a tagged release or a new version merged into main', 1)[1]
        self.assertIn("if: github.event_name == 'push' && (startsWith(github.ref, 'refs/tags/v') || needs.new-version.outputs.new == 'true')", release)
        self.assertIn("if: github.event_name == 'workflow_dispatch' || startsWith(github.ref, 'refs/tags/v') || needs.new-version.outputs.new == 'true'", workflow)
        check = workflow.split('  new-version:', 1)[1].split('  windows-installer:', 1)[0]
        self.assertIn('refs/heads/main', check, 'only main publishes; session branches and pull requests never do')
        self.assertIn('gh release view', check, 'a version that already has a release is never rebuilt')
        installer = workflow.split('  windows-installer:', 1)[1]
        self.assertIn('needs: [test, browser, new-version]', installer, 'a release must also pass real screen checks')


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

    def test_boot_task_autostart_and_refuses_downgrade(self):
        iss = (ROOT / 'installer' / 'hessa.iss').read_bytes().decode('utf-8-sig')
        ps1 = (ROOT / 'installer' / 'register_boot_task.ps1').read_text(encoding='utf-8')
        expected_key = (
            'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\'
            '{24B39F34-055F-4639-BD93-CF67B335C325}_is1'
        )
        m = re.search(r'#define HessaUninstallRegKey "([^"]+)"', iss)
        self.assertIsNotNone(m, 'downgrade check must use the Inno uninstall registry path')
        self.assertEqual(m.group(1), expected_key)
        self.assertIn("UninstallRegKey = '{#HessaUninstallRegKey}'", iss)
        code = iss.split('[Code]', 1)[1]
        self.assertNotIn('{{24B39F34', code, 'doubled { in [Code] breaks RegQueryStringValue for DisplayVersion')
        self.assertNotRegex(code, r"UninstallRegKey\s*=\s*'[^']*\{\{")
        self.assertIn('register_boot_task.ps1', iss)
        self.assertNotIn('dontcopy', iss, 'dontcopy prevents extracting register_boot_task.ps1 before it runs')
        self.assertRegex(iss, r'Source:\s*"register_boot_task\.ps1";\s*DestDir:\s*"\{app\}"')
        self.assertNotIn('procedure CurStepChanged', iss, 'ssPostInstall Abort does not halt setup; use [Run] waituntilterminated')
        run = iss.split('[Run]', 1)[1].split('[UninstallRun]', 1)[0]
        self.assertIn('register_boot_task.ps1', run)
        self.assertRegex(run, r'icacls\.exe.*waituntilterminated', re.I | re.S)
        self.assertRegex(run, r'powershell\.exe.*register_boot_task\.ps1.*waituntilterminated', re.I | re.S)
        self.assertRegex(iss, r'/Delete\s+/TN\s+""Hessa""')
        self.assertNotRegex(iss, r'\{commonstartup\}.*--background')
        self.assertNotIn('/RU SYSTEM', iss)
        self.assertNotRegex(iss, r'^\s*Name:\s*"\{commonappdata\}\\Hessa".*users-modify', re.M)
        self.assertIn('*S-1-5-19:(OI)(CI)M', run)
        self.assertIn('*S-1-5-32-545:(OI)(CI)M', run, 'Users group still needs modify for desk sessions')
        self.assertIn('S-1-5-19', ps1)
        self.assertIn('<LogonType>ServiceAccount</LogonType>', ps1)
        self.assertIn('<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>', ps1)
        self.assertIn('<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>', ps1)
        self.assertIn('<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>', ps1)
        self.assertIn('<RestartOnFailure>', ps1)
        self.assertIn('--background', ps1)
        backup_py = (ROOT / 'server' / 'backup.py').read_text(encoding='utf-8')
        self.assertIn('FILE_ATTRIBUTE_REPARSE_POINT', backup_py)
        self.assertIn('st_file_attributes', backup_py)
        self.assertIn('CompareDotVersions', iss)
        self.assertIn("CompareDotVersions('{#AppVersion}', Installed) < 0", iss)
        self.assertIn('InitializeSetup', iss)
