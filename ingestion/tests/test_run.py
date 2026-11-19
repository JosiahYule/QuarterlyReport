"""Entry-point helpers: the fiscal calendar is the one piece of run.py
logic that can silently file a run under the wrong quarter, so it is
pinned here. Fiscal Q1 is Sep-Nov and the fiscal year is labelled by the
year it starts in (Sep 2026 opens fiscal 2026)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import run  # noqa: E402


class FiscalQuarterTest(unittest.TestCase):
    def test_quarters(self):
        cases = {
            '2026-09-01': ('q1', '2026'),
            '2026-11-30': ('q1', '2026'),
            '2026-12-01': ('q2', '2026'),
            '2027-02-28': ('q2', '2026'),
            '2027-03-01': ('q3', '2026'),
            '2027-05-31': ('q3', '2026'),
            '2027-06-01': ('q4', '2026'),
            '2027-08-31': ('q4', '2026'),
            '2027-09-01': ('q1', '2027'),
        }
        for date, expected in cases.items():
            with self.subTest(date=date):
                self.assertEqual(run.fiscal_quarter(date), expected)


if __name__ == '__main__':
    unittest.main()
