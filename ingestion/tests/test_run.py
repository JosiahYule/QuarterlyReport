"""Entry-point helpers: the fiscal calendar is the one piece of run.py
logic that can silently file a run under the wrong quarter, so it is
pinned here. Fiscal Q1 is Sep-Nov; the year is the calendar year of the
quarter's last day, matching how the app keys reports (src/config.js
buildQuarter), so Dec-Feb is q2 of the year the February falls in."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import run  # noqa: E402


class FiscalQuarterTest(unittest.TestCase):
    def test_quarters(self):
        # One start date in each fiscal quarter, plus boundaries. The
        # year is the calendar year of the quarter's LAST day, so Q2,
        # Q3 and Q4 carry the year after the fiscal start year.
        cases = {
            '2026-09-01': ('q1', '2026'),
            '2026-11-30': ('q1', '2026'),
            '2026-12-01': ('q2', '2027'),
            '2027-02-28': ('q2', '2027'),
            '2027-03-01': ('q3', '2027'),
            '2027-05-31': ('q3', '2027'),
            '2027-06-01': ('q4', '2027'),
            '2027-08-31': ('q4', '2027'),
            '2027-09-01': ('q1', '2027'),
            # Leap-year Q2 ends Feb 29, 2028.
            '2027-12-01': ('q2', '2028'),
            '2028-02-29': ('q2', '2028'),
        }
        for date, expected in cases.items():
            with self.subTest(date=date):
                self.assertEqual(run.fiscal_quarter(date), expected)


if __name__ == '__main__':
    unittest.main()
