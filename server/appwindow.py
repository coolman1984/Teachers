"""Shows Hessa in its own window, like an installed program: no address bar, no tabs, no bookmarks.

Hessa.exe starts the server and then asks Microsoft Edge (always present on Windows 10/11) or Google Chrome to open the
program in "app" mode with its own profile folder. Windows then shows a separate window with Hessa's own icon in the
taskbar, maximized or full screen (config "app_window": maximized | fullscreen | browser). When neither is found, or
"browser" is chosen, the normal browser opens as before - the program always opens somehow.
"""
import os
import shutil
import subprocess
import sys
import webbrowser

MODES = ('maximized', 'fullscreen', 'browser')
NAMES = ('msedge.exe', 'chrome.exe')


def _windows_candidates():
    out = []
    try:
        import winreg  # standard library, Windows only
        for name in NAMES:
            for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
                try:
                    with winreg.OpenKey(root, r'SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths' + '\\' + name) as k:
                        out.append(winreg.QueryValue(k, None))
                except OSError:
                    pass
    except ImportError:
        pass
    for base in (os.environ.get('ProgramFiles(x86)'), os.environ.get('ProgramFiles'), os.environ.get('LOCALAPPDATA')):
        if base:
            out.append(os.path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
            out.append(os.path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    return out


def find_browser():
    """The Edge or Chrome program that can show an app window, or None."""
    if os.name == 'nt':
        cands = _windows_candidates()
    else:
        cands = [shutil.which(n) for n in ('microsoft-edge', 'microsoft-edge-stable', 'google-chrome', 'google-chrome-stable',
                                          'chromium', 'chromium-browser')]
        if sys.platform == 'darwin':
            cands += ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
                      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    return next((c for c in cands if c and os.path.isfile(c)), None)


def profile_dir(home):
    """The app window keeps its own sign-in cookie and zoom here (per Windows user, never inside the shared data)."""
    base = os.environ.get('LOCALAPPDATA')
    return os.path.join(base, 'Hessa', 'window') if base else os.path.join(home, 'window')


def command(exe, url, mode, profile):
    """The command line of the app window (tested in test_unit.AppWindowTest)."""
    return [exe, f'--app={url}', f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check',
            '--disable-features=Translate', '--class=Hessa',
            '--start-fullscreen' if mode == 'fullscreen' else '--start-maximized']


def open_window(url, mode='maximized', home='.', log=print):
    """Opens the program; returns 'app' (own window) or 'browser'."""
    mode = mode if mode in MODES else 'maximized'
    exe = None if mode == 'browser' else find_browser()
    if exe:
        try:
            profile = profile_dir(home)
            os.makedirs(profile, exist_ok=True)
            flags = getattr(subprocess, 'DETACHED_PROCESS', 0) | getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0)
            subprocess.Popen(command(exe, url, mode, profile), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, close_fds=True, creationflags=flags)
            return 'app'
        except OSError as e:
            log(f'The app window could not be opened ({e}); opening the browser instead.')
    webbrowser.open(url)
    return 'browser'
