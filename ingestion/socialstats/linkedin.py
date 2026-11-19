"""Import the LinkedIn dataset. LinkedIn has no API route available to us,
so the data arrives as a file a browser pull of the Page analytics produces.

Two file shapes are accepted:

1. CSV (current browser pulls): one row per post, columns
   date,impressions,reactions,comments,reposts, with an optional post
   column holding the caption text. Pulls saved before the caption column
   was added simply omit it; those posts get the normalize.py fallback
   title. The CSV carries no clicks, no follower total and no period
   reach, so the account figures come back None and the writer carries
   the stored values through (see writer.py).
2. JSON (the Nov 3, 2026 sandbox capture): {followers_total,
   period_activity: {members_reached_organic, ...}, posts: [{date,
   title, impressions, reactions, comments, reposts, clicks}]}. Kept
   because it is the dataset the counting rules were proven against,
   and a fuller browser capture may return to this shape.

Both return (posts, account) where posts are normalized (normalize.py)
and account is {'followers': int|None, 'members_reached_organic':
int|None}. A None is a statement, not an oversight: it tells the writer
"this source cannot say, keep what is stored" instead of overwriting a
real figure with a zero.
"""
import csv
import json

from .normalize import make_post

_ACCOUNT_UNKNOWN = {'followers': None, 'members_reached_organic': None}


def _int(cell, field, date_str):
    try:
        return int(str(cell).replace(',', ''))
    except (TypeError, ValueError):
        raise ValueError(f'linkedin post on {date_str}: {field} is not an int: {cell!r}') from None


def from_csv(path):
    """Read a browser-pull CSV. Returns (posts, account-with-Nones)."""
    with open(path, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise ValueError(f'{path}: no post rows')
    missing = {'date', 'impressions', 'reactions', 'comments', 'reposts'} - set(rows[0])
    if missing:
        raise ValueError(f'{path}: missing columns: {sorted(missing)}')
    posts = []
    for row in rows:
        date = (row['date'] or '').strip()
        posts.append(make_post(
            'linkedin', date, (row.get('post') or ''),
            impressions=_int(row['impressions'], 'impressions', date),
            reactions=_int(row['reactions'], 'reactions', date),
            comments=_int(row['comments'], 'comments', date),
            shares=_int(row['reposts'], 'reposts', date),
            # Not in the CSV: unique viewers, saves, clicks. Zeros here are
            # the normalized shape's "cannot say", and the mapper's rules
            # (README) only spend clicks where a source actually reports
            # them; LinkedIn's contribution to link clicks is lost on the
            # CSV route and the platform note says so.
            unique_viewers=0, saves=0, clicks=0, link_clicks=0,
        ))
    posts.sort(key=lambda p: p['date'])
    return posts, dict(_ACCOUNT_UNKNOWN)


def from_json(path):
    """Read the Nov 3-style JSON capture. Returns (posts, account)."""
    with open(path, encoding='utf-8') as f:
        raw = json.load(f)
    posts = []
    for p in raw['posts']:
        clicks = p.get('clicks', 0)
        posts.append(make_post(
            'linkedin', p['date'], p.get('title', ''),
            impressions=p['impressions'], reactions=p['reactions'],
            comments=p['comments'], shares=p['reposts'],
            unique_viewers=0, saves=0,
            # LinkedIn does not separate link clicks from other clicks, so
            # its clicks count as link clicks in the KPI (README rule).
            clicks=clicks, link_clicks=clicks,
        ))
    posts.sort(key=lambda p: p['date'])
    period = raw.get('period_activity') or {}
    account = {
        'followers': raw.get('followers_total'),
        'members_reached_organic': period.get('members_reached_organic'),
    }
    return posts, account


def load(path):
    """Dispatch on file extension: .csv or .json."""
    if path.endswith('.csv'):
        return from_csv(path)
    if path.endswith('.json'):
        return from_json(path)
    raise ValueError(f'{path}: expected a .csv or .json LinkedIn dataset')
