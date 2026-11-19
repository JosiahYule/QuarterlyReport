"""Instagram puller tests, with the connector faked at the _run seam.

The case that matters is the metric-key drift found live on Nov 19, 2026:
unique viewers moved from instagram_media_impressions_unique to
instagram_organic_media_content_meta_viewer_count. The fixture values
below are the real ones for post 17947562985083585 (Sep 1, 2026): the
Nov 3 sandbox fixture recorded 79 unique viewers and 103 impressions for
it, and the new key returns the same 79.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from socialstats import pull_instagram  # noqa: E402

POST = {'post_id': '17947562985083585', 'created_at': '2026-09-01 06:26:26',
        'post_caption': 'Seven new roles just opened', 'url': 'https://www.instagram.com/p/x/',
        'likes': 3, 'comments': 0}

BASE_METRICS = {
    'instagram_media_impressions_count': {'total': 103},
    'ig_total_likes_count': {'total': 3},
    'ig_total_comments_count': {'total': 0},
    'ig_total_shares_count': {'total': 0},
    'ig_total_saves_count': {'total': 0},
}


def fake_run(metrics):
    def _run(args):
        if args[0] == 'posts':
            return {'posts': [POST], 'next_cursor': None, 'has_next_page': False}
        return {'metrics': metrics}
    return _run


class UniqueViewersKeyTest(unittest.TestCase):
    def pull_with(self, metrics):
        original = pull_instagram._run
        pull_instagram._run = fake_run(metrics)
        try:
            return pull_instagram.pull('2026-09-01', '2026-11-19')[0]
        finally:
            pull_instagram._run = original

    def test_new_key_is_used(self):
        post = self.pull_with({**BASE_METRICS,
                               'instagram_organic_media_content_meta_viewer_count': 79})
        self.assertEqual(post['unique_viewers'], 79)
        self.assertEqual(post['impressions'], 103)

    def test_legacy_key_still_works_as_fallback(self):
        post = self.pull_with({**BASE_METRICS,
                               'instagram_media_impressions_unique': {'total': 55}})
        self.assertEqual(post['unique_viewers'], 55)

    def test_no_viewer_key_reads_zero_not_a_crash(self):
        post = self.pull_with(dict(BASE_METRICS))
        self.assertEqual(post['unique_viewers'], 0)


if __name__ == '__main__':
    unittest.main()
