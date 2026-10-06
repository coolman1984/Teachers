"""Draws Hessa's icon with the standard library only: a deep-navy rounded tile (soft light from the top) with the amber
graduation cap of the sidebar brand mark, its board lit from above. The same drawing makes the phone home-screen icons
(lib/icon-180/192/512.png), the window/taskbar icon and the Windows program icon (tools/make_icon.py -> hessa.ico).
Run once after changing the colours: python tools/make_app_icons.py"""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOP, BOTTOM = (0x24, 0x47, 0x80), (0x0B, 0x1A, 0x33)      # navy tile, lighter at the top
BOARD, BAND, CORD = (0xFF, 0xC4, 0x3D), (0xF2, 0xA9, 0x00), (0xE0, 0x96, 0x00)
RIM = (0xFF, 0xD9, 0x7A)                                   # thin lit edge of the board


def inside(px, py, poly):
    """Even-odd point-in-polygon test (polygon in 0..1 units)."""
    hit, j = False, len(poly) - 1
    for i, (xi, yi) in enumerate(poly):
        xj, yj = poly[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def u(points):
    """32-unit grid (like the favicon) -> 0..1."""
    return [(x / 32, y / 32) for x, y in points]


# front to back: the first shape that contains a point gives its colour
SHAPES = [
    (u([(25.9, 21.6), (28.5, 21.6), (28.9, 25.2), (25.5, 25.2)]), CORD),           # tassel
    (u([(26.7, 13.6), (27.7, 13.6), (27.7, 21.8), (26.7, 21.8)]), CORD),           # cord
    (u([(5, 13.2), (16, 8.2), (27, 13.2), (16, 18.2)]), BOARD),                    # board (lit)
    (u([(4.2, 13.2), (16, 7.4), (27.8, 13.2), (16, 19)]), RIM),                    # lit edge around the board
    (u([(9.6, 15.6), (22.4, 15.6), (22.4, 21.6), (16, 24.6), (9.6, 21.6)]), BAND),  # band under the board
]


def colour(px, py):
    for poly, c in SHAPES:
        if inside(px, py, poly):
            return c
    t = py
    glow = max(0.0, 1 - ((px - .5) ** 2 + (py - .18) ** 2) / .22) * .18   # soft light near the top
    return tuple(min(255, round(TOP[i] * (1 - t) + BOTTOM[i] * t + 255 * glow * (1 - t))) for i in range(3))


def pixel(x, y, n, ss=4):
    """Colour of pixel (x, y) with ss x ss supersampling for smooth edges; transparent outside the rounded tile."""
    r, total, hits = 0.225, [0, 0, 0], 0
    for sy in range(ss):
        for sx in range(ss):
            px, py = (x + (sx + .5) / ss) / n, (y + (sy + .5) / ss) / n
            cx, cy = min(max(px, r), 1 - r), min(max(py, r), 1 - r)
            if (px - cx) ** 2 + (py - cy) ** 2 > r * r:
                continue
            c = colour(px, py)
            total[0] += c[0]; total[1] += c[1]; total[2] += c[2]; hits += 1
    if not hits:
        return (0, 0, 0, 0)
    return (round(total[0] / hits), round(total[1] / hits), round(total[2] / hits), round(255 * hits / (ss * ss)))


def draw(n):
    """Rows of RGBA pixels, n x n."""
    return [[pixel(x, y, n) for x in range(n)] for y in range(n)]


def png(n, rows=None):
    rows = rows or draw(n)
    raw = b''.join(b'\x00' + bytes(v for p in row for v in p) for row in rows)
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)  # noqa: E731
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


if __name__ == '__main__':
    for size in (180, 192, 512):
        with open(os.path.join(ROOT, 'lib', f'icon-{size}.png'), 'wb') as f:
            f.write(png(size))
        print('lib/icon-%d.png' % size)
