"""Windows boot scheduled task **Hessa** (installer/register_boot_task.ps1). Safety net when install did not register it."""
import os
import re
import subprocess
import xml.etree.ElementTree as ET

TASK = 'Hessa'
MARKER = 'boot_task_missing_warned'
_TASK_NS = '{http://schemas.microsoft.com/windows/2004/02/mit/task}'
_HESSA_EXE = re.compile(r'(?:^|[\\/])Hessa\.exe\s*$', re.IGNORECASE)


def installed_program():
    try:
        from _assets import ASSETS
        return ASSETS is not None
    except ImportError:
        return False


def _task_xml():
    if os.name != 'nt':
        return ''
    schtasks = os.path.join(os.environ.get('SystemRoot', r'C:\Windows'), 'System32', 'schtasks.exe')
    flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    try:
        r = subprocess.run([schtasks, '/Query', '/TN', TASK, '/XML'],
                           capture_output=True, text=True, check=False, creationflags=flags)
    except OSError:
        return ''
    if r.returncode != 0:
        return ''
    return r.stdout or ''


def _enabled(settings_el):
    if settings_el is None:
        return True
    enabled = settings_el.find(f'{_TASK_NS}Enabled')
    if enabled is None or enabled.text is None:
        return True
    return enabled.text.strip().lower() not in ('false', '0')


def _action_ok(command, arguments):
    cmd = (command or '').strip().strip('"')
    if not _HESSA_EXE.search(cmd):
        return False
    parts = (arguments or '').split()
    return any(p == '--background' for p in parts)


def task_ok_from_xml(xml_text):
    if not xml_text or not xml_text.strip():
        return False
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return False
    settings = root.find(f'.//{_TASK_NS}Settings')
    if not _enabled(settings):
        return False
    found = False
    for exec_el in root.findall(f'.//{_TASK_NS}Exec'):
        cmd_el = exec_el.find(f'{_TASK_NS}Command')
        args_el = exec_el.find(f'{_TASK_NS}Arguments')
        command = cmd_el.text if cmd_el is not None else ''
        arguments = args_el.text if args_el is not None else ''
        if _action_ok(command, arguments):
            found = True
        elif command or arguments:
            return False
    return found


def task_registered():
    return task_ok_from_xml(_task_xml())


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
