"""Version updates must not change APK identity, permissions or shared strings."""
import importlib.util
from pathlib import Path
import struct
import sys
import unittest

scripts = Path(__file__).resolve().parents[2] / 'scripts'
sys.path.insert(0, str(scripts))
from android_version import patch_android_version, patch_control_version, version_code

spec = importlib.util.spec_from_file_location('release_version', scripts / 'release-version.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def manifest_fixture(utf8=False, code=100):
    strings = ['manifest', 'http://schemas.android.com/apk/res/android', 'versionName',
               'versionCode', 'package', 'example.app', '1.0.0', 'application', 'label']
    payload = b''
    offsets = []
    for value in strings:
        offsets.append(len(payload))
        payload += (bytes([len(value), len(value)]) + value.encode() + b'\0') if utf8 else (
            struct.pack('<H', len(value)) + value.encode('utf-16-le') + b'\0\0')
    payload += b'\0' * (-len(payload) % 4)
    start = 28 + len(strings) * 4
    pool = struct.pack('<HH6I', 1, 28, start + len(payload), len(strings), 0, 256 if utf8 else 0, start, 0)
    pool += struct.pack(f'<{len(offsets)}I', *offsets) + payload

    def attr(ns, key, raw, kind, value):
        return struct.pack('<IIIHBBI', ns, key, raw, 8, 0, kind, value)

    def node(name, attributes):
        return struct.pack('<HHIII', 0x102, 16, 36 + len(attributes), 1, 0xffffffff) + struct.pack(
            '<II6H', 0xffffffff, name, 20, 20, len(attributes) // 20, 0, 0, 0) + attributes

    # Application label intentionally shares the ORIGINAL version string.
    root = node(0, attr(1, 2, 6, 3, 6) + attr(1, 3, 0xffffffff, 16, code) + attr(0xffffffff, 4, 5, 3, 5))
    child = node(7, attr(1, 8, 6, 3, 6))
    body = pool + root + child
    return struct.pack('<HHI', 3, 8, 8 + len(body)) + body, child


class AndroidVersionTests(unittest.TestCase):
    def test_utf8_and_utf16_updates_preserve_other_nodes_and_existing_strings(self):
        for utf8 in (True, False):
            with self.subTest(utf8=utf8):
                original, child = manifest_fixture(utf8)
                result = patch_android_version(original, {'name': '1.01', 'code': 101})
                self.assertTrue(result.endswith(child), 'shared application label and all child attributes stay intact')
                self.assertIn('1.0.0'.encode('utf-8' if utf8 else 'utf-16-le'), result)
                self.assertIn('1.01'.encode('utf-8' if utf8 else 'utf-16-le'), result)
                pool_size = struct.unpack_from('<I', result, 12)[0]
                root = 8 + pool_size
                self.assertEqual(struct.unpack_from('<I', result, root + 36 + 20 + 16)[0], 101)
                self.assertEqual(struct.unpack_from('<I', result, 4)[0], len(result))
                self.assertEqual(patch_android_version(result, {'name': '1.01', 'code': 101}), result)

    def test_invalid_truncated_and_downgrade_inputs_are_rejected(self):
        original, _ = manifest_fixture(code=102)
        for data, version in [(original, {'name': '1.01', 'code': 101}),
                              (original, {'name': '1.03', 'code': 999}),
                              (original[:15], {'name': '1.03', 'code': 103}),
                              (b'', {'name': '1.03', 'code': 103})]:
            with self.subTest(length=len(data), version=version), self.assertRaises((ValueError, struct.error)):
                patch_android_version(data, version)

    def test_only_bootstrap_appver_changes_and_identity_is_checked(self):
        source = b'<hbuilder engine="fixed"><apps><app appid="app" appver="1.0.0"/></apps><signature>retain</signature></hbuilder>'
        self.assertEqual(patch_control_version(source, 'app', '1.01'), source.replace(b'appver="1.0.0"', b'appver="1.01"'))
        with self.assertRaises(ValueError):
            patch_control_version(source, 'other-app', '1.01')

    def test_decimal_policy_has_no_rounding_errors_and_npm_remains_semver(self):
        for before, change, after, code, npm in [
            ('1.0.0', 'small', '1.01', 101, '1.0.1'),
            ('1.01', 'small', '1.02', 102, '1.0.2'),
            ('1.01', 'large', '1.11', 111, '1.1.1'),
            ('1.09', 'small', '1.10', 110, '1.1.0'),
            ('1.99', 'small', '2.00', 200, '2.0.0'),
        ]:
            with self.subTest(before=before, change=change):
                self.assertEqual(release.next_version(before, change), (after, code))
                self.assertEqual(release.npm_version(code), npm)
                self.assertEqual(version_code(after), code)
        for invalid in ('1.1', '1.001', '01.01', '-1.01', '1.01-rc.1', 'nan'):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                version_code(invalid)


if __name__ == '__main__':
    unittest.main()
