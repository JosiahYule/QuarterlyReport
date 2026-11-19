#!/usr/bin/env python3
"""Pull @integrated.staffing Instagram posts for a window via instagram-cli.

Lists posts in the window, then reads lifetime insights per post, so
Instagram uses the same basis as Facebook and LinkedIn: posts published in
the window, lifetime metrics. (The account-activity totals the Instagram
connector also offers count interactions landing on older posts too, which
is why the Nov 3 sandbox read 202 on this per-post basis against 220 on the
activity basis. The per-post basis is the one the dashboard's post log can
reconcile against, so it is the one used.)

Provenance: adapted unchanged in behaviour from the Nov 3, 2026 sandbox
pipeline.

Usage: pull_instagram.py START_DATE END_DATE OUT.json   (dates YYYY-MM-DD)
"""
import json
import subprocess
import sys

from .normalize import make_post

CLI = '/opt/hatch/bin/instagram-cli'
ACCOUNT = '17841405469221573'  # @integrated.staffing
# A quarter holds ~25 posts at a 40-post page size; the bound exists so a
# connector cursor bug cannot loop forever. Hitting it raises, loudly.
MAX_PAGES = 10


def _run(args):
    r = subprocess.run([CLI] + args, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"instagram-cli failed: {' '.join(args[:2])} {r.stderr[:400]}")
    return json.loads(r.stdout)


def _metric(metrics, key, default=0):
    v = metrics.get(key)
    if isinstance(v, dict):
        return v.get('total') if v.get('total') is not None else default
    return v if isinstance(v, int) else default


def pull(start, end):
    """Return normalized Instagram posts published between start and end
    (inclusive, 'YYYY-MM-DD'). Raises RuntimeError if the connector fails."""
    raw, cursor = [], None
    for _ in range(MAX_PAGES):
        args = ['posts', '--account-id', ACCOUNT, '--since', start, '--until', end,
                '--sort-order', 'asc', '--limit', '40', '--post-types', 'POST,REEL']
        if cursor:
            args += ['--after', cursor]
        d = _run(args)
        raw.extend(d.get('posts', []))
        cursor = d.get('next_cursor')
        if not d.get('has_next_page') or not cursor:
            break
    else:
        raise RuntimeError(f'instagram-cli still had pages after {MAX_PAGES}; '
                           'refusing to map a truncated pull')

    kept = []
    for p in raw:
        pid = p['post_id']
        ins = _run(['individual-post-insights', '--account-id', ACCOUNT, '--post', pid])
        m = ins.get('metrics', {})
        created = (p.get('created_at') or '')  # "2026-09-01 06:26:26" local
        # Unique viewers moved keys between the Nov 3 sandbox run and
        # Nov 19, 2026: the connector now returns
        # instagram_organic_media_content_meta_viewer_count (a plain int)
        # and no longer returns instagram_media_impressions_unique at
        # all. Verified live Nov 19 against a post whose Nov 3 fixture
        # value (79) the new key reproduces exactly. Try the new key
        # first, fall back to the old one, so a connector revert does not
        # silently zero Instagram reach again.
        unique_viewers = _metric(m, 'instagram_organic_media_content_meta_viewer_count', None)
        if unique_viewers is None:
            unique_viewers = _metric(m, 'instagram_media_impressions_unique')
        kept.append(make_post(
            'instagram',
            created[:10],
            (p.get('post_caption') or '').split('\n')[0][:120],
            external_id=pid,
            time=created[11:16] if len(created) > 16 else None,
            url=p.get('url'),
            impressions=_metric(m, 'instagram_media_impressions_count'),
            unique_viewers=unique_viewers,
            reactions=_metric(m, 'ig_total_likes_count', p.get('likes', 0)),
            comments=_metric(m, 'ig_total_comments_count', p.get('comments', 0)),
            shares=_metric(m, 'ig_total_shares_count'),
            saves=_metric(m, 'ig_total_saves_count'),
            # Instagram exposes no click counts on this route.
            clicks=0,
            link_clicks=0,
        ))
    kept.sort(key=lambda x: (x['date'], x['time'] or ''))
    return kept


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    start, end, out_path = argv
    posts = pull(start, end)
    with open(out_path, 'w') as f:
        json.dump(posts, f, indent=1)
    print(f'instagram: {len(posts)} posts -> {out_path}')


if __name__ == '__main__':
    main()
