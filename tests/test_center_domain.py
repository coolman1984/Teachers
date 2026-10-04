"""Hessa - the pure rules of the centre (server/domain.py): names, mobiles, numbers, grades, timetable, fees, risk, settlements."""
import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
import domain as D  # noqa: E402


class TextTest(unittest.TestCase):
    def test_arabic_spelling_variants_share_one_key(self):
        self.assertEqual(D.key_text('أحمد  عبدالله'), D.key_text('احمد عبدالله'))
        self.assertEqual(D.key_text('فاطمة'), D.key_text('فاطمه'))
        self.assertEqual(D.key_text('مصطفى'), D.key_text('مصطفي'))
        self.assertEqual(D.key_text('ـــمحمـــد'), D.key_text('محمد'))

    def test_mobiles(self):
        for raw in ('01012345678', '+201012345678', '00201012345678', '٠١٠١٢٣٤٥٦٧٨', '010 1234 5678', '201012345678'):
            self.assertEqual(D.norm_mobile_eg(raw), ('01012345678', True), raw)
        self.assertEqual(D.norm_mobile_eg('0101234'), ('0101234', False))
        self.assertEqual(D.norm_mobile_eg('01312345678')[1], False)
        self.assertEqual(D.norm_mobile_eg('')[1], True)      # nothing typed is not a mistake
        self.assertEqual(D.wa_number('01012345678'), '201012345678')
        self.assertEqual(D.wa_number('abc'), '')

    def test_digits(self):
        self.assertEqual(D.digits('١٢٣-45'), '12345')


class NumbersTest(unittest.TestCase):
    def test_document_numbers_carry_the_pc_letter(self):
        self.assertEqual(D.doc_no('R', 2026, 'A', 123), 'R26-A-000123')
        self.assertEqual(D.doc_no('S', 2026, 'B', 7), 'S26-B-0007')
        self.assertEqual(D.parse_doc_no('R26-A-000123'), ('R', 26, 'A', 123))
        self.assertIsNone(D.parse_doc_no('nonsense'))
        self.assertEqual([D.pc_letter(i) for i in (0, 1, 25, 26, 27)], ['A', 'B', 'Z', 'AA', 'AB'])

    def test_student_codes_come_from_the_ranges_of_each_pc(self):
        self.assertEqual(D.next_code([], 0), '10000')
        self.assertEqual(D.next_code(['10000', '10001', 'x'], 0), '10002')
        self.assertEqual(D.next_code(['10005'], 1), '50000')          # PC B starts in its own range
        self.assertEqual(D.next_code(['50007', '10009'], 1), '50008')
        with self.assertRaises(ValueError):
            D.next_code(['89999'], 3)


class GradeTest(unittest.TestCase):
    def test_grades(self):
        self.assertEqual(len(D.GRADES), 12)
        self.assertEqual(D.check_grade('S2', 'bac', 'med'), '')
        self.assertEqual(D.check_grade('S3', 'thanaweya', 'math'), '')
        self.assertEqual(D.check_grade('S1', 'bac', ''), '')
        self.assertEqual(D.check_grade('S1', 'bac', 'med'), 'err.track.bac1')      # the first year of the Baccalaureate is common
        self.assertEqual(D.check_grade('S2', 'bac', 'science'), 'err.track')       # a Thanaweya track is not a Baccalaureate track
        self.assertEqual(D.check_grade('M1', 'bac', ''), 'err.system')
        self.assertEqual(D.check_grade('Z9', '', ''), 'err.grade')
        self.assertEqual(D.check_grade('P3', 'general', ''), '')


def group(gid, day, start, end, teacher='t1', room='r1', **kw):
    return {'id': gid, 'teacherId': teacher, 'roomId': room, 'slots': [{'day': day, 'start': start, 'end': end}], **kw}


class TimetableTest(unittest.TestCase):
    def test_clean_slots(self):
        self.assertEqual(D.clean_slots([{'day': '1', 'start': '9:00', 'end': '10:30'}, {'day': 9, 'start': '10:00', 'end': '11:00'},
                                        {'day': 2, 'start': '12:00', 'end': '11:00'}, 'x', {'day': 3, 'start': '٠٩:٠٠', 'end': '10:00'}]),
                         [{'day': 1, 'start': '09:00', 'end': '10:30', 'roomId': ''}, {'day': 3, 'start': '09:00', 'end': '10:00', 'roomId': ''}])

    def test_week_starts_on_saturday(self):
        self.assertEqual(D.weekday(date(2026, 10, 3)), 0)      # Saturday
        self.assertEqual(D.weekday(date(2026, 10, 4)), 1)      # Sunday
        self.assertEqual(D.weekday(date(2026, 10, 9)), 6)      # Friday

    def test_room_and_teacher_clashes(self):
        a = group('a', 1, '16:00', '18:00', teacher='t1', room='r1')
        b = group('b', 1, '17:00', '19:00', teacher='t2', room='r1')      # same room, overlapping
        c = group('c', 1, '17:30', '19:00', teacher='t1', room='r2')      # same teacher, overlapping
        d = group('d', 1, '18:00', '20:00', teacher='t3', room='r1')      # touches a: not a clash
        e = group('e', 2, '16:00', '18:00', teacher='t1', room='r1')      # another day
        kinds = sorted((x['kind'], x['a'], x['b']) for x in D.clashes([a, b, c, d, e]))
        self.assertEqual(kinds, [('room', 'a', 'b'), ('room', 'b', 'd'), ('teacher', 'a', 'c')])

    def test_groups_that_do_not_overlap_in_time_do_not_clash(self):
        a = group('a', 1, '16:00', '18:00', endDate='2026-12-31')
        b = group('b', 1, '16:00', '18:00', startDate='2027-02-01')
        self.assertEqual(D.clashes([a, b]), [])

    def test_inactive_groups_are_ignored_and_capacity_warns(self):
        a = group('a', 1, '16:00', '18:00', active=False)
        b = group('b', 1, '16:00', '18:00', capacity=30)
        self.assertEqual(D.clashes([a, b]), [])
        out = D.clashes([b], {'r1': {'id': 'r1', 'capacity': 20}})
        self.assertEqual([x['kind'] for x in out], ['capacity'])

    def test_deterministic_session_and_attendance_ids(self):
        sid = D.session_id('gr1', date(2026, 10, 5), '16:00')
        self.assertEqual(sid, 'se-gr1-2026-10-05-1600')
        self.assertEqual(D.attendance_id(sid, 'st9'), 'at-gr1-2026-10-05-1600-st9')

    def test_door_window_and_lateness(self):
        s = {'start': '17:00', 'end': '19:00'}
        self.assertTrue(D.door_window(s, 16 * 60, 90, 30))
        self.assertFalse(D.door_window(s, 15 * 60, 90, 30))
        self.assertTrue(D.door_window(s, 19 * 60 + 30, 90, 30))
        self.assertFalse(D.door_window(s, 19 * 60 + 31, 90, 30))
        self.assertFalse(D.is_late(s, 17 * 60 + 15, 15))
        self.assertTrue(D.is_late(s, 17 * 60 + 16, 15))


class FeeTest(unittest.TestCase):
    ST = {'id': 's1'}

    def test_unit_fee_discount_exemption_and_special_fee(self):
        g = {'fee': 200}
        self.assertEqual(D.unit_fee(g, None, {}), 200)
        self.assertEqual(D.unit_fee(g, None, {'discountPct': 25}), 150)
        self.assertEqual(D.unit_fee(g, {'fee': 120}, {}), 120)
        self.assertEqual(D.unit_fee(g, None, {'exempt': True}), 0)
        self.assertEqual(D.unit_fee(g, None, {'discountPct': 150}), 0)

    def test_session_fees(self):
        g = {'feeType': 'session', 'fee': 50}
        info = D.balance_info(g, {}, self.ST, 3, 100, date(2026, 10, 5))
        self.assertEqual((info['owed'], info['balance'], info['due']), (150, -50, 50))

    def test_month_fees_count_calendar_months(self):
        g = {'feeType': 'month', 'fee': 300}
        e = {'from': '2026-09-20'}
        info = D.balance_info(g, e, self.ST, 0, 300, date(2026, 10, 5))
        self.assertEqual((info['units'], info['owed'], info['balance']), (2, 600, -300))
        e2 = {'from': '2026-09-20', 'to': '2026-09-30'}
        self.assertEqual(D.balance_info(g, e2, self.ST, 0, 0, date(2026, 12, 1))['units'], 1)
        self.assertEqual(D.months_between(date(2026, 11, 30), date(2027, 1, 1)), 3)

    def test_package_fees_are_money_in_advance(self):
        g = {'feeType': 'package', 'fee': 400, 'packageSessions': 8}
        info = D.balance_info(g, {}, self.ST, 3, 400, date(2026, 10, 5))
        self.assertEqual((info['owed'], info['balance'], info['sessionsLeft'], info['sessionPrice']), (150, 250, 5, 50))

    def test_wallet(self):
        pays = [{'kind': 'wallet_topup', 'amount': 300, 'method': 'cash'}, {'kind': 'fee', 'amount': 120, 'method': 'wallet'},
                {'kind': 'fee', 'amount': 80, 'method': 'cash'}]
        self.assertEqual(D.wallet_balance(pays), 180)

    def test_shift_expected_counts_only_cash(self):
        pays = [{'amount': 100, 'method': 'cash'}, {'amount': 50, 'method': 'vodafone'}, {'amount': -30, 'method': 'cash'}, {'amount': 20}]
        exps = [{'amount': 40, 'method': 'cash'}, {'amount': 10, 'method': 'instapay'}]
        self.assertEqual(D.shift_expected(500, pays, exps), 550)
        self.assertEqual(D.by_method(pays), {'cash': 90, 'vodafone': 50})


class RiskTest(unittest.TestCase):
    def test_nothing_wrong(self):
        self.assertEqual(D.risk(['present'] * 8, [80, 75, 82], 0, 50), (0, []))

    def test_consecutive_absences(self):
        self.assertEqual(D.risk(['present'] * 6 + ['absent', 'absent'], [], 0, 0), (30, ['risk.absent2']))
        s, why = D.risk(['present'] * 5 + ['absent', 'absent', 'absent'], [], 0, 0)
        self.assertEqual((s, 'risk.absent3' in why), (50, True))
        # a short history that is half absent also counts as low attendance
        self.assertEqual(D.risk(['present', 'present', 'absent', 'absent'], [], 0, 0), (50, ['risk.absent2', 'risk.lowAttendance']))

    def test_excused_absence_does_not_break_or_count(self):
        s, why = D.risk(['present'] * 6 + ['absent', 'excused', 'absent'], [], 0, 0)
        self.assertIn('risk.absent2', why)

    def test_low_attendance_marks_drop_and_debt_add_up(self):
        statuses = ['present', 'absent', 'present', 'absent', 'absent', 'present', 'absent', 'late']
        s, why = D.risk(statuses, [80, 80, 78, 50, 45], -120, 50)
        self.assertEqual(set(why), {'risk.lowAttendance', 'risk.marksDrop', 'risk.lowMark', 'risk.unpaid'})
        self.assertEqual(s, 20 + 25 + 15 + 20)

    def test_score_is_capped_and_a_recent_call_lowers_it(self):
        s, _ = D.risk(['absent'] * 8, [90, 90, 40, 30], -500, 50)
        self.assertEqual(s, 100)
        a, _ = D.risk(['absent', 'absent'], [], 0, 0)
        b, _ = D.risk(['absent', 'absent'], [], 0, 0, followed_recently=True)
        self.assertEqual((a, b), (30, 20))


class SettlementTest(unittest.TestCase):
    def test_every_arrangement_and_a_mix(self):
        self.assertEqual(D.center_share({'centerPct': 20}, 10000, 20, 300), 2000)
        self.assertEqual(D.center_share({'rentSession': 150}, 10000, 20, 300), 3000)
        self.assertEqual(D.center_share({'rentStudent': 10}, 10000, 20, 300), 3000)
        self.assertEqual(D.center_share({'rentMonth': 3000}, 10000, 20, 300), 3000)
        self.assertEqual(D.center_share({'rentMonth': 1500, 'centerPct': 10}, 10000, 20, 300), 2500)
        self.assertEqual(D.center_share({}, 10000, 20, 300), 0)

    def test_school_support_groups(self):
        self.assertEqual(D.school_split(1000, 15, 80), {'treasury': 150, 'teacher': 680, 'school': 170})

    def test_group_signals(self):
        self.assertEqual(D.group_signal(0.5, 0.9, -10), 'loss')
        self.assertEqual(D.group_signal(0.97, 0.9, 100), 'full')
        self.assertEqual(D.group_signal(0.3, 0.9, 100), 'merge')
        self.assertEqual(D.group_signal(0.8, 0.5, 100), 'watch')
        self.assertEqual(D.group_signal(0.8, 0.9, 100), 'ok')
        self.assertEqual(D.group_signal(None, None, None), 'ok')

    def test_months(self):
        self.assertTrue(D.valid_month('2026-10'))
        self.assertFalse(D.valid_month('2026-13'))
        self.assertEqual(D.month_bounds('2026-02'), (date(2026, 2, 1), date(2026, 2, 28)))
        self.assertEqual(D.month_bounds('2026-12')[1], date(2026, 12, 31))


if __name__ == '__main__':
    unittest.main()
