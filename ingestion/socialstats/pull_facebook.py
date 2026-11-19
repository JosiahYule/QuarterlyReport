#!/usr/bin/env python3
"""Pull Integrated Staffing Facebook Page posts for a window via facebook-cli.

Emits normalized posts (see normalize.py): one record per post published in
the window, with lifetime metrics as returned by the connector. The window
filter is applied here, on the parsed publish date, because the connector's
own time-range options are relative presets (LAST_90D), not calendar ranges.

Provenance: adapted unchanged in behaviour from the Nov 3, 2026 sandbox
pipeline, whose Facebook numbers matched the hand counts exactly
(110 reactions / 2 comments / 17 shares / 3 saves for the quarter to Nov 3).

Usage: pull_facebook.py START_DATE END_DATE OUT.json   (dates YYYY-MM-DD)
"""
import json
import re
import subprocess
import sys

from .normalize import make_post

CLI = '/opt/hatch/bin/facebook-cli'
PAGE = '332201010256425'  # Integrated Staffing Facebook Page
FIELDS = 'views,unique_viewers,engagements,engagements_including_clicks,clicks,link_clicks,saves'
MONTHS = {m: i + 1 for i, m in enumerate(['January', 'February', 'March', 'April', 'May', 'June',
                                          'July', 'August', 'September', 'October', 'November', 'December'])}
# The connector pages 10 posts at a time and a quarter holds ~35; 10 pages is
# a generous bound, and a run that hits it with a cursor still live is a bug
# worth surfacing rather than a quarter silently truncated.
MAX_PAGES = 10


def _num(s):
    return int(str(s).replace(',', '')) if s not in (None, '') else 0


def pull(start, end):
    """Return normalized Facebook posts published between start and end
    (inclusive, 'YYYY-MM-DD'). Raises RuntimeError if the connector fails."""
    start_t = tuple(int(x) for x in start.split('-'))
    end_t = tuple(int(x) for x in end.split('-'))

    raw, cursor = [], None
    for _ in range(MAX_PAGES):
        cmd = [CLI, 'pages', 'posts', 'list', '--page-id', PAGE, '--time-range', 'LAST_90D',
               '--fields', FIELDS, '--limit', '10']
        if cursor:
            cmd += ['--cursor', cursor]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f'facebook-cli failed: {r.stderr[:400]}')
        d = json.loads(r.stdout)
        raw.extend(d.get('results', []))
        cursor = d.get('cursor')
        if not cursor:
            break
    else:
        raise RuntimeError(f'facebook-cli still had a cursor after {MAX_PAGES} pages; '
                           'refusing to map a truncated pull')

    kept = []
    for p in raw:
        txt = p['metadata'].get('metadata_text') or ''
        m = re.search(r'(\w+) (\d{1,2}), (\d{4}) at (\d{1,2}):(\d{2})\s*(AM|PM)', txt)
        if not m:
            continue
        ymd = (int(m.group(3)), MONTHS[m.group(1)], int(m.group(2)))
        if not (start_t <= ymd <= end_t):
            continue
        hour = int(m.group(4)) % 12 + (12 if m.group(6) == 'PM' else 0)
        act = {a['field']: _num(a['rendered_text']) for a in p.get('activity', [])}
        met = {x['field']: _num(x['rendered_text']) for x in p.get('metrics', [])}
        kept.append(make_post(
            'facebook',
            f'{ymd[0]:04d}-{ymd[1]:02d}-{ymd[2]:02d}',
            (p['metadata'].get('caption_excerpt') or '').split('\n')[0][:120],
            external_id=p.get('object_id'),
            time=f'{hour:02d}:{m.group(5)}',
            url=f"https://www.facebook.com/{p.get('object_id')}",
            impressions=met.get('views', 0),
            unique_viewers=met.get('unique_viewers', 0),
            reactions=act.get('reactions', 0),
            comments=act.get('comment_count', 0),
            shares=act.get('shares', 0),
            saves=met.get('saves', 0),
            clicks=met.get('clicks', 0),
            link_clicks=met.get('link_clicks', 0),
        ))
    kept.sort(key=lambda x: (x['date'], x['time']))
    return kept


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    start, end, out_path = argv
    posts = pull(start, end)
    with open(out_path, 'w') as f:
        json.dump(posts, f, indent=1)
    print(f'facebook: {len(posts)} posts -> {out_path}')


if __name__ == '__main__':
    main()
