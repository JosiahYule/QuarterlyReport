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
from socialstats import linkedin as linkedin_source  # noqa: E402

FIXTURES = os.path.join(os.path.dirname(__file__), 'fixtures')


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


class LinkedInWindowTest(unittest.TestCase):
    """The LinkedIn dataset is a file and loads whole; the run filters
    it to the window before mapping, or out-of-window posts inflate the
    quarter. The fixture has one post the day before the window, two
    inside it (first and last day), and one the day after."""

    def test_out_of_window_linkedin_posts_are_dropped(self):
        posts, _account = linkedin_source.load(
            os.path.join(FIXTURES, 'linkedin-window.csv'))
        self.assertEqual(len(posts), 4)  # the loader itself does not filter
        kept = run.in_window(posts, '2026-09-01', '2026-11-30')
        self.assertEqual([p['date'] for p in kept], ['2026-09-01', '2026-11-30'])

    def test_in_window_keeps_boundary_days(self):
        posts = [{'date': '2026-09-01'}, {'date': '2026-11-30'}]
        self.assertEqual(run.in_window(posts, '2026-09-01', '2026-11-30'), posts)
        self.assertEqual(run.in_window(posts, '2026-09-02', '2026-11-29'), [])


if __name__ == '__main__':
    unittest.main()
