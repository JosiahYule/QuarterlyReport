"""Mapper tests. The regression test pins the counting rules to the Nov 3,
2026 sandbox run, whose output was cross-checked against hand counts the
same day (see the sandbox README): if a change to the mapper moves these
numbers, the change is a counting-rule change and should be reviewed as
one, not slipped through as a refactor.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from socialstats import linkedin, mapper  # noqa: E402
from socialstats.normalize import make_post  # noqa: E402

FIXTURES = os.path.join(os.path.dirname(__file__), 'fixtures')


def load_fixture(name):
    with open(os.path.join(FIXTURES, name)) as f:
        return json.load(f)


class Nov3RegressionTest(unittest.TestCase):
    """The full Nov 3 dataset, mapped with the figures the README records:
    followers LinkedIn 3,207 / Facebook 1,951 / Instagram 527, LinkedIn
    period members reached 8,123."""

    @classmethod
    def setUpClass(cls):
        fb = load_fixture('facebook.json')
        ig = load_fixture('instagram.json')
        li, account = linkedin.from_json(os.path.join(FIXTURES, 'linkedin-2026-11-03.json'))
        cls.sections = mapper.build_sections(
            {'facebook': fb, 'instagram': ig, 'linkedin': li},
            {'facebook': 1951, 'instagram': 527, 'linkedin': account['followers']},
            account['members_reached_organic'])

    def test_kpis_match_the_sandbox_run(self):
        self.assertEqual(self.sections['kpis'], {
            'posts': 31, 'impressions': 35081, 'shares': 109, 'reactions': 612,
            'followers': 5685, 'link_clicks': 4763, 'comments': 8,
            'avg_engagement_rate': 2.078, 'followers_start': None,
        })

    def test_summary_matches_the_sandbox_run(self):
        summary = self.sections['_summary']
        self.assertEqual(summary['merged_posts'], 31)
        self.assertEqual(summary['per_platform_posts'],
                         {'linkedin': 26, 'facebook': 25, 'instagram': 21})
        # Saves are excluded from engagements but never silently: the
        # sandbox counted 1 Instagram save and 3 Facebook saves.
        self.assertEqual(summary['saves_excluded_from_engagements']['instagram'], 1)
        self.assertEqual(summary['saves_excluded_from_engagements']['facebook'], 3)

    def test_platform_rows(self):
        rows = {r['name']: r for r in self.sections['platforms']}
        self.assertEqual(rows['LinkedIn']['followers'], 3207)
        self.assertEqual(rows['LinkedIn']['page_reach'], 8123)  # period members reached
        self.assertIn('members reached', rows['LinkedIn']['note'])
        self.assertEqual(rows['Facebook']['followers'], 1951)
        self.assertEqual(rows['Instagram']['followers'], 527)
        # FB/IG reach is the summed per-post unique viewers of the fixture.
        fb = load_fixture('facebook.json')
        self.assertEqual(rows['Facebook']['page_reach'],
                         sum(p['unique_viewers'] for p in fb))

    def test_top_posts_cover_each_platform(self):
        tops = {t['platform']: t for t in self.sections['top_posts']}
        self.assertEqual(set(tops), {'linkedin', 'facebook', 'instagram'})
        for t in tops.values():
            self.assertTrue(t['title'])


class CountingRuleTest(unittest.TestCase):
    def test_kpi_followers_is_none_unless_every_platform_reports(self):
        fb = [make_post('facebook', '2026-09-02', 'Hello', impressions=10)]
        sections = mapper.build_sections(
            {'facebook': fb, 'instagram': [], 'linkedin': []},
            {'facebook': 100, 'instagram': None, 'linkedin': None}, None)
        self.assertIsNone(sections['kpis']['followers'])

    def test_empty_title_gets_the_fallback_and_a_named_row(self):
        fb = [make_post('facebook', '2026-09-02', '', impressions=10)]
        self.assertEqual(fb[0]['title'], 'Facebook post, 2026-09-02')
        sections = mapper.build_sections(
            {'facebook': fb, 'instagram': [], 'linkedin': []},
            {'facebook': 1, 'instagram': 1, 'linkedin': 1}, None)
        self.assertEqual(sections['posts'][0]['post_name'], 'Facebook post, 2026-09-02')

    def test_cross_posts_merge_on_date_and_title(self):
        def post(plat, title):
            return make_post(plat, '2026-09-02', title, impressions=10,
                             reactions=1, comments=1, shares=1)
        sections = mapper.build_sections(
            {'facebook': [post('facebook', 'Seven new roles just opened today')],
             'instagram': [post('instagram', 'Seven new roles just opened today')],
             'linkedin': [post('linkedin', 'Seven new roles just opened today')]},
            {'facebook': 1, 'instagram': 1, 'linkedin': 1}, None)
        self.assertEqual(len(sections['posts']), 1)
        row = sections['posts'][0]
        self.assertEqual(row['platforms'], 'LinkedIn, Facebook, Instagram')
        self.assertEqual(row['impressions'], 30)
        self.assertEqual(row['engagements'], 9)

    def test_saves_never_count_as_engagements(self):
        fb = [make_post('facebook', '2026-09-02', 'Hi', impressions=10, saves=7)]
        sections = mapper.build_sections(
            {'facebook': fb, 'instagram': [], 'linkedin': []},
            {'facebook': 1, 'instagram': 1, 'linkedin': 1}, None)
        self.assertEqual(sections['posts'][0]['engagements'], 0)
        self.assertEqual(sections['_summary']['saves_excluded_from_engagements']['facebook'], 7)

    def test_title_key_uses_first_four_words(self):
        self.assertEqual(mapper.title_key('One, two! THREE four five six'),
                         'one two three four')


class LinkedinImportTest(unittest.TestCase):
    def test_csv_with_titles(self):
        posts, account = linkedin.from_csv(
            os.path.join(FIXTURES, 'linkedin-posts-with-titles.csv'))
        self.assertEqual(len(posts), 3)
        first = posts[0]
        self.assertTrue(first['title'].startswith('Be the change'))
        self.assertEqual(first['shares'], 5)  # reposts land in shares
        self.assertEqual(first['clicks'], 0)  # the CSV reports no clicks
        self.assertEqual(account, {'followers': None, 'members_reached_organic': None})

    def test_csv_without_titles_gets_fallback_titles(self):
        posts, _ = linkedin.from_csv(
            os.path.join(FIXTURES, 'linkedin-posts-no-titles.csv'))
        self.assertEqual(posts[0]['title'], 'LinkedIn post, 2026-11-18')
        self.assertTrue(all(p['title'] for p in posts))

    def test_json_capture_keeps_account_figures_and_clicks(self):
        posts, account = linkedin.from_json(
            os.path.join(FIXTURES, 'linkedin-2026-11-03.json'))
        self.assertEqual(len(posts), 26)
        self.assertEqual(account['followers'], 3207)
        self.assertEqual(account['members_reached_organic'], 8123)
        # LinkedIn clicks count as link clicks (no separate figure exists).
        self.assertTrue(all(p['link_clicks'] == p['clicks'] for p in posts))


if __name__ == '__main__':
    unittest.main()
