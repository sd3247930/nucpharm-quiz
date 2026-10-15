"""Update only Android APK version attributes; preserve all existing XML nodes.

Binary XML structures follow AOSP androidfw/ResourceTypes.h. No resource table,
package identity, permissions, executable code or existing strings are rewritten.
"""
import re
import struct
from xml.etree import ElementTree


def version_code(name):
    # Legacy baseline 1.0.0 is displayed as 1.00 under the decimal release policy.
    if name == '1.0.0':
        return 100
    if not re.fullmatch(r'(?:0|[1-9][0-9]*)\.[0-9]{2}', name):
        raise ValueError('Release version must use two decimal places, e.g. 1.01')
    major, hundredths = name.split('.')
    code = int(major) * 100 + int(hundredths)
    if not 0 < code <= 2100000000:
        raise ValueError('Android version code is out of range')
    return code


def validate_version(version):
    if str(version_code(version['name'])) != str(version['code']):
        raise ValueError('Version name and Android version code disagree')


def _chunks(data):
    if len(data) < 8 or struct.unpack_from('<HHI', data) != (3, 8, len(data)):
        raise ValueError('Invalid Android binary XML header')
    offset = 8
    chunks = []
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError('Truncated Android XML chunk')
        kind, header, size = struct.unpack_from('<HHI', data, offset)
        if not 8 <= header <= size or offset + size > len(data):
            raise ValueError('Invalid Android XML chunk bounds')
        chunks.append((kind, bytearray(data[offset:offset + size])))
        offset += size
    return chunks


def _pool_strings(pool):
    _, header, size, count, styles, flags, start, style_start = struct.unpack_from('<HH6I', pool)
    # Android manifests do not need styled strings. Unknown encodings fail closed.
    if header != 28 or styles or style_start or start != header + count * 4 or start > size:
        raise ValueError('Unsupported Android manifest string pool')
    strings = []
    for index in range(count):
        offset = start + struct.unpack_from('<I', pool, header + index * 4)[0]

        def length(width):
            nonlocal offset
            fmt, high, mask, shift = ('<B', 128, 127, 8) if width == 1 else ('<H', 32768, 32767, 16)
            first = struct.unpack_from(fmt, pool, offset)[0]
            offset += width
            if first & high:
                second = struct.unpack_from(fmt, pool, offset)[0]
                offset += width
                return ((first & mask) << shift) | second
            return first

        chars = length(1 if flags & 256 else 2)
        utf8 = bool(flags & 256)
        byte_length = length(1) if utf8 else chars * 2
        terminator = b'\0' if utf8 else b'\0\0'
        end = offset + byte_length
        if offset < start or end + len(terminator) > size or pool[end:end + len(terminator)] != terminator:
            raise ValueError('Invalid Android manifest string')
        strings.append(bytes(pool[offset:end]).decode('utf-8' if utf8 else 'utf-16-le'))
    return strings, flags


def _append_string(pool, strings, flags, value):
    if value in strings:
        return pool, strings.index(value)
    # Release names are short ASCII, so both variable-length prefixes fit one unit.
    if len(value) >= 128 or not value.isascii():
        raise ValueError('Unsupported release version string')
    start = 28 + len(strings) * 4
    encoded = (bytes([len(value), len(value)]) + value.encode() + b'\0') if flags & 256 else (
        struct.pack('<H', len(value)) + value.encode('utf-16-le') + b'\0\0')
    result = pool[:start] + struct.pack('<I', len(pool) - start) + pool[start:] + encoded
    result += b'\0' * (-len(result) % 4)
    struct.pack_into('<I', result, 4, len(result))
    struct.pack_into('<I', result, 8, len(strings) + 1)
    struct.pack_into('<I', result, 16, flags & ~1)  # Appending invalidates sorted order.
    struct.pack_into('<I', result, 20, start + 4)
    return result, len(strings)


def patch_android_version(data, version):
    """Append a version string and alter only manifest's versionName/versionCode."""
    validate_version(version)
    chunks = _chunks(data)
    pools = [i for i, (kind, _) in enumerate(chunks) if kind == 1]
    if len(pools) != 1:
        raise ValueError('Expected one Android manifest string pool')
    pool_index = pools[0]
    pool = chunks[pool_index][1]
    strings, flags = _pool_strings(pool)
    pool, name_index = _append_string(pool, strings, flags, version['name'])
    chunks[pool_index] = (1, pool)
    found = set()
    roots = 0
    for kind, chunk in chunks:
        if kind != 0x102:
            continue
        header = struct.unpack_from('<H', chunk, 2)[0]
        _, name, start, stride, count = struct.unpack_from('<IIHHH', chunk, header)
        if strings[name] != 'manifest':
            continue
        roots += 1
        if stride != 20 or header + start + count * stride > len(chunk):
            raise ValueError('Unsupported Android manifest attributes')
        for i in range(count):
            offset = header + start + i * stride
            namespace, key, raw, size, zero, value_type, value = struct.unpack_from('<IIIHBBI', chunk, offset)
            attr = strings[key]
            if attr not in ('versionName', 'versionCode'):
                continue
            if namespace == 0xffffffff or strings[namespace] != 'http://schemas.android.com/apk/res/android' or attr in found:
                raise ValueError('Ambiguous Android version attribute')
            if size != 8 or zero or value_type not in ((3,) if attr == 'versionName' else (16, 17)):
                raise ValueError('Unsupported Android version attribute type')
            if attr == 'versionName':
                struct.pack_into('<I', chunk, offset + 8, name_index)
                struct.pack_into('<I', chunk, offset + 16, name_index)
            else:
                if int(version['code']) < value:
                    raise ValueError('Android version code cannot decrease')
                struct.pack_into('<I', chunk, offset + 8, 0xffffffff)
                struct.pack_into('<I', chunk, offset + 16, int(version['code']))
            found.add(attr)
    if roots != 1 or found != {'versionName', 'versionCode'}:
        raise ValueError('Android manifest version attributes are missing')
    body = b''.join(chunk for _, chunk in chunks)
    return struct.pack('<HHI', 3, 8, len(body) + 8) + body


def patch_control_version(data, appid, name):
    """Keep DCloud's bootstrap appver aligned without reserializing its metadata."""
    root = ElementTree.fromstring(data)
    apps = root.findall('./apps/app')
    if len(apps) != 1 or apps[0].get('appid') != appid:
        raise ValueError('DCloud bootstrap app identity differs from compiled resources')
    pattern = rb'(<app\b[^>]*\bappver=([\x22\x27]))[^\x22\x27]*(\2)'
    result, count = re.subn(pattern, lambda m: m[1] + name.encode('ascii') + m[3], data)
    if count != 1 or ElementTree.fromstring(result).find('./apps/app').get('appver') != name:
        raise ValueError('DCloud bootstrap version could not be updated')
    return result
