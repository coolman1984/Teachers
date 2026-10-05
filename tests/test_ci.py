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
                       'test_center_api_remote', 'test_center_domain_remote', 'test_center_multinode_remote'):
            self.assertIn(module, modules)
        self.assertIn('node --test tests/test_frontend.js', workflow)

    def test_installer_publication_requires_an_explicit_version_tag(self):
        workflow = (ROOT / '.github/workflows/build.yml').read_text(encoding='utf-8')
        release = workflow.split('- name: Publish an explicitly tagged release', 1)[1]
        self.assertIn("if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')", release)
        self.assertIn("if: github.event_name == 'workflow_dispatch' || startsWith(github.ref, 'refs/tags/v')", workflow)
