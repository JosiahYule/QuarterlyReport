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
from socialstats import pull_facebook  # noqa: E402

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


class FacebookReachTest(unittest.TestCase):
    """The Facebook connector's widest preset trails 90 days from the
    pull, so a quarter-end pull cannot see the quarter's first day or
    two. head_gap_days measures that exposure; merge_archive is the
    mitigation, keeping posts earlier pulls captured in the archive."""

    def test_head_gap_days(self):
        from datetime import date
        cases = [
            # (window start, pull date, expected gap)
            ('2026-11-19', date(2026, 11, 19), 0),   # pulled today
            ('2026-09-01', date(2026, 11, 29), 0),   # exactly reachable
            ('2026-09-01', date(2026, 11, 30), 1),   # Sep-Nov pulled on its last day
            ('2026-03-01', date(2026, 5, 31), 2),    # Mar-May is 92 days
            ('2026-12-01', date(2027, 2, 28), 0),    # Dec-Feb is 90: fully reachable
        ]
        for start, today, expected in cases:
            with self.subTest(start=start, today=today):
                self.assertEqual(pull_facebook.head_gap_days(start, today), expected)

    def test_merge_archive_keeps_head_posts_and_fresh_wins(self):
        def post(pid, day, title, impressions):
            return {'external_id': pid, 'date': day, 'time': None,
                    'title': title, 'impressions': impressions}
        archived = [post('a', '2026-09-01', 'Head post', 100),
                    post('b', '2026-10-05', 'Shared post', 200)]
        fresh = [post('b', '2026-10-05', 'Shared post', 260),
                 post('c', '2026-11-20', 'New post', 50)]
        merged = run.merge_archive(fresh, archived)
        self.assertEqual([p['external_id'] for p in merged], ['a', 'b', 'c'])
        # The fresh copy of a shared post wins: its metrics are newer.
        self.assertEqual(merged[1]['impressions'], 260)

    def test_merge_archive_falls_back_to_date_and_title(self):
        archived = [{'external_id': None, 'date': '2026-09-01', 'time': None,
                     'title': 'No id post', 'impressions': 10}]
        fresh = [{'external_id': None, 'date': '2026-09-01', 'time': None,
                  'title': 'No id post', 'impressions': 15}]
        merged = run.merge_archive(fresh, archived)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]['impressions'], 15)


if __name__ == '__main__':
    unittest.main()
