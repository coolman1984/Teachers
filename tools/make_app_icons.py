"""Draws the phone home-screen icons (lib/icon-192.png, lib/icon-512.png, lib/icon-180.png for iPhone) with the
standard library only: an amber rounded square with the dark graduation cap of the sidebar brand mark.
Run once after changing the colours: python tools/make_app_icons.py"""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AMBER, INK = (0xF2, 0xA9, 0x00), (0x20, 0x15, 0x00)


def inside(px, py, poly):
    """Even-odd point-in-polygon test (polygon in 0..1 units)."""
    hit, j = False, len(poly) - 1
    for i, (xi, yi) in enumerate(poly):
        xj, yj = poly[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


# the cap: a flat diamond (the board), the band under it and the tassel cord, in a 32-unit grid like the favicon
def u(points):
    return [(x / 32, y / 32) for x, y in points]


SHAPES = [
    u([(4, 13), (16, 7.5), (28, 13), (16, 18.5)]),                      # board
    u([(9.5, 15.5), (22.5, 15.5), (22.5, 21.5), (16, 24.5), (9.5, 21.5)]),  # band
    u([(26.6, 13.4), (27.8, 13.4), (27.8, 22.5), (26.6, 22.5)]),       # cord
    u([(25.8, 22.2), (28.6, 22.2), (28.6, 24.6), (25.8, 24.6)]),       # tassel
]


def pixel(x, y, n):
    """Colour of pixel (x, y) with 4x4 supersampling for smooth edges; transparent outside the rounded square."""
    r, total = 0.22, [0, 0, 0, 0]
    for sy in range(4):
        for sx in range(4):
            px, py = (x + (sx + .5) / 4) / n, (y + (sy + .5) / 4) / n
            cx, cy = min(max(px, r), 1 - r), min(max(py, r), 1 - r)
            if (px - cx) ** 2 + (py - cy) ** 2 > r * r:
                continue
            c = INK if any(inside(px, py, s) for s in SHAPES) else AMBER
            total[0] += c[0]; total[1] += c[1]; total[2] += c[2]; total[3] += 255
    a = total[3] / 16
    if not a:
        return (0, 0, 0, 0)
    k = 255 / total[3]
    return (round(total[0] * k), round(total[1] * k), round(total[2] * k), round(a))


def png(n):
    rows = b''.join(b'\x00' + bytes(v for x in range(n) for v in pixel(x, y, n)) for y in range(n))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)  # noqa: E731
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')


if __name__ == '__main__':
    for size in (180, 192, 512):
        with open(os.path.join(ROOT, 'lib', f'icon-{size}.png'), 'wb') as f:
            f.write(png(size))
        print('lib/icon-%d.png' % size)
