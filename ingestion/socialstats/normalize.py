"""The one normalized post shape every source is converted into.

Facebook, Instagram and LinkedIn disagree about everything: field names,
whether a post has a URL, whether clicks exist. Each source module converts
its platform's data into the dict built here, exactly once, at the boundary;
the mapper downstream never sees a platform's native shape.

A normalized post is a plain dict with these keys:

    platform        'facebook' | 'instagram' | 'linkedin'
    external_id     platform post id, or None when the source has none
    date            'YYYY-MM-DD', the publish date
    time            'HH:MM' or None
    title           first line of the caption, or the fallback below
    url             post URL or None
    impressions     lifetime views/impressions
    unique_viewers  lifetime unique viewers (0 when the source cannot say)
    reactions       lifetime reactions (LinkedIn reactions, FB reactions,
                    Instagram likes: the schema has one bucket for all three)
    comments        lifetime comments
    shares          lifetime shares (LinkedIn reposts land here)
    saves           lifetime saves (NOT part of engagements; the schema has
                    no column for saves. The mapper counts them in its run
                    summary so the exclusion is visible, never silent.)
    clicks          lifetime clicks of every kind (0 when unknown)
    link_clicks     lifetime link clicks specifically (0 when the source
                    does not separate them; LinkedIn does not)
"""
from datetime import date as _date

PLATFORMS = ('linkedin', 'facebook', 'instagram')
DISPLAY_NAME = {'linkedin': 'LinkedIn', 'facebook': 'Facebook', 'instagram': 'Instagram'}

_INT_FIELDS = ('impressions', 'unique_viewers', 'reactions', 'comments',
               'shares', 'saves', 'clicks', 'link_clicks')


def fallback_title(platform, date_str):
    """Title for a post whose source gave no caption text.

    The Nov 3 sandbox run found the failure this prevents: a Facebook video
    post with an empty caption excerpt could not merge with its cross-posts
    and would have landed in the post log with a blank name. A stable
    platform + date title gives the merge a real key to work with and the
    log a readable row. It is deliberately plain: a human scanning the log
    should see at a glance that the caption was never captured.
    """
    return f'{DISPLAY_NAME[platform]} post, {date_str}'


def make_post(platform, date, title, *, external_id=None, time=None, url=None, **metrics):
    """Build one normalized post, applying the title fallback.

    Raises ValueError on a platform or date the rest of the pipeline cannot
    handle: bad source data should stop the run here, at the boundary, not
    surface later as a wrong number in a quarterly report.
    """
    if platform not in PLATFORMS:
        raise ValueError(f'unknown platform: {platform!r}')
    try:
        _date.fromisoformat(date)
    except (TypeError, ValueError):
        raise ValueError(f'{platform}: bad publish date: {date!r}') from None
    title = (title or '').strip()
    post = {
        'platform': platform,
        'external_id': external_id,
        'date': date,
        'time': time,
        'title': title if title else fallback_title(platform, date),
        'url': url,
    }
    for field in _INT_FIELDS:
        value = metrics.get(field, 0)
        # bool is an int subclass; a True in a metric field is a source bug.
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError(f'{platform} post on {date}: {field} is not an int: {value!r}')
        if value < 0:
            raise ValueError(f'{platform} post on {date}: {field} is negative: {value}')
        post[field] = value
    return post


def engagements(post):
    """The one engagement definition, used by the mapper everywhere.

    Engagements = reactions + comments + shares. Saves are excluded because
    the schema has no column for them; see the module docstring.
    """
    return post['reactions'] + post['comments'] + post['shares']
