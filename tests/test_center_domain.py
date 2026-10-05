"""Pure centre rules: no server, database or external packages."""
import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), 'server'))
import domain as D


class CenterDomainTest(unittest.TestCase):
    def test_mobile_normalization(self):
        cases = [('01012345678', '01012345678', True), ('+201012345678', '01012345678', True),
                 ('00201012345678', '01012345678', True), ('٠١٠١٢٣٤٥٦٧٨', '01012345678', True),
                 ('01512345678', '01512345678', True), ('01912345678', '01912345678', False),
                 ('bad', 'bad', False), ('0123', '0123', False), ('', '', True)]
        for value, mobile, valid in cases:
            with self.subTest(value=value):
                self.assertEqual(D.norm_mobile_eg(value), (mobile, valid))
        self.assertEqual(D.wa_number('01012345678'), '201012345678')
        self.assertEqual(D.wa_number('0123'), '')

    def test_name_comparison_and_digits(self):
        self.assertEqual(D.key_text('  إِيـمان   على، ١٢  '), D.key_text('ايمان علي 12'))
        self.assertEqual(D.key_text('علی کریم'), D.key_text('علي كريم'))   # Persian yeh and kaf from some keyboards
        self.assertEqual(D.norm_text('أحمد\u200f  علي'), 'أحمد علي')
        self.assertEqual(D.digits('۱۰-٢٠'), '1020')

    def test_document_numbers_and_pc_letters(self):
        for prefix, width in [('R', 6), ('E', 6), ('S', 4)]:
            value = D.doc_no(prefix, 2026, 'AB', 12)
            self.assertEqual(value, f'{prefix}26-AB-{12:0{width}d}')
            self.assertEqual(D.parse_doc_no(value), (prefix, 26, 'AB', 12))
        self.assertIsNone(D.parse_doc_no('bad'))
        for index, letter in [(0, 'A'), (25, 'Z'), (26, 'AA'), (27, 'AB')]:
            self.assertEqual(D.pc_letter(index), letter)

    def test_student_code_ranges_and_exhaustion(self):
        for index, (lo, hi) in enumerate(D.CODE_RANGES):
            self.assertEqual(D.next_code([], index), str(lo))
            self.assertEqual(D.next_code([str(lo), 'invalid', str(hi + 1)], index), str(lo + 1))
            with self.assertRaises(ValueError):
                D.next_code([str(hi)], index)
        self.assertEqual(D.next_code([], 5), '150000')

    def test_grade_system_and_track(self):
        cases = [('S1', 'bac', '', ''), ('S1', 'bac', 'med', 'err.track.bac1'),
                 ('S2', 'bac', 'med', ''), ('S2', 'bac', 'science', 'err.track'),
                 ('P1', 'bac', '', 'err.system'), ('X1', 'general', '', 'err.grade'),
                 ('M1', 'azhar', '', ''), ('S3', 'thanaweya', 'math', '')]
        for grade, system, track, error in cases:
            self.assertEqual(D.check_grade(grade, system, track), error)

    def test_times_and_slots(self):
        self.assertEqual(D.hm('١٧:٣٠'), 1050)
        for value in ['24:00', '-1:30', '12:60', 'no']:
            self.assertIsNone(D.hm(value))
        self.assertEqual(D.clean_slots([None, {}, {'day': 7, 'start': '12:00', 'end': '13:00'},
                         {'day': '0', 'start': '9:00', 'end': '10:00'},
                         {'day': 0, 'start': '11:00', 'end': '10:00'}]),
                         [{'day': 0, 'start': '09:00', 'end': '10:00', 'roomId': ''}])
        self.assertEqual(D.weekday(date(2026, 10, 3)), 0)
        self.assertEqual(D.weekday(date(2026, 10, 9)), 6)

    def test_sessions_are_deterministic_and_date_bounded(self):
        group = {'id': 'g1', 'active': True, 'startDate': '2026-10-01', 'endDate': '2026-10-31',
                 'slots': [{'day': 0, 'start': '17:00', 'end': '18:00'}]}
        self.assertEqual(len(D.slots_on(group, date(2026, 10, 3))), 1)
        self.assertEqual(D.slots_on(group, date(2026, 11, 7)), [])
        sid = D.session_id('g1', date(2026, 10, 3), '17:00')
        self.assertEqual(sid, 'se-g1-2026-10-03-1700')
        self.assertEqual(D.attendance_id(sid, 's1'), 'at-g1-2026-10-03-1700-s1')
        session = {'start': '17:00', 'end': '18:00'}
        self.assertTrue(D.door_window(session, 990, 90, 30))
        self.assertFalse(D.door_window(session, 989, 30, 30))
        self.assertFalse(D.is_late(session, 1035, 15))
        self.assertTrue(D.is_late(session, 1036, 15))

    def test_timetable_clashes_and_nonoverlapping_periods(self):
        slot = {'day': 0, 'start': '17:00', 'end': '18:00', 'roomId': 'r1'}
        a = {'id': 'g1', 'teacherId': 't1', 'slots': [slot], 'capacity': 40}
        b = {'id': 'g2', 'teacherId': 't1', 'slots': [slot], 'capacity': 25}
        rooms = {'r1': {'id': 'r1', 'capacity': 30}}
        self.assertEqual({c['kind'] for c in D.clashes([a, b], rooms)}, {'room', 'teacher', 'capacity'})
        self.assertEqual(D.clashes([{**a, 'endDate': '2026-09-30'}, {**b, 'startDate': '2026-10-01'}]), [])
        self.assertEqual(D.clashes([a, {**b, 'slots': [{**slot, 'start': '18:00', 'end': '19:00'}]}]), [])

    def test_inactive_groups_do_not_create_capacity_warnings(self):
        group = {'id': 'g1', 'active': False, 'capacity': 50,
                 'slots': [{'day': 0, 'start': '17:00', 'end': '18:00', 'roomId': 'r1'}]}
        self.assertEqual(D.clashes([group], {'r1': {'id': 'r1', 'capacity': 25}}), [])

    def test_unit_fee_discounts_exemptions_and_special_fee(self):
        self.assertEqual(D.unit_fee({'fee': 100}, {}, {'discountPct': 25}), 75)
        self.assertEqual(D.unit_fee({'fee': 100}, {'fee': 80}, {'discountPct': 25}), 60)
        self.assertEqual(D.unit_fee({'fee': 100}, {'fee': 0}, {}), 0)
        self.assertEqual(D.unit_fee({'fee': 100}, {}, {'exempt': True}), 0)

    def test_fee_types_and_months_crossing_years(self):
        today = date(2027, 1, 15)
        enrollment = {'from': '2026-12-10'}
        self.assertEqual(D.charges({'feeType': 'session', 'fee': 50}, enrollment, {}, 3, today), (150, 3))
        self.assertEqual(D.charges({'feeType': 'month', 'fee': 200}, enrollment, {}, 3, today), (400, 2))
        self.assertEqual(D.charges({'feeType': 'month', 'fee': 200}, {**enrollment, 'to': '2026-12-31'}, {}, 3, today), (200, 1))
        self.assertEqual(D.charges({'feeType': 'package', 'fee': 400, 'packageSessions': 8}, enrollment, {}, 3, today), (150, 3))
        self.assertEqual(D.months_between(date(2027, 2, 1), today), 0)

    def test_balances_are_computed_from_visits_and_receipts(self):
        group = {'feeType': 'session', 'fee': 50}
        result = D.balance_info(group, {}, {}, 3, 100, date(2026, 10, 4))
        self.assertEqual((result['balance'], result['due']), (-50, 50))
        group = {'feeType': 'package', 'fee': 400, 'packageSessions': 8}
        self.assertEqual(D.balance_info(group, {}, {}, 3, 400, date(2026, 10, 4))['sessionsLeft'], 5)

    def test_package_session_count_does_not_lose_a_visit_to_rounding(self):
        group = {'feeType': 'package', 'fee': 100, 'packageSessions': 6}
        for visits in range(7):
            result = D.balance_info(group, {}, {}, visits, 100, date(2026, 10, 4))
            self.assertEqual(result['sessionsLeft'], 6 - visits)

    def test_wallet_balance_and_reversals(self):
        receipts = [{'kind': 'wallet_topup', 'amount': 300, 'method': 'cash'},
                    {'kind': 'fee', 'amount': 120, 'method': 'wallet'},
                    {'kind': 'fee', 'amount': -20, 'method': 'wallet'}]
        self.assertEqual(D.wallet_balance(receipts), 200)
        receipts.append({'kind': 'wallet_topup', 'amount': -50, 'method': 'cash'})
        self.assertEqual(D.wallet_balance(receipts), 150)

    def test_cash_shift_and_method_totals(self):
        payments = [{'amount': 100, 'method': 'cash'}, {'amount': 50, 'method': 'vodafone'},
                    {'amount': -20, 'method': 'cash'}]
        expenses = [{'amount': 30, 'method': 'cash'}, {'amount': 99, 'method': 'bank'},
                    {'amount': -10, 'method': 'cash'}]
        self.assertEqual(D.shift_expected(500, payments, expenses), 560)
        self.assertEqual(D.by_method(payments), {'cash': 80, 'vodafone': 50})

    def test_each_early_warning_reason(self):
        cases = [(['absent'] * 3, [], 0, 50, 'risk.absent3', 50),
                 (['absent'] * 2, [], 0, 50, 'risk.absent2', 30),
                 (['absent', 'present', 'absent', 'present'], [], 0, 50, 'risk.lowAttendance', 20),
                 ([], [90, 70, 70], 0, 50, 'risk.marksDrop', 25),
                 ([], [40], 0, 50, 'risk.lowMark', 15),
                 ([], [], -75, 50, 'risk.unpaid', 20),
                 (['late'] * 3, [], 0, 50, 'risk.oftenLate', 10)]
        for attendance, scores, balance, unit, reason, score in cases:
            result, reasons = D.risk(attendance, scores, balance, unit)
            self.assertIn(reason, reasons)
            self.assertEqual(result, score)
        self.assertEqual(D.risk(['absent'] * 8, [90, 30, 20], -200, 50)[0], 100)
        self.assertEqual(D.risk(['absent'] * 2, [], 0, 50, True)[0], 20)
        self.assertEqual(D.risk([], [], 0, 0, True)[0], 0)

    def test_settlement_models_and_mixed_terms(self):
        cases = [({'centerPct': 20}, 200), ({'rentMonth': 1500}, 1500),
                 ({'rentSession': 50}, 200), ({'rentStudent': 5}, 150),
                 ({'rentMonth': 100, 'rentSession': 50, 'rentStudent': 5, 'centerPct': 20}, 650)]
        for teacher, expected in cases:
            self.assertEqual(D.center_share(teacher, 1000, 4, 30), expected)

    def test_school_split_and_profit_signals(self):
        self.assertEqual(D.school_split(1000, 15, 80), {'treasury': 150, 'teacher': 680, 'school': 170})
        cases = [(1, 1, -1, 'loss'), (.95, 1, 1, 'full'), (.39, 1, 1, 'merge'),
                 (.6, .59, 1, 'watch'), (.6, .6, 1, 'ok')]
        for utilisation, rate, profit, expected in cases:
            self.assertEqual(D.group_signal(utilisation, rate, profit), expected)

    def test_month_boundaries(self):
        self.assertEqual(D.month_bounds('2024-02'), (date(2024, 2, 1), date(2024, 2, 29)))
        self.assertEqual(D.month_bounds('2026-12'), (date(2026, 12, 1), date(2026, 12, 31)))
        for value in ['2026-00', '2026-13', 'x', None]:
            self.assertFalse(D.valid_month(value))


if __name__ == '__main__':
    unittest.main()
