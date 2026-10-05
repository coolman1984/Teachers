"""Takes the pictures of the user guides (docs/GUIDE_*.md) from the real program with the fictional sample centre, in Arabic.
Run again after a screen changes, so the guides always show what the people see.

    python tools/make_screens.py            needs Playwright and Chromium (HS_CHROMIUM, default /opt/pw-browsers/chromium)

Every name in the pictures is fictional (server/sample.py); nothing of a real centre is ever photographed."""
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tests'))
from harness import ADMIN, Server, make_authority  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

OUT = os.path.join(ROOT, 'docs', 'img')
CHROMIUM = os.environ.get('HS_CHROMIUM', '/opt/pw-browsers/chromium')


def shot(pg, name, full=False):
    pg.wait_for_timeout(900)                       # entrance animations end before the picture
    pg.screenshot(path=os.path.join(OUT, name + '.jpg'), type='jpeg', quality=72, full_page=full)
    print('  ', name)


def page(browser, base, width, height, theme='daylight'):
    ctx = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=1)
    ctx.add_init_script("localStorage.setItem('hs.prefs', %s)" % json.dumps(json.dumps({'welcomed': True, 'lang': 'ar', 'theme': theme})))
    pg = ctx.new_page()
    pg.goto(base)
    pg.fill('#username', ADMIN[0])
    pg.fill('#password', ADMIN[1])
    pg.click('button[type=submit]')
    pg.wait_for_selector('#app-shell')
    pg.evaluate('window.print = () => {}')
    return pg


def main():
    os.makedirs(OUT, exist_ok=True)
    s = Server('screens').start()
    try:
        c = make_authority(s)
        c.post('/api/first-run', {})
        c.post('/api/c/sample', {})
        today = [x for x in c.get('/api/c/today')['sessions'] if x.get('status') != 'cancelled']
        roster = c.get('/api/c/roster?session=' + today[0]['id'])['rows'] if today else []
        waiting = next((r['student'] for r in roster if not r.get('status') or r['status'] == 'absent'), roster[0]['student'] if roster else None)
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path=CHROMIUM)
            pg = page(b, s.base, 1280, 800)
            pg.goto(s.base + '/#/overview'); pg.wait_for_selector('#view > *'); shot(pg, 'owner-overview')
            pg.goto(s.base + '/#/door'); pg.wait_for_selector('#door-q')
            if waiting:
                pg.fill('#door-q', waiting['code']); pg.wait_for_selector('[data-results] li[data-i]'); pg.keyboard.press('Enter')
                pg.wait_for_selector('[data-checkin]')
            shot(pg, 'desk-door-card')
            pg.click('[data-pay]')
            if pg.wait_for_selector('#sh-o, #pay-a').get_attribute('id') == 'sh-o':
                shot(pg, 'desk-open-shift'); pg.fill('#sh-o', '500'); pg.click('.dialog [data-ok]'); pg.wait_for_selector('#pay-a')
            shot(pg, 'desk-pay')
            pg.click('.dialog [data-close]') if pg.query_selector('.dialog [data-close]') else pg.keyboard.press('Escape')
            pg.goto(s.base + '/#/money'); pg.wait_for_selector('[data-close-shift]'); pg.click('[data-close-shift]'); pg.wait_for_selector('.dialog'); shot(pg, 'desk-close-shift')
            pg.keyboard.press('Escape')
            pg.goto(s.base + '/#/students'); pg.wait_for_selector('tr[data-id]'); pg.click('tr[data-id]'); pg.wait_for_selector('.drawer.on'); shot(pg, 'owner-student-file')
            pg.keyboard.press('Escape')
            pg.goto(s.base + '/#/groups?tab=timetable'); pg.wait_for_selector('#view > *'); shot(pg, 'teacher-timetable')
            pg.goto(s.base + '/#/exams'); pg.wait_for_selector('tbody tr'); pg.click('tbody tr'); pg.wait_for_selector('.drawer.on [data-sheet]'); shot(pg, 'teacher-marks')
            pg.keyboard.press('Escape')
            pg.goto(s.base + '/#/followup'); pg.wait_for_selector('.risk-card'); shot(pg, 'assistant-followup')
            pg.goto(s.base + '/#/settlements'); pg.wait_for_selector('.set-card'); shot(pg, 'owner-settlements')
            pg.goto(s.base + '/#/reports'); pg.wait_for_selector('.rep-kpis'); shot(pg, 'owner-reports')
            pg.goto(s.base + '/#/settings?tab=gateway'); pg.wait_for_selector('.gw-steps'); shot(pg, 'owner-parent-links')
            pg.goto(s.base + '/#/settings?tab=remote'); pg.wait_for_selector('[data-rm]'); shot(pg, 'owner-remote')
            phone = page(b, s.base, 390, 844)
            phone.goto(s.base + '/#/overview'); phone.wait_for_selector('#view > *'); shot(phone, 'phone-overview')
            phone.goto(s.base + '/#/door'); phone.wait_for_selector('#door-q'); shot(phone, 'phone-door')
            b.close()
    finally:
        s.cleanup()


if __name__ == '__main__':
    t = time.time()
    main()
    print(f'done in {time.time() - t:.0f} s -> docs/img')
