"""Keep resource-only APK updates aligned with the current navigation design."""
from copy import deepcopy
import importlib.util
from pathlib import Path
import sys
import unittest

source = Path(__file__).resolve().parents[2] / 'scripts/package-android.py'
sys.path.insert(0, str(source.parent))
spec = importlib.util.spec_from_file_location('package_android', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ManifestMergeTests(unittest.TestCase):
    def setUp(self):
        self.original = {
            'id': 'test-app', 'version': {'name': '1.0.0', 'code': 100},
            'permissions': {'existing-module': {}},
            'plus': {
                'runtimeOnly': {'preserve': True},
                'splashscreen': {'autoclose': False, 'runtimeOnly': True},
                'tabBar': {'height': '52px', 'iconWidth': '22px', 'fontSize': '10px',
                           'list': [{'pagePath': 'pages/home/index', 'text': '首页'}]}
            }
        }
        self.compiled = {
            'id': 'test-app', 'version': {'name': '1.0.0', 'code': 100},
            'permissions': {'unrelated-module': {}},
            'plus': {
                'runtimeOnly': {'preserve': False},
                'splashscreen': {'waiting': False},
                'tabBar': {'height': '74px', 'iconWidth': '34px', 'fontSize': '13px',
                           'list': [{'pagePath': 'pages/home/index', 'text': '首页',
                                     'iconPath': '/static/tabbar/soft-gradient/home.png'}]}
            }
        }

    def test_current_navigation_metadata_replaces_stale_runtime_values(self):
        original_copy = deepcopy(self.original)
        result = module.merge_resource_manifest(self.original, self.compiled)
        self.assertEqual(result['plus']['tabBar'], self.compiled['plus']['tabBar'])
        self.assertEqual(result['plus']['runtimeOnly'], {'preserve': True})
        self.assertEqual(result['permissions'], self.original['permissions'])
        self.assertTrue(result['plus']['splashscreen']['runtimeOnly'])
        self.assertFalse(result['plus']['splashscreen']['waiting'])
        self.assertEqual(self.original, original_copy, 'must not mutate pinned metadata')
        result['plus']['tabBar']['list'][0]['text'] = 'test'
        self.assertEqual(self.compiled['plus']['tabBar']['list'][0]['text'], '首页')

    def test_native_identity_invalid_or_decreasing_versions_are_rejected(self):
        for field, value in [('id', 'different-app'), ('version', {'name': '1.01', 'code': 100}),
                             ('version', {'name': '0.99', 'code': 99})]:
            compiled = deepcopy(self.compiled)
            compiled[field] = value
            with self.subTest(field=field), self.assertRaises((RuntimeError, ValueError)):
                module.merge_resource_manifest(self.original, compiled)

    def test_release_version_is_updated_without_replacing_native_configuration(self):
        self.compiled['version'] = {'name': '1.01', 'code': 101}
        result = module.merge_resource_manifest(self.original, self.compiled)
        self.assertEqual(result['version'], self.compiled['version'])
        self.assertEqual(result['permissions'], self.original['permissions'])
        self.assertEqual(self.original['version']['code'], 100)

    def test_changed_empty_or_removed_native_routes_are_rejected(self):
        for routes in [[], [{'pagePath': 'pages/other/index'}]]:
            compiled = deepcopy(self.compiled)
            compiled['plus']['tabBar']['list'] = routes
            with self.subTest(routes=routes), self.assertRaises(RuntimeError):
                module.merge_resource_manifest(self.original, compiled)
        compiled = deepcopy(self.compiled)
        del compiled['plus']['tabBar']
        with self.assertRaises(RuntimeError):
            module.merge_resource_manifest(self.original, compiled)


if __name__ == '__main__':
    unittest.main()
