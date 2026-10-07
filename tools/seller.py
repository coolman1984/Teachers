"""The seller's tool: makes activation codes and password-reset codes for Hessa (server/license.py).

It needs the seller's PRIVATE key, which lives only on the seller's own PC - never in the program, the repository or a
customer's PC. Whoever has that file can make codes: keep a copy on a USB stick in a drawer, not on the cloud.

    python tools/seller.py                       a simple menu in Arabic (double-click tools\\seller.bat on Windows)
    python tools/seller.py init                  make the key pair once (prints the public key to put in server/license_key.py)
    python tools/seller.py issue CODE [CODE...] --days 31 [--centre NAME] [--from YYYY-MM-DD]
                                                  activation for one or more PCs of a centre (their request codes)
    python tools/seller.py reset CODE            a one-time password-reset code for a request shown on a centre PC
    python tools/seller.py show CODE             what a code says (to check before sending)

Every code made is written to ~/.hessa-seller/issued.csv (date, centre, PCs, until) - your own record of who paid.
"""
import argparse
import csv
import os
import sys
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'server'))
import ed25519  # noqa: E402
import license as L  # noqa: E402

HOME = os.environ.get('HESSA_SELLER_HOME') or os.path.join(os.path.expanduser('~'), '.hessa-seller')
KEY = os.path.join(HOME, 'hessa-seller.key')
LOG = os.path.join(HOME, 'issued.csv')


def load_seed():
    try:
        with open(KEY, encoding='ascii') as f:
            seed = bytes.fromhex(f.read().strip())
    except OSError:
        sys.exit(f'The private key was not found: {KEY}\nCopy hessa-seller.key there (from your USB stick), or run "init" once.')
    if ed25519.public_key(seed) != L.public_key():
        sys.exit('This private key does not match the public key built into the program (server/license_key.py).')
    return seed


def record(kind, centre, requests, until, serial):
    os.makedirs(HOME, exist_ok=True)
    new = not os.path.exists(LOG)
    with open(LOG, 'a', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f)
        if new:
            w.writerow(['made', 'kind', 'centre', 'pcs', 'until', 'serial', 'request codes'])
        w.writerow([datetime.now().isoformat(timespec='seconds'), kind, centre, len(requests), until, serial, ' '.join(requests)])


def issue(requests, days, centre='', start=None):
    seed = load_seed()
    machines = []
    for r in requests:
        kind, machine, _ = L.read_request(r)
        if kind != L.KIND_ACTIVATE:
            sys.exit(f'{r} asks for a password reset, not an activation.')
        if machine not in machines:
            machines.append(machine)
    start = start or date.today()
    until = start + timedelta(days=days - 1)
    serial = int(datetime.now().timestamp())
    code = L.make_code(seed, L.KIND_ACTIVATE, machines, until=until, serial=serial)
    record('activate', centre, requests, until.isoformat(), serial)
    return code, until


def reset(request):
    seed = load_seed()
    kind, machine, nonce = L.read_request(request)
    if kind != L.KIND_RESET:
        sys.exit('This is an activation request, not a password reset request.')
    code = L.make_code(seed, L.KIND_RESET, [machine], nonce=nonce)
    record('reset', '', [request], '', 0)
    return code


def init():
    if os.path.exists(KEY):
        sys.exit(f'A key already exists: {KEY}. A new key would make every code you sent useless - delete it yourself if you really mean it.')
    os.makedirs(HOME, exist_ok=True)
    seed = ed25519.generate()
    with open(KEY, 'w', encoding='ascii') as f:
        f.write(seed.hex())
    pub = ed25519.public_key(seed).hex()
    print('Private key saved:', KEY)
    print('Put this PUBLIC key in server/license_key.py and build the program again:\n', pub)
    return pub


def menu():
    print('\n=== حصة - أكواد التفعيل ===\n1) كود تفعيل لسنتر (اشتراك)\n2) كود استعادة كلمة مرور المدير\n3) اقرأ كود\n')
    choice = input('اختر 1 أو 2 أو 3: ').strip()
    if choice == '1':
        reqs = input('كود الطلب من جهاز السنتر (لو أكثر من جهاز افصل بينهم بمسافة): ').split()
        centre = input('اسم السنتر: ').strip()
        days = int(input('عدد الأيام [31]: ').strip() or 31)
        code, until = issue(reqs, days, centre)
        print(f'\nكود التفعيل (يعمل حتى {until.isoformat()}):\n\n{code}\n')
    elif choice == '2':
        print('\nكود الاستعادة:\n\n' + reset(input('كود طلب الاستعادة من جهاز السنتر: ').strip()) + '\n')
    elif choice == '3':
        print(L.read_code(input('الكود: ')))
    input('اضغط Enter للخروج...')


def main(argv):
    if not argv:
        return menu()
    p = argparse.ArgumentParser(description='Hessa activation codes (seller only)')
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('init')
    i = sub.add_parser('issue')
    i.add_argument('requests', nargs='+')
    i.add_argument('--days', type=int, default=31)
    i.add_argument('--centre', default='')
    i.add_argument('--from', dest='start', default='')
    r = sub.add_parser('reset')
    r.add_argument('request')
    s = sub.add_parser('show')
    s.add_argument('code')
    a = p.parse_args(argv)
    if a.cmd == 'init':
        init()
    elif a.cmd == 'issue':
        code, until = issue(a.requests, a.days, a.centre, date.fromisoformat(a.start) if a.start else None)
        print(f'Works until {until.isoformat()}:\n{code}')
    elif a.cmd == 'reset':
        print(reset(a.request))
    else:
        info = L.read_code(a.code)
        print({**info, 'machines': [m.hex() for m in info['machines']]})


if __name__ == '__main__':
    main(sys.argv[1:])
