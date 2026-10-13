"""Windows boot scheduled task **Hessa** (installer/register_boot_task.ps1). Safety net when install did not register it."""
import os
import subprocess

TASK = 'Hessa'
MARKER = 'boot_task_missing_warned'


def installed_program():
    try:
        from _assets import ASSETS
        return ASSETS is not None
    except ImportError:
        return False


def task_registered():
    if os.name != 'nt':
        return True
    schtasks = os.path.join(os.environ.get('SystemRoot', r'C:\Windows'), 'System32', 'schtasks.exe')
    flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    try:
        r = subprocess.run([schtasks, '/Query', '/TN', TASK, '/FO', 'LIST'], capture_output=True, text=True, check=False, creationflags=flags)
    except OSError:
        return False
    return r.returncode == 0


def warn_once(data_dir, log, interactive):
    """On first start of the installed program, warn once if the boot task is missing."""
    if os.name != 'nt' or not installed_program() or task_registered():
        return
    marker = os.path.join(data_dir, MARKER)
    if os.path.isfile(marker):
        return
    os.makedirs(data_dir, exist_ok=True)
    msg = (
        'The Hessa boot task is missing. Phones and other desks may not reach this PC until someone signs in.\n'
        'Re-run the installer or register the task (see docs/OPERATIONS.md).\n\n'
        'مهمة تشغيل «حصة» عند بدء ويندوز غير موجودة. قد لا تتصل الهواتف والأجهزة الأخرى حتى يسجّل شخص الدخول.\n'
        'أعد تشغيل المثبّت أو سجّل المهمة (راجع docs/OPERATIONS.md).'
    )
    log('Boot task Hessa is not registered on this PC')
    if interactive:
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, msg, 'Hessa', 0x30)
        except (AttributeError, OSError):
            pass
    with open(marker, 'w', encoding='utf-8') as f:
        f.write('1\n')
