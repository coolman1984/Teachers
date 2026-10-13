"""Windows boot scheduled task **Hessa** (installer/register_boot_task.ps1). Safety net when install did not register it."""
import os
import re
import subprocess

TASK = 'Hessa'
MARKER = 'boot_task_missing_warned'
_RUN_RE = re.compile(r'hessa\.exe.*--background|--background.*hessa\.exe', re.IGNORECASE)


def installed_program():
    try:
        from _assets import ASSETS
        return ASSETS is not None
    except ImportError:
        return False


def _task_query_text():
    if os.name != 'nt':
        return ''
    schtasks = os.path.join(os.environ.get('SystemRoot', r'C:\Windows'), 'System32', 'schtasks.exe')
    flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    try:
        r = subprocess.run([schtasks, '/Query', '/TN', TASK, '/FO', 'LIST', '/V'],
                           capture_output=True, text=True, check=False, creationflags=flags)
    except OSError:
        return ''
    if r.returncode != 0:
        return ''
    return r.stdout or ''


def _task_action_ok(text):
    for line in text.splitlines():
        low = line.strip().lower()
        if low.startswith('scheduled task state:') and 'disabled' in low:
            return False
        if low.startswith('status:') and low.endswith('disabled'):
            return False
        if 'task to run:' in low:
            action = line.split(':', 1)[1].strip()
            if not _RUN_RE.search(action.replace('"', '')):
                return False
            return True
    return False


def task_registered():
    text = _task_query_text()
    if not text:
        return False
    return _task_action_ok(text)


def warn_once(data_dir, log, interactive):
    """On first start of the installed program, warn once if the boot task is missing."""
    if os.name != 'nt' or not installed_program() or task_registered():
        return
    marker = os.path.join(data_dir, MARKER)
    if os.path.isfile(marker):
        return
    os.makedirs(data_dir, exist_ok=True)
    msg = (
        'The Hessa boot task is missing or misconfigured. Phones and other desks may not reach this PC until someone signs in.\n'
        'Run the installer again (as administrator) or register the task manually (see docs/OPERATIONS.md).\n\n'
        'مهمة تشغيل «حصة» عند بدء ويندوز غير موجودة أو غير صحيحة. قد لا تتصل الهواتف والأجهزة الأخرى حتى يسجّل شخص الدخول.\n'
        'أعد تشغيل المثبّت (بصلاحيات المسؤول) أو سجّل المهمة يدويًا (راجع docs/OPERATIONS.md).'
    )
    log('Boot task Hessa is not registered correctly on this PC')
    if interactive:
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, msg, 'Hessa', 0x30)
        except (AttributeError, OSError):
            pass
    with open(marker, 'w', encoding='utf-8') as f:
        f.write('1\n')
