"""Writes the Windows program icon (Hessa.exe, desktop shortcut, installer, taskbar) as a .ico file - the same navy tile
with the amber graduation cap as the phone icons (tools/make_app_icons.py). Pure Python, no image files or packages.

    python tools/make_icon.py <output.ico>
"""
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_app_icons import png  # noqa: E402


def ico(sizes=(256, 64, 48, 32, 24, 16)):
    imgs = [png(s) for s in sizes]
    out = struct.pack('<HHH', 0, 1, len(imgs))
    off = 6 + 16 * len(imgs)
    for s, d in zip(sizes, imgs):
        out += struct.pack('<BBBBHHII', s % 256, s % 256, 0, 0, 1, 32, len(d), off)
        off += len(d)
    return out + b''.join(imgs)


if __name__ == '__main__':
    with open(sys.argv[1], 'wb') as f:
        f.write(ico())
    print('icon written to', sys.argv[1])
